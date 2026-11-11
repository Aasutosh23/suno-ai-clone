"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { generateSongEvent, inngest } from "~/inngest/client";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import { getSongTitle } from "~/lib/song-title";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getClientIp,
  getIpBucketKey,
  verifyTurnstileToken,
} from "~/lib/abuse-protection";
import {
  QuotaLimitError,
  getUserGenerationRemaining,
  releaseSongQuota,
  reserveGenerationSlots,
} from "~/lib/generation-quota";

export interface GenerateRequest {
  prompt?: string;
  lyrics?: string;
  fullDescribedSong?: string;
  describedLyrics?: string;
  instrumental?: boolean;
}

export type GenerateSongResult =
  | {
      ok: true;
      songs: Awaited<ReturnType<typeof createQueuedSongs>>["songs"];
      remaining: number;
    }
  | {
      ok: false;
      code:
        | "EMAIL_NOT_VERIFIED"
        | "TURNSTILE_REQUIRED"
        | "TURNSTILE_INVALID"
        | "IP_UNAVAILABLE"
        | "USER_LIMIT_REACHED"
        | "IP_LIMIT_REACHED"
        | "GLOBAL_LIMIT_REACHED"
        | "QUEUE_FAILED"
        | "CONFIGURATION_ERROR"
        | "INVALID_REQUEST";
      message: string;
      remaining?: number;
    };

async function createQueuedSongs(
  generateRequest: GenerateRequest,
  userId: string,
  userName: string | null,
  ipKey: string,
) {
  let title = "Untitled";
  if (generateRequest.describedLyrics) title = generateRequest.describedLyrics;
  if (generateRequest.fullDescribedSong)
    title = generateRequest.fullDescribedSong;
  title = getSongTitle(title);
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const songs = await db.$transaction(async (transaction) => {
    const reservation = await reserveGenerationSlots(transaction, {
      userId,
      ipKey,
      amount: 2,
    });
    const guidanceScales = [7.5, 15].slice(0, reservation.amount);
    const createdSongs = await Promise.all(
      guidanceScales.map((guidanceScale) =>
        transaction.song.create({
          data: {
            userId,
            title,
            prompt: generateRequest.prompt,
            lyrics: generateRequest.lyrics,
            describedLyrics: generateRequest.describedLyrics,
            fullDescribedSong: generateRequest.fullDescribedSong,
            instrumental: generateRequest.instrumental,
            guidanceScale,
            audioDuration: 180,
            quotaUserKey: reservation.userQuotaKey,
            quotaIpKey: reservation.ipQuotaKey,
            quotaGlobalKey: reservation.globalQuotaKey,
          },
        }),
      ),
    );

    return { createdSongs, remaining: reservation.remaining };
  });

  return {
    songs: songs.createdSongs.map((song) => ({
      id: song.id,
      title: song.title,
      createdAt: song.createdAt,
      instrumental: song.instrumental,
      prompt: song.prompt,
      lyrics: song.lyrics,
      describedLyrics: song.describedLyrics,
      fullDescribedSong: song.fullDescribedSong,
      thumbnailUrl: null,
      playUrl: null,
      hasAudio: false,
      status: song.status,
      createdByUserName: userName,
      published: song.published,
    })),
    remaining: songs.remaining,
  };
}

const quotaErrorMessages = {
  USER_LIMIT_REACHED:
    "You’ve reached your limit of 5 songs. Failed generations don’t count.",
  IP_LIMIT_REACHED:
    "This network has reached today’s generation limit. Please try again tomorrow.",
  GLOBAL_LIMIT_REACHED:
    "The service has reached its daily generation limit. Please try again tomorrow.",
} satisfies Record<
  "USER_LIMIT_REACHED" | "IP_LIMIT_REACHED" | "GLOBAL_LIMIT_REACHED",
  string
>;

export async function generateSong(
  generateRequest: GenerateRequest,
  turnstileToken: string,
): Promise<GenerateSongResult> {
  if (
    !generateRequest ||
    typeof generateRequest !== "object" ||
    (generateRequest.prompt !== undefined &&
      (typeof generateRequest.prompt !== "string" ||
        generateRequest.prompt.length > 2000)) ||
    (generateRequest.lyrics !== undefined &&
      (typeof generateRequest.lyrics !== "string" ||
        generateRequest.lyrics.length > 10000)) ||
    (generateRequest.fullDescribedSong !== undefined &&
      (typeof generateRequest.fullDescribedSong !== "string" ||
        generateRequest.fullDescribedSong.length > 5000)) ||
    (generateRequest.describedLyrics !== undefined &&
      (typeof generateRequest.describedLyrics !== "string" ||
        generateRequest.describedLyrics.length > 5000)) ||
    (generateRequest.instrumental !== undefined &&
      typeof generateRequest.instrumental !== "boolean") ||
    typeof turnstileToken !== "string" ||
    turnstileToken.length > 4096
  ) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Invalid generation request. Please review your song details.",
    };
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) redirect("/auth/sign-in");
  if (!session.user.emailVerified) {
    return {
      ok: false,
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email address before creating songs.",
    };
  }

  const ip = getClientIp(requestHeaders);
  if (!ip) {
    return {
      ok: false,
      code: "IP_UNAVAILABLE",
      message: "Unable to verify your network address. Please retry.",
    };
  }
  if (!turnstileToken) {
    return {
      ok: false,
      code: "TURNSTILE_REQUIRED",
      message: "Complete the bot check before creating a song.",
    };
  }

  try {
    await verifyTurnstileToken(turnstileToken, ip, "generate");
  } catch (error) {
    console.error("[generation] Turnstile verification failed", error);
    return {
      ok: false,
      code: env.TURNSTILE_SECRET_KEY
        ? "TURNSTILE_INVALID"
        : "CONFIGURATION_ERROR",
      message: env.TURNSTILE_SECRET_KEY
        ? "Bot verification failed. Please try again."
        : "Turnstile is not configured on the server.",
    };
  }

  if (!env.GENERATION_API_TOKEN) {
    console.error("[generation] GENERATION_API_TOKEN is not configured");
    return {
      ok: false,
      code: "CONFIGURATION_ERROR",
      message: "Song generation is not configured on the server.",
    };
  }

  let queued: Awaited<ReturnType<typeof createQueuedSongs>>;
  try {
    queued = await createQueuedSongs(
      generateRequest,
      session.user.id,
      session.user.name ?? null,
      getIpBucketKey(ip),
    );
  } catch (error) {
    if (error instanceof QuotaLimitError) {
      return {
        ok: false,
        code: error.code,
        message: quotaErrorMessages[error.code],
        remaining: error.remaining,
      };
    }
    console.error("[generation] Failed to reserve song quota", error);
    return {
      ok: false,
      code: "QUEUE_FAILED",
      message: "Unable to create your songs. Please try again.",
    };
  }

  try {
    await inngest.send(
      queued.songs.map((song) => ({
        name: generateSongEvent.name,
        data: {
          songId: song.id,
          userId: session.user.id,
        },
      })),
    );
  } catch (error) {
    console.error("[generation] Failed to queue songs in Inngest", error);
    const refunds = await Promise.allSettled(
      queued.songs.map(async (song) => {
        await releaseSongQuota(song.id);
      }),
    );
    refunds.forEach((refund, index) => {
      if (refund.status === "rejected") {
        const error: unknown = refund.reason;
        console.error("[generation] Failed to refund a queued song slot", {
          songId: queued.songs[index]?.id,
          error,
        });
      }
    });
    return {
      ok: false,
      code: "QUEUE_FAILED",
      message: "Unable to queue your songs. Please try again.",
      remaining: await getUserGenerationRemaining(session.user.id),
    };
  }

  console.info("[generation] Songs queued", {
    songIds: queued.songs.map((song) => song.id),
  });
  revalidatePath("/create");
  return {
    ok: true,
    songs: queued.songs,
    remaining: queued.remaining,
  };
}

export async function getGenerationQuota() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) redirect("/auth/sign-in");

  return {
    remaining: await getUserGenerationRemaining(session.user.id),
    emailVerified: session.user.emailVerified,
  };
}

export async function getPlayUrl(songId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const song = await db.song.findFirst({
    where: {
      id: songId,
      OR: [{ userId: session.user.id }, { published: true }],
      s3Key: {
        not: null,
      },
    },
    select: {
      s3Key: true,
    },
  });

  if (!song?.s3Key) {
    throw new Error("Song audio is not available");
  }

  await db.song.update({
    where: {
      id: songId,
    },
    data: {
      listenCount: {
        increment: 1,
      },
    },
  });

  return await getPresignedUrl(song.s3Key);
}

export async function getSongThumbnailUrl(songId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const song = await db.song.findFirst({
    where: {
      id: songId,
      OR: [{ userId: session.user.id }, { published: true }],
    },
    select: {
      thumbnailS3Key: true,
    },
  });

  return song?.thumbnailS3Key
    ? await getPresignedUrl(song.thumbnailS3Key)
    : null;
}

export async function getPresignedUrl(key: string) {
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
  });
}
