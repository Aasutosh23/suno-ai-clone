"use client";

import {
  Heart,
  Loader2,
  Mic,
  Music,
  Play,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Song } from "../../../generated/prisma";
import { toast } from "sonner";
import { setFollowStatus, toggleLikeSong } from "~/actions/song";
import { getPlayUrl } from "~/actions/generation";
import { usePlayerStore } from "~/stores/use-player-store";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { SongArtwork } from "./song-artwork";

type SongWithRelation = Song & {
  user: {
    id: string;
    name: string | null;
    image: string | null;
    _count: { followers: number; following: number };
  };
  _count: { likes: number };
  likes: { userId: string }[];
  categories: Category[];
  thumbnailUrl: string | null;
  isFollowingCreator: boolean;
  isOwnSong: boolean;
};

const cardColors = [
  "from-rose-100 to-orange-50 border-rose-200 dark:from-rose-500/20 dark:to-orange-500/10 dark:border-rose-500/30",
  "from-violet-100 to-fuchsia-50 border-violet-200 dark:from-violet-500/20 dark:to-fuchsia-500/10 dark:border-violet-500/30",
  "from-sky-100 to-cyan-50 border-sky-200 dark:from-sky-500/20 dark:to-cyan-500/10 dark:border-sky-500/30",
  "from-emerald-100 to-lime-50 border-emerald-200 dark:from-emerald-500/20 dark:to-lime-500/10 dark:border-emerald-500/30",
  "from-amber-100 to-yellow-50 border-amber-200 dark:from-amber-500/20 dark:to-yellow-500/10 dark:border-amber-500/30",
  "from-indigo-100 to-purple-50 border-indigo-200 dark:from-indigo-500/20 dark:to-purple-500/10 dark:border-indigo-500/30",
];

function getCardColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return cardColors[hash % cardColors.length]!;
}

function timeAgo(date: Date) {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, unitSeconds] of units) {
    if (seconds >= unitSeconds) {
      return formatter.format(-Math.floor(seconds / unitSeconds), unit);
    }
  }
  return "just now";
}

export function SongCard({ song }: { song: SongWithRelation }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(song.likes.length > 0);
  const [likesCount, setLikesCount] = useState(song._count.likes);
  const [isFollowing, setIsFollowing] = useState(song.isFollowingCreator);
  const [followersCount, setFollowersCount] = useState(
    song.user._count.followers,
  );
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const setTrack = usePlayerStore((state) => state.setTrack);
  const router = useRouter();

  useEffect(() => {
    setIsFollowing(song.isFollowingCreator);
    setFollowersCount(song.user._count.followers);
  }, [song.isFollowingCreator, song.user._count.followers]);

  const handlePlay = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const playUrl = await getPlayUrl(song.id);
      setTrack({
        id: song.id,
        title: song.title,
        url: playUrl,
        artwork: song.thumbnailUrl,
        prompt: song.prompt,
        createdByUsername: song.user.name,
      });
    } catch (error) {
      console.error("[home] Failed to play song", { songId: song.id, error });
      toast.error("Unable to play this song. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLike = async () => {
    const previousLiked = isLiked;
    setIsLiked(!previousLiked);
    setLikesCount((count) => count + (previousLiked ? -1 : 1));

    try {
      await toggleLikeSong(song.id);
    } catch (error) {
      console.error("[home] Failed to update song like", {
        songId: song.id,
        error,
      });
      setIsLiked(previousLiked);
      setLikesCount((count) => count + (previousLiked ? 1 : -1));
      toast.error("Unable to update your like. Please try again.");
    }
  };

  const handleFollow = async () => {
    if (isFollowLoading || song.isOwnSong) return;

    const shouldFollow = !isFollowing;
    setIsFollowing(shouldFollow);
    setFollowersCount((count) => count + (shouldFollow ? 1 : -1));
    setIsFollowLoading(true);

    try {
      const count = await setFollowStatus(song.user.id, shouldFollow);
      setFollowersCount(count);
      router.refresh();
    } catch (error) {
      console.error("[explore] Failed to update creator follow", {
        userId: song.user.id,
        error,
      });
      setIsFollowing(!shouldFollow);
      setFollowersCount((count) => count + (shouldFollow ? -1 : 1));
      toast.error("Unable to update your follow. Please try again.");
    } finally {
      setIsFollowLoading(false);
    }
  };

  const tags = song.categories.slice(0, 2).map((category) => category.name);
  const description = song.prompt?.trim();

  return (
    <article
      className={`@container flex min-h-0 min-w-0 flex-col gap-2 rounded-2xl border bg-linear-to-br p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${getCardColor(song.id)}`}
    >
      {/* Artwork + Title */}
      <div className="flex min-w-0 items-start gap-2">
        <SongArtwork
          className="size-12 shrink-0 rounded-xl shadow-sm @min-[16rem]:size-16"
          src={song.thumbnailUrl}
          alt={`${song.title} artwork`}
        >
          {song.published && (
            <span
              title="Published"
              className="absolute top-1 right-1 z-10 size-2.5 rounded-full bg-emerald-400 ring-2 ring-white"
            />
          )}
        </SongArtwork>

        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2 text-xs leading-snug font-semibold wrap-break-word @min-[16rem]:text-sm"
            title={song.title}
          >
            {song.title}
          </h3>
        </div>
      </div>

      {/* Creator row */}
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar className="size-5 shrink-0">
          <AvatarImage
            src={song.user.image ?? undefined}
            alt={song.user.name ?? "Creator"}
          />
          <AvatarFallback className="text-[10px]">
            {(song.user.name && song.user.name.length > 0
              ? song.user.name
              : "C"
            )
              .slice(0, 1)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium leading-tight">
            {song.user.name && song.user.name.length > 0
              ? song.user.name
              : "Unknown creator"}
          </p>
          <p className="text-muted-foreground truncate text-[10px] leading-tight">
            {followersCount} followers
          </p>
        </div>
        {!song.isOwnSong && (
          <Button
            variant={isFollowing ? "secondary" : "outline"}
            size="icon-sm"
            disabled={isFollowLoading}
            aria-label={
              isFollowing
                ? `Unfollow ${song.user.name ?? "creator"}`
                : `Follow ${song.user.name ?? "creator"}`
            }
            onClick={() => void handleFollow()}
            className="size-6 shrink-0 p-0"
          >
            {isFollowLoading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isFollowing ? (
              <UserCheck className="size-3" />
            ) : (
              <UserPlus className="size-3" />
            )}
          </Button>
        )}
      </div>

      {/* Tags */}
      <div className="flex min-h-4 flex-wrap gap-1">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded-full border border-white/70 bg-white/60 px-2 py-0 text-[10px] font-medium dark:border-white/10 dark:bg-white/10"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground text-[10px]">
            {song.instrumental ? "Instrumental" : "No tags"}
          </span>
        )}
      </div>

      {/* Prompt description — hidden on very small cards */}
      {description && (
        <p className="text-muted-foreground line-clamp-1 hidden text-[10px] leading-relaxed @min-[14rem]:block">
          {description}
        </p>
      )}

      {/* Type row */}
      <div className="text-muted-foreground flex items-center justify-between gap-1 text-[10px]">
        <span className="truncate" suppressHydrationWarning>
          {timeAgo(song.createdAt)}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {song.instrumental ? (
            <Music className="size-3" />
          ) : (
            <Mic className="size-3" />
          )}
          <span className="hidden @min-[12rem]:inline">
            {song.instrumental ? "Instr." : "Vocals"}
          </span>
        </span>
      </div>

      {/* Footer: listens + like + play */}
      <div className="mt-auto flex items-center gap-1 border-t border-black/10 pt-2 dark:border-white/10">
        <span className="text-muted-foreground mr-auto text-[10px]">
          {song.listenCount} listens
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={isLiked ? "Unlike song" : "Like song"}
          onClick={() => void handleLike()}
          className="h-7 gap-0.5 px-1.5"
        >
          <Heart
            className={`size-3.5 ${isLiked ? "fill-rose-500 text-rose-500" : ""}`}
          />
          <span className="text-[10px]">{likesCount}</span>
        </Button>
        <Button
          size="icon"
          aria-label={`Play ${song.title}`}
          disabled={isLoading}
          onClick={() => void handlePlay()}
          className="size-7 rounded-full"
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="ml-0.5 size-3.5 fill-current" />
          )}
        </Button>
      </div>
    </article>
  );
}
