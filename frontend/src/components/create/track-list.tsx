"use client";

import {
  Clock,
  Coins,
  Download,
  Loader2,
  Mic,
  MoreHorizontal,
  Music,
  Pencil,
  Play,
  Search,
  XCircle,
} from "lucide-react";
import { Input } from "../ui/input";
import {
  startTransition,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { Button } from "../ui/button";
import { getPlayUrl, getSongThumbnailUrl } from "~/actions/generation";
import { Badge } from "../ui/badge";
import { getUserTracks, renameSong, setPublishedStatus } from "~/actions/song";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { RenameDialog } from "./rename-dialog";
import { toast } from "sonner";
import { getSongTitle } from "~/lib/song-title";
import { usePlayerStore } from "~/stores/use-player-store";
import { SongArtwork } from "~/components/home/song-artwork";

export interface Track {
  id: string;
  title: string | null;
  createdAt: Date;
  instrumental: boolean;
  prompt: string | null;
  lyrics: string | null;
  describedLyrics: string | null;
  fullDescribedSong: string | null;
  thumbnailUrl: string | null;
  playUrl: string | null;
  hasAudio: boolean;
  status: string | null;
  createdByUserName: string | null;
  published: boolean;
}

function timeAgo(date: Date | string) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds) {
      return rtf.format(Math.round(diff / seconds), unit);
    }
  }
  return "just now";
}

// Colourful card backgrounds (picked per song from its id, so a song keeps its colour)
const CARD_COLORS = [
  "from-rose-100 to-orange-50 border-rose-200 dark:from-rose-500/20 dark:to-orange-500/10 dark:border-rose-500/30",
  "from-violet-100 to-fuchsia-50 border-violet-200 dark:from-violet-500/20 dark:to-fuchsia-500/10 dark:border-violet-500/30",
  "from-sky-100 to-cyan-50 border-sky-200 dark:from-sky-500/20 dark:to-cyan-500/10 dark:border-sky-500/30",
  "from-emerald-100 to-lime-50 border-emerald-200 dark:from-emerald-500/20 dark:to-lime-500/10 dark:border-emerald-500/30",
  "from-amber-100 to-yellow-50 border-amber-200 dark:from-amber-500/20 dark:to-yellow-500/10 dark:border-amber-500/30",
  "from-indigo-100 to-purple-50 border-indigo-200 dark:from-indigo-500/20 dark:to-purple-500/10 dark:border-indigo-500/30",
];

function cardColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CARD_COLORS[hash % CARD_COLORS.length]!;
}

// Shared look for the non-playable (failed / processing / no audio) cards
const statusCardClass =
  "bg-card flex min-h-36 cursor-not-allowed flex-col justify-center gap-3 rounded-2xl border p-3 sm:p-4 shadow-sm";
const statusIconBoxClass =
  "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl";

export function TrackList({ tracks }: { tracks: Track[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleTracks, setVisibleTracks] = useState(tracks);

  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [trackToRename, setTrackToRename] = useState<Track | null>(null);
  const refreshInProgress = useRef(false);

  const setTrack = usePlayerStore((state) => state.setTrack);

  useEffect(() => {
    setVisibleTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    const handleSongsQueued = (event: Event) => {
      const queuedTracks = (event as CustomEvent<Track[]>).detail;
      setVisibleTracks((currentTracks) => [
        ...queuedTracks.filter(
          (queuedTrack) =>
            !currentTracks.some((track) => track.id === queuedTrack.id),
        ),
        ...currentTracks,
      ]);
    };

    window.addEventListener("songs-queued", handleSongsQueued);
    return () => window.removeEventListener("songs-queued", handleSongsQueued);
  }, []);

  const hasActiveGeneration = visibleTracks.some(
    (track) => track.status === "queued" || track.status === "processing",
  );

  const refreshTracks = useCallback(async (showSpinner = false) => {
    if (refreshInProgress.current) {
      if (showSpinner) setIsRefreshing(true);
      return;
    }

    refreshInProgress.current = true;
    if (showSpinner) setIsRefreshing(true);
    try {
      const updatedTracks = await getUserTracks();
      setVisibleTracks(updatedTracks);
    } catch (error) {
      console.error("[tracks] Failed to refresh songs", error);
      if (showSpinner) toast.error("Failed to refresh songs.");
    } finally {
      refreshInProgress.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasActiveGeneration) return;

    const refreshInterval = setInterval(() => {
      if (document.visibilityState === "visible") void refreshTracks();
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, [hasActiveGeneration, refreshTracks]);

  const [optimisticTracks, setOptimisticPublished] = useOptimistic(
    visibleTracks,
    (state, update: { id: string; published: boolean }) =>
      state.map((t) =>
        t.id === update.id ? { ...t, published: update.published } : t,
      ),
  );

  const handleTrackSelect = async (track: Track) => {
    if (loadingTrackId) return;
    setLoadingTrackId(track.id);
    try {
      const [playUrl, artwork] = await Promise.all([
        getPlayUrl(track.id),
        track.thumbnailUrl ? getSongThumbnailUrl(track.id) : null,
      ]);

      setTrack({
        id: track.id,
        title: track.title,
        url: playUrl,
        artwork,
        prompt: track.prompt,
        createdByUsername: track.createdByUserName,
      });
    } catch (error) {
      console.error("[tracks] Failed to load song audio", {
        songId: track.id,
        error,
      });
      toast.error("Song audio is not available.");
    } finally {
      setLoadingTrackId(null);
    }
  };

  const filteredTracks = optimisticTracks.filter(
    (track) =>
      (track.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (track.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  );

  const getPromptTags = (prompt: string | null) =>
    (prompt ?? "")
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3 sm:px-1">
          <div className="relative max-w-md flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-10 pl-10"
            />
          </div>
          <Button
            disabled={isRefreshing}
            variant="outline"
            className="h-10 cursor-pointer px-5"
            onClick={() => refreshTracks(true)}
          >
            {isRefreshing && <Loader2 className="animate-spin" />}
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {/* 2 cards per row on phones/tablets, 3 on desktop */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {filteredTracks.length > 0 ? (
            filteredTracks.map((track) => {
              const promptTags = getPromptTags(track.prompt);
              const description = [
                track.fullDescribedSong,
                track.describedLyrics,
                track.lyrics,
              ].find((value) => value != null && value.length > 0);

              switch (track.status) {
                case "failed":
                  return (
                    <div key={track.id} className={statusCardClass}>
                      <div
                        className={`${statusIconBoxClass} bg-destructive/10`}
                      >
                        <XCircle className="text-destructive h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-destructive line-clamp-2 text-base font-semibold">
                          Generation failed
                        </h3>
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          Please try creating the song again.
                        </p>
                      </div>
                    </div>
                  );

                case "no credits":
                  return (
                    <div key={track.id} className={statusCardClass}>
                      <div className={`${statusIconBoxClass} bg-amber-500/10`}>
                        <Coins className="h-6 w-6 text-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-base font-semibold text-amber-600">
                          Not enough credits
                        </h3>
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          Please purchase more credits to generate this song.
                        </p>
                      </div>
                    </div>
                  );

                case "queued":
                case "processing":
                  return (
                    <div key={track.id} className={statusCardClass}>
                      <div className={`${statusIconBoxClass} bg-muted`}>
                        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-muted-foreground line-clamp-2 text-base font-semibold">
                          Processing song...
                        </h3>
                        <p className="text-muted-foreground line-clamp-2 text-sm">
                          Checking for updates...
                        </p>
                      </div>
                    </div>
                  );

                default:
                  if (!track.hasAudio) {
                    return (
                      <div key={track.id} className={statusCardClass}>
                        <div className={`${statusIconBoxClass} bg-muted`}>
                          <Music className="text-muted-foreground h-6 w-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-muted-foreground line-clamp-2 text-base font-semibold">
                            {getSongTitle(track.title)}
                          </h3>
                          <p className="text-muted-foreground line-clamp-2 text-sm">
                            Audio is not available for this song.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={track.id}
                      className={`group @container flex cursor-pointer flex-col gap-3 rounded-2xl border bg-linear-to-br p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4 2xl:p-5 ${cardColor(track.id)}`}
                      onClick={() => handleTrackSelect(track)}
                    >
                      {/* Artwork + title (small artwork when the card is narrow) */}
                      <div className="flex min-w-0 items-start gap-3">
                        <SongArtwork
                          className="h-14 w-14 shrink-0 rounded-xl shadow-sm @min-[13rem]:h-20 @min-[13rem]:w-20"
                          src={track.thumbnailUrl}
                          alt={`${getSongTitle(track.title)} artwork`}
                          iconClassName="h-6 w-6"
                        >
                          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                            {loadingTrackId === track.id && (
                              <Loader2 className="animate-spin text-white" />
                            )}
                          </div>
                          {track.published && (
                            <span
                              title="Published"
                              className="absolute top-1 right-1 z-10 size-2.5 rounded-full bg-emerald-400 ring-2 ring-white @min-[13rem]:hidden"
                            />
                          )}
                          {/* Narrow card: play button sits on the artwork */}
                          <Button
                            size="icon"
                            aria-label={`Play ${getSongTitle(track.title)}`}
                            disabled={loadingTrackId === track.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleTrackSelect(track);
                            }}
                            className="absolute inset-0 m-auto size-7 rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 @min-[13rem]:hidden"
                          >
                            {loadingTrackId === track.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Play className="ml-0.5 size-3.5 fill-current" />
                            )}
                          </Button>
                        </SongArtwork>

                        <div className="min-w-0 flex-1">
                          <h3
                            className="line-clamp-2 text-sm leading-snug font-semibold wrap-break-word 2xl:text-base @min-[13rem]:line-clamp-3"
                            title={getSongTitle(track.title)}
                          >
                            {getSongTitle(track.title)}
                          </h3>
                          {/* Narrow card: date goes under the title */}
                          <p
                            className="text-muted-foreground mt-1 flex items-center gap-1 text-xs whitespace-nowrap @min-[13rem]:hidden"
                            suppressHydrationWarning
                          >
                            <Clock className="size-3" />
                            {timeAgo(track.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Tags (in a narrow card only shown if the song has real tags) */}
                      <div
                        className={`min-w-0 flex-nowrap gap-1.5 overflow-hidden @min-[13rem]:flex-wrap ${
                          promptTags.length > 0
                            ? "flex"
                            : "hidden @min-[13rem]:flex"
                        }`}
                      >
                        {promptTags.length > 0 ? (
                          promptTags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="max-w-full truncate bg-white/70 px-2.5 py-0.5 text-xs font-medium dark:bg-white/10"
                              title={tag}
                            >
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground max-w-full truncate bg-white/50 px-2.5 py-0.5 text-xs dark:bg-white/5"
                          >
                            {track.instrumental
                              ? "Instrumental"
                              : "No style tags"}
                          </Badge>
                        )}
                      </div>

                      {/* Wide card only: short description */}
                      {description && (
                        <div className="hidden @min-[13rem]:block">
                          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                            {description}
                          </p>
                        </div>
                      )}

                      {/* Wide card only: date + vocals / instrumental */}
                      <div className="text-muted-foreground hidden items-center justify-between gap-2 text-xs @min-[13rem]:flex">
                        <span
                          className="flex items-center gap-1 whitespace-nowrap"
                          suppressHydrationWarning
                        >
                          <Clock className="size-3.5" />
                          {timeAgo(track.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          {track.instrumental ? (
                            <Music className="size-3.5" />
                          ) : (
                            <Mic className="size-3.5" />
                          )}
                          {track.instrumental ? "Instrumental" : "Vocals"}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto flex items-center gap-2 border-t border-black/10 pt-3 dark:border-white/10">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = !track.published;
                            startTransition(async () => {
                              setOptimisticPublished({
                                id: track.id,
                                published: next,
                              });
                              await setPublishedStatus(track.id, next);
                            });
                          }}
                          variant="outline"
                          size="sm"
                          className={`bg-background/70 h-8 flex-1 px-3 text-xs @min-[13rem]:h-9 @min-[13rem]:flex-none @min-[13rem]:px-4 @min-[13rem]:text-sm ${track.published ? "border-red-300" : ""}`}
                        >
                          {track.published ? "Unpublish" : "Publish"}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`More options for ${getSongTitle(track.title)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="size-8 @min-[13rem]:size-9"
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const playUrl = await getPlayUrl(track.id);
                                  window.open(playUrl, "_blank");
                                } catch (error) {
                                  console.error(
                                    "[tracks] Failed to download song audio",
                                    {
                                      songId: track.id,
                                      error,
                                    },
                                  );
                                  toast.error("Song audio is not available.");
                                }
                              }}
                            >
                              <Download className="mr-2" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setTrackToRename(track);
                              }}
                            >
                              <Pencil className="mr-2" />
                              Rename
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Wide card: play button in the bottom row */}
                        <Button
                          size="icon"
                          aria-label={`Play ${getSongTitle(track.title)}`}
                          disabled={loadingTrackId === track.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleTrackSelect(track);
                          }}
                          className="ml-auto hidden size-10 shrink-0 rounded-full @min-[13rem]:inline-flex"
                        >
                          {loadingTrackId === track.id ? (
                            <Loader2 className="size-5 animate-spin" />
                          ) : (
                            <Play className="ml-0.5 size-5 fill-current" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
              }
            })
          ) : (
            <div className="col-span-full flex min-h-[40vh] flex-col items-center justify-center px-4 text-center md:min-h-[calc(100svh-12rem)]">
              <Music className="text-muted-foreground h-10 w-10" />
              <h2 className="mt-4 text-lg font-semibold">No Music Yet</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {searchQuery
                  ? "No tracks match your search."
                  : "Create your first song to get started."}
              </p>
            </div>
          )}
        </div>
      </div>

      {trackToRename && (
        <RenameDialog
          track={trackToRename}
          onClose={() => setTrackToRename(null)}
          onRename={(trackId, newtitle) => renameSong(trackId, newtitle)}
        />
      )}
    </div>
  );
}
