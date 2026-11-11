"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPresignedUrl } from "~/actions/generation";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";

export async function getUserTracks() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const songs = await db.song.findMany({
    where: { userId: session.user.id },
    include: {
      user: {
        select: { name: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return Promise.all(
    songs.map(async (song) => ({
      id: song.id,
      title: song.title,
      createdAt: song.createdAt,
      instrumental: song.instrumental,
      prompt: song.prompt,
      lyrics: song.lyrics,
      describedLyrics: song.describedLyrics,
      fullDescribedSong: song.fullDescribedSong,
      thumbnailUrl: song.thumbnailS3Key
        ? await getPresignedUrl(song.thumbnailS3Key)
        : null,
      playUrl: null,
      hasAudio: song.s3Key !== null,
      status: song.status,
      createdByUserName: song.user?.name,
      published: song.published,
    })),
  );
}

export async function setPublishedStatus(songId: string, published: boolean) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  await db.song.update({
    where: {
      id: songId,
      userId: session.user.id,
    },
    data: {
      published,
    },
  });

  revalidatePath("/create");
}

export async function renameSong(songId: string, newTitle: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  await db.song.update({
    where: {
      id: songId,
      userId: session.user.id,
    },
    data: {
      title: newTitle,
    },
  });

  revalidatePath("/create");
}

export async function toggleLikeSong(songId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const existingLike = await db.like.findUnique({
    where: {
      userId_songId: {
        userId: session.user.id,
        songId,
      },
    },
  });

  if (existingLike) {
    await db.like.delete({
      where: {
        userId_songId: {
          userId: session.user.id,
          songId,
        },
      },
    });
  } else {
    await db.like.create({
      data: {
        userId: session.user.id,
        songId,
      },
    });
  }

  revalidatePath("/");
}

export async function setFollowStatus(
  targetUserId: string,
  shouldFollow: boolean,
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");
  if (targetUserId === session.user.id) {
    throw new Error("You cannot follow your own account");
  }

  const follow = {
    followerId_followingId: {
      followerId: session.user.id,
      followingId: targetUserId,
    },
  };

  if (shouldFollow) {
    await db.follow.upsert({
      where: follow,
      create: {
        followerId: session.user.id,
        followingId: targetUserId,
      },
      update: {},
    });
  } else {
    await db.follow.deleteMany({
      where: {
        followerId: session.user.id,
        followingId: targetUserId,
      },
    });
  }

  revalidatePath("/explore");
  return db.follow.count({
    where: { followingId: targetUserId },
  });
}
