import type { Prisma } from "../../generated/prisma";
import { env } from "~/env";
import { db } from "~/server/db";

export const MAX_SONGS_PER_USER = 5;

export type QuotaFailureCode =
  "USER_LIMIT_REACHED" | "IP_LIMIT_REACHED" | "GLOBAL_LIMIT_REACHED";

export class QuotaLimitError extends Error {
  constructor(
    public readonly code: QuotaFailureCode,
    public readonly remaining?: number,
  ) {
    super(code);
    this.name = "QuotaLimitError";
  }
}

export function getUtcDayStart(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getDailyQuotaKeys(ipKey: string, date = new Date()) {
  const day = getUtcDayStart(date).toISOString().slice(0, 10);
  return {
    ip: `ip:${ipKey}:${day}`,
    global: `global:${day}`,
  };
}

async function reserveCounter(
  transaction: Prisma.TransactionClient,
  key: string,
  limit: number,
  amount: number,
  existingCount: number,
  failureCode: QuotaFailureCode,
) {
  await transaction.$executeRaw`
    INSERT INTO "QuotaCounter" ("key", "count", "updatedAt")
    VALUES (${key}, ${existingCount}, NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "count" = GREATEST("QuotaCounter"."count", EXCLUDED."count"),
        "updatedAt" = NOW()
  `;

  const reserved = await transaction.$executeRaw`
    UPDATE "QuotaCounter"
    SET "count" = "count" + ${amount}, "updatedAt" = NOW()
    WHERE "key" = ${key} AND "count" + ${amount} <= ${limit}
  `;

  if (reserved !== 1) {
    const counter = await transaction.quotaCounter.findUnique({
      where: { key },
      select: { count: true },
    });
    throw new QuotaLimitError(
      failureCode,
      Math.max(0, limit - (counter?.count ?? limit)),
    );
  }
}

export async function reserveGenerationSlots(
  transaction: Prisma.TransactionClient,
  {
    userId,
    ipKey,
    amount,
  }: {
    userId: string;
    ipKey: string;
    amount: number;
  },
) {
  const now = new Date();
  const dayStart = getUtcDayStart(now);
  const dailyKeys = getDailyQuotaKeys(ipKey, now);
  const userQuotaKey = `user:${userId}:total`;

  await transaction.$queryRaw`
    SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE
  `;

  const userSongs = await transaction.song.count({
    where: { userId, status: { not: "failed" }, quotaReleased: false },
  });
  const userCounter = await transaction.quotaCounter.findUnique({
    where: { key: userQuotaKey },
    select: { count: true },
  });
  const userUsed = Math.max(userSongs, userCounter?.count ?? 0);
  const remaining = Math.max(0, MAX_SONGS_PER_USER - userUsed);
  const reservedAmount = Math.min(amount, remaining);
  if (reservedAmount === 0) {
    throw new QuotaLimitError("USER_LIMIT_REACHED", remaining);
  }

  const ipSongs = await transaction.song.count({
    where: {
      quotaIpKey: dailyKeys.ip,
      quotaReleased: false,
      status: { not: "failed" },
    },
  });
  const globalSongs = await transaction.song.count({
    where: {
      createdAt: { gte: dayStart },
      quotaReleased: false,
      status: { not: "failed" },
    },
  });

  const ipCounter = await transaction.quotaCounter.findUnique({
    where: { key: dailyKeys.ip },
    select: { count: true },
  });
  const globalCounter = await transaction.quotaCounter.findUnique({
    where: { key: dailyKeys.global },
    select: { count: true },
  });
  const ipRemaining = Math.max(
    0,
    env.GENERATIONS_PER_IP_PER_DAY - Math.max(ipSongs, ipCounter?.count ?? 0),
  );
  const globalRemaining = Math.max(
    0,
    env.GLOBAL_GENERATIONS_PER_DAY -
      Math.max(globalSongs, globalCounter?.count ?? 0),
  );
  const actualAmount = Math.min(reservedAmount, ipRemaining, globalRemaining);
  if (actualAmount === 0) {
    if (ipRemaining === 0) throw new QuotaLimitError("IP_LIMIT_REACHED");
    throw new QuotaLimitError("GLOBAL_LIMIT_REACHED");
  }

  await reserveCounter(
    transaction,
    userQuotaKey,
    MAX_SONGS_PER_USER,
    actualAmount,
    userUsed,
    "USER_LIMIT_REACHED",
  );
  await reserveCounter(
    transaction,
    dailyKeys.ip,
    env.GENERATIONS_PER_IP_PER_DAY,
    actualAmount,
    ipSongs,
    "IP_LIMIT_REACHED",
  );
  await reserveCounter(
    transaction,
    dailyKeys.global,
    env.GLOBAL_GENERATIONS_PER_DAY,
    actualAmount,
    globalSongs,
    "GLOBAL_LIMIT_REACHED",
  );

  return {
    userQuotaKey,
    ipQuotaKey: dailyKeys.ip,
    globalQuotaKey: dailyKeys.global,
    amount: actualAmount,
    remaining: remaining - actualAmount,
  };
}

export async function getUserGenerationRemaining(userId: string) {
  const [songCount, counter] = await Promise.all([
    db.song.count({
      where: { userId, status: { not: "failed" }, quotaReleased: false },
    }),
    db.quotaCounter.findUnique({
      where: { key: `user:${userId}:total` },
      select: { count: true },
    }),
  ]);
  return Math.max(
    0,
    MAX_SONGS_PER_USER - Math.max(songCount, counter?.count ?? 0),
  );
}

export async function releaseSongQuota(
  songId: string,
  failureStatus = "failed",
) {
  await db.$transaction(async (transaction) => {
    const song = await transaction.song.findUnique({
      where: { id: songId },
      select: {
        quotaReleased: true,
        quotaUserKey: true,
        quotaIpKey: true,
        quotaGlobalKey: true,
        s3Key: true,
        status: true,
      },
    });

    if (
      !song ||
      song.quotaReleased ||
      song.s3Key ||
      song.status === "processed"
    ) {
      return;
    }

    const updated = await transaction.song.updateMany({
      where: { id: songId, quotaReleased: false },
      data: { quotaReleased: true, status: failureStatus },
    });
    if (updated.count !== 1) return;

    for (const key of [
      song.quotaUserKey,
      song.quotaIpKey,
      song.quotaGlobalKey,
    ]) {
      if (!key) continue;
      await transaction.quotaCounter.updateMany({
        where: { key, count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      });
    }
  });
}
