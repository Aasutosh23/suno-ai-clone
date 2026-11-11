"use client";

import {
  Download,
  GripHorizontal,
  Maximize2,
  Minimize2,
  MoveDiagonal2,
  Music,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { usePlayerStore } from "~/stores/use-player-store";
import { Button } from "./ui/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { SongArtwork } from "./home/song-artwork";

const DEFAULT_SIZE = 256; // normal square size in px
const MINI_SIZE = 160; // "small screen" size
const MIN_SIZE = 160;
const MAX_SIZE = 480;
const MARGIN = 8; // min distance from screen edges
const POS_KEY = "soundbar-position";
const SIZE_KEY = "soundbar-size";

type Pos = { x: number; y: number };

function RangeBar({
  value,
  max,
  onChange,
  disabled,
  className = "",
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <input
      type="range"
      min={0}
      max={max}
      step="any"
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.3) ${pct}%) center / 100% 4px no-repeat`,
      }}
      className={`h-4 w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-default disabled:opacity-50 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ${className}`}
    />
  );
}

export default function SoundBar() {
  const { track } = usePlayerStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [volume, setVolume] = useState(100); // 0-100
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [pos, setPos] = useState<Pos | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const dragOffset = useRef<Pos>({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, size: DEFAULT_SIZE });
  const lastNormalSize = useRef(DEFAULT_SIZE);

  const compact = size < 210 && !fullscreen;
  const isMini = size <= MINI_SIZE + 4;

  const clamp = useCallback((p: Pos, s: number): Pos => {
    const maxX = window.innerWidth - s - MARGIN;
    const maxY = window.innerHeight - s - MARGIN;
    return {
      x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, maxX)),
      y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, maxY)),
    };
  }, []);

  const fitSize = (s: number) =>
    Math.round(
      Math.min(
        Math.max(MIN_SIZE, s),
        MAX_SIZE,
        window.innerWidth - MARGIN * 2,
        window.innerHeight - MARGIN * 2,
      ),
    );

  // Initial size + position (saved ones, otherwise bottom-right)
  useEffect(() => {
    let initialSize = DEFAULT_SIZE;
    let initialPos: Pos | null = null;
    try {
      const savedSize = Number(localStorage.getItem(SIZE_KEY));
      if (savedSize) initialSize = fitSize(savedSize);
      const savedPos = localStorage.getItem(POS_KEY);
      if (savedPos) initialPos = JSON.parse(savedPos) as Pos;
    } catch {}

    lastNormalSize.current =
      initialSize <= MINI_SIZE + 4 ? DEFAULT_SIZE : initialSize;
    setSize(initialSize);
    setPos(
      clamp(
        initialPos ?? {
          x: window.innerWidth - initialSize - 16,
          y: window.innerHeight - initialSize - 16,
        },
        initialSize,
      ),
    );

    const onResize = () => setPos((p) => (p ? clamp(p, size) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamp]);

  // Keep the card on screen whenever its size changes
  useEffect(() => {
    setPos((p) => (p ? clamp(p, size) : p));
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {}
  }, [size, clamp]);

  // Esc closes fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Load + autoplay when the track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track?.url) return;

    setIsVisible(true);
    setCurrentTime(0);
    setDuration(0);

    audio.src = track.url;
    audio.load();

    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        console.error("Playback failed: ", error);
        setIsPlaying(false);
      });
  }, [track]);

  // Keep audio volume in sync with the slider
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
    audio.muted = muted;
  }, [volume, muted, track]);

  // ---- Dragging (moving the card) ----
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pos || fullscreen) return;
    if ((e.target as HTMLElement).closest("button, input")) {
      return;
    }
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPos(
      clamp(
        {
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        },
        size,
      ),
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    try {
      if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {}
  };

  // ---- Resizing (corner handle, keeps it square) ----
  const handleResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resizeStart.current = { x: e.clientX, y: e.clientY, size };
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing || !pos) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    let next = fitSize(resizeStart.current.size + (dx + dy) / 2);
    // don't grow past the screen edge
    next = Math.min(
      next,
      window.innerWidth - pos.x - MARGIN,
      window.innerHeight - pos.y - MARGIN,
    );
    setSize(Math.max(MIN_SIZE, next));
  };

  const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    e.stopPropagation();
    setResizing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (size > MINI_SIZE + 4) lastNormalSize.current = size;
  };

  const toggleMini = () => {
    if (isMini) {
      setSize(fitSize(lastNormalSize.current));
    } else {
      lastNormalSize.current = size;
      setSize(MINI_SIZE);
    }
  };

  // ---- Player controls ----
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !track?.url) return;

    if (audio.paused) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const closePlayer = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);
    setIsVisible(false);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio || value[0] === undefined) return;
    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const toggleMute = () => {
    if (muted || volume === 0) {
      setMuted(false);
      if (volume === 0) setVolume(50);
    } else {
      setMuted(true);
    }
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    setMuted(false);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const shownVolume = muted ? 0 : volume;
  const VolumeIcon =
    shownVolume === 0 ? VolumeX : shownVolume < 50 ? Volume1 : Volume2;

  const iconBtn = "h-8 w-8 text-white hover:bg-white/15 hover:text-white";

  const progress = (
    <div className="w-full space-y-1">
      <RangeBar
        value={currentTime}
        max={duration || 100}
        onChange={(v) => handleSeek([v])}
        disabled={!track?.url}
        label="Seek"
      />
      {!compact && (
        <div className="flex justify-between text-[10px] text-white/70 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );

  const audioEl = (
    <audio
      ref={audioRef}
      preload="metadata"
      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onEnded={() => setIsPlaying(false)}
    />
  );

  if (!track) {
    return audioEl;
  }

  if (!isVisible) {
    return (
      <>
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setIsVisible(true)}
          aria-label="Show music player"
          title="Show music player"
          className="fixed right-4 bottom-4 z-50 rounded-full shadow-lg"
        >
          <Music />
        </Button>
        {audioEl}
      </>
    );
  }

  // ================= FULLSCREEN =================
  if (fullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-zinc-950 text-white">
          {track?.artwork && (
            <img
              src={track.artwork}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/40" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 h-10 w-10 text-white hover:bg-white/15 hover:text-white"
          >
            <Minimize2 className="h-5 w-5" />
          </Button>

          <div className="relative flex w-full max-w-md flex-col items-center gap-6 px-6">
            <SongArtwork
              className="aspect-square w-[min(80vw,45vh)] rounded-3xl bg-linear-to-br from-purple-600 to-pink-500 shadow-2xl"
              src={track.artwork}
              alt={track.title ?? "Artwork"}
              imageClassName="select-none"
              fallbackClassName="bg-linear-to-br from-purple-600 to-pink-500"
              iconClassName="h-20 w-20 text-white/40"
            />

            <div className="w-full min-w-0 text-center">
              <p className="truncate text-2xl font-bold">
                {track?.title ?? "Nothing playing"}
              </p>
              <p className="truncate text-sm text-white/70">
                {track?.createdByUsername ?? "Pick a song to start"}
              </p>
            </div>

            {progress}

            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className={iconBtn}
                >
                  <VolumeIcon className="h-5 w-5" />
                </Button>
                <RangeBar
                  value={shownVolume}
                  max={100}
                  onChange={handleVolume}
                  label="Volume"
                  className="w-24"
                />
              </div>

              <Button
                size="icon"
                onClick={togglePlay}
                disabled={!track?.url}
                className="h-16 w-16 rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 hover:bg-white active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="h-7 w-7 fill-current" />
                ) : (
                  <Play className="ml-1 h-7 w-7 fill-current" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                disabled={!track?.url}
                onClick={() => track?.url && window.open(track.url, "_blank")}
                className={iconBtn}
              >
                <Download className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        {audioEl}
      </>
    );
  }

  // ================= FLOATING SQUARE =================
  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: size,
          height: size,
          transform: `translate3d(${pos?.x ?? 0}px, ${pos?.y ?? 0}px, 0)`,
          visibility: pos ? "visible" : "hidden",
        }}
        className={`fixed top-0 left-0 z-50 touch-none overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 text-white shadow-2xl select-none ${
          dragging ? "cursor-grabbing shadow-black/60" : "cursor-grab"
        }`}
      >
        {/* Artwork background */}
        <SongArtwork
          className="absolute inset-0"
          src={track.artwork}
          alt={track.title ?? "Artwork"}
          imageClassName="select-none"
          fallbackClassName="bg-linear-to-br from-purple-600 to-pink-500"
          iconClassName="h-1/4 w-1/4 text-white/40"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/10 to-black/90" />

        <div className="relative flex h-full flex-col justify-between p-2">
          {/* Top row: size controls and dismiss */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMini}
              title={isMini ? "Normal size" : "Small size"}
              className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
            >
              {isMini ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5" />
              )}
            </Button>
            <GripHorizontal className="h-4 w-4 text-white/60" />
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFullscreen(true)}
                title="Fullscreen"
                aria-label="Open fullscreen player"
                className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={closePlayer}
                title="Close player"
                aria-label="Close player and stop playback"
                className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-2 px-1 pb-1">
            <div className="min-w-0">
              <p
                className={`truncate font-semibold drop-shadow ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {track?.title ?? "Nothing playing"}
              </p>
              {!compact && (
                <p className="truncate text-xs text-white/70">
                  {track?.createdByUsername ?? "Pick a song to start"}
                </p>
              )}
            </div>

            {progress}

            {compact ? (
              <div className="flex justify-center">
                <Button
                  size="icon"
                  onClick={togglePlay}
                  disabled={!track?.url}
                  className="h-9 w-9 rounded-full bg-white text-black shadow-lg hover:bg-white"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-current" />
                  ) : (
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex shrink-0 items-center gap-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    aria-label={muted ? "Unmute" : "Mute"}
                    className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
                  >
                    <VolumeIcon className="h-3.5 w-3.5" />
                  </Button>
                  <RangeBar
                    value={shownVolume}
                    max={100}
                    onChange={handleVolume}
                    label="Volume"
                    className="w-10"
                  />
                </div>

                <Button
                  size="icon"
                  onClick={togglePlay}
                  disabled={!track?.url}
                  className="h-11 w-11 rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 hover:bg-white active:scale-95"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!track?.url}
                  onClick={() => track?.url && window.open(track.url, "_blank")}
                  className={iconBtn}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Resize handle (bottom-right corner) */}
        <div
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
          onPointerCancel={handleResizeUp}
          title="Drag to resize"
          className="absolute right-0 bottom-0 z-10 flex h-6 w-6 cursor-nwse-resize items-end justify-end p-1 text-white/60 hover:text-white"
        >
          <MoveDiagonal2 className="h-3 w-3" />
        </div>
      </div>
      {audioEl}
    </>
  );
}
