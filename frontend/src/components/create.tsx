import { Music } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPresignedUrl } from "~/actions/generation";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import { SongCard } from "./home/song-card";

export default async function CreateSong() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/sign-in");
  }

  const songs = await db.song.findMany({
    where: {
      published: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          followers: {
            where: {
              followerId: session.user.id,
            },
            select: {
              followerId: true,
            },
          },
          _count: {
            select: {
              followers: true,
              following: true,
            },
          },
        },
      },
      _count: {
        select: {
          likes: true,
        },
      },
      likes: {
        where: {
          userId: session.user.id,
        },
        select: {
          userId: true,
        },
      },
      categories: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  const songsWithUrls = await Promise.all(
    songs.map(async (song) => {
      const thumbnailUrl = song.thumbnailS3Key
        ? await getPresignedUrl(song.thumbnailS3Key)
        : null;

      return {
        ...song,
        thumbnailUrl,
        isFollowingCreator: song.user.followers.length > 0,
        isOwnSong: song.user.id === session.user.id,
      };
    }),
  );

  const categorizedSongs = songsWithUrls.reduce<
    Record<string, Array<(typeof songsWithUrls)[number]>>
  >((acc, song) => {
    for (const category of song.categories) {
      (acc[category.name] ??= []).push(song);
    }
    return acc;
  }, {});

  const otherSongs = songsWithUrls.filter(
    (song) => song.categories.length === 0,
  );
  const hasNoPublishedSongs = songsWithUrls.length === 0;
  const songGridClass =
    "mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:group-data-[state=expanded]/sidebar-wrapper:grid-cols-3 lg:group-data-[state=collapsed]/sidebar-wrapper:grid-cols-4";

  return (
    <div className="space-y-6">
      {Object.entries(categorizedSongs)
        .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
        .map(([category, categorySongs]) => (
          <section key={category}>
            <h2 className="text-xl font-semibold">{category}</h2>
            <div className={songGridClass}>
              {categorySongs.map((song) => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          </section>
        ))}
      {otherSongs.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">More Songs</h2>
          <div className={songGridClass}>
            {otherSongs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>
        </section>
      )}
      {hasNoPublishedSongs && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-4 text-center">
          <Music className="text-muted-foreground h-20 w-20" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight">
            No Music here
          </h2>
          <p className="text-muted-foreground mt-2">
            There are no published songs available right now. Check back later!
          </p>
        </div>
      )}
    </div>
  );
}
