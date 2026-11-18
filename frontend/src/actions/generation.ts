"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { inngest } from "~/inngest/client";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import { getSongTitle } from "~/lib/song-title";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
      songs: Awaited<ReturnType<typeof createQueuedSongs>>;
    }
  | {
      ok: false;
      message: string;
    };

async function createQueuedSongs(
  generateRequest: GenerateRequest,
  userId: string,
  userName: string | null,
) {
  let title = "Untitled";
  if (generateRequest.describedLyrics) title = generateRequest.describedLyrics;
  if (generateRequest.fullDescribedSong)
    title = generateRequest.fullDescribedSong;
  title = getSongTitle(title);
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const guidanceScales = [7.5, 15];
  const createdSongs = await Promise.all(
    guidanceScales.map((guidanceScale) =>
      db.song.create({
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
        },
      }),
    ),
  );

  return createdSongs.map((song) => ({
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
  }));
}

// Each generation creates 2 song variants. 5 generations = 10 songs max.
export const GENERATION_LIMIT = 5;
const SONGS_PER_GENERATION = 2;
const TOTAL_SONGS_LIMIT = GENERATION_LIMIT * SONGS_PER_GENERATION;

export async function getUserGenerationCount(userId: string) {
  const count = await db.song.count({ where: { userId } });
  return {
    songsCount: count,
    generationsUsed: Math.ceil(count / SONGS_PER_GENERATION),
    generationsLeft: Math.max(
      0,
      GENERATION_LIMIT - Math.ceil(count / SONGS_PER_GENERATION),
    ),
    limitReached: count >= TOTAL_SONGS_LIMIT,
  };
}

// Server action for the UI — fetches the current user's generation count
export async function getMyGenerationCount() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  return getUserGenerationCount(session.user.id);
}

export async function generateSong(
  generateRequest: GenerateRequest,
): Promise<GenerateSongResult> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) redirect("/auth/sign-in");

  // ── Generation limit check ──────────────────────────────────────────────
  const { limitReached, generationsUsed } = await getUserGenerationCount(
    session.user.id,
  );
  if (limitReached) {
    return {
      ok: false,
      message: `You've reached the ${GENERATION_LIMIT}-generation limit. Each account can generate up to ${GENERATION_LIMIT} songs.`,
    };
  }
  // ────────────────────────────────────────────────────────────────────────

  console.info("[generation] Generation check passed", {
    userId: session.user.id,
    generationsUsed,
    limit: GENERATION_LIMIT,
  });

  let queued: Awaited<ReturnType<typeof createQueuedSongs>>;
  try {
    queued = await createQueuedSongs(
      generateRequest,
      session.user.id,
      session.user.name ?? null,
    );
  } catch (error) {
    console.error("[generation] Failed to create songs", error);
    return {
      ok: false,
      message: "Unable to create your songs. Please try again.",
    };
  }

  try {
    await inngest.send(
      queued.map((song) => ({
        name: "generate-song-event",
        data: {
          songId: song.id,
          userId: session.user.id,
        },
      })),
    );
  } catch (error) {
    console.error("[generation] Failed to queue songs in Inngest", error);
    return {
      ok: false,
      message: "Unable to queue your songs. Please try again.",
    };
  }

  console.info("[generation] Songs queued", {
    songIds: queued.map((song) => song.id),
  });
  revalidatePath("/create");
  return {
    ok: true,
    songs: queued,
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
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY_ID,
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
