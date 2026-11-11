"use client";

import { Music } from "lucide-react";
import type { ReactNode } from "react";

export function SongArtwork({
  src,
  alt,
  className,
  imageClassName,
  fallbackClassName,
  iconClassName,
  children,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  iconClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className ?? ""}`}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center bg-linear-to-br from-orange-500 to-pink-500 ${fallbackClassName ?? ""}`}
      >
        <Music className={`text-white ${iconClassName ?? "size-7"}`} />
      </div>
      {src && (
        <img
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName ?? ""}`}
          src={src}
          alt={alt}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      {children && <div className="absolute inset-0 z-10">{children}</div>}
    </div>
  );
}
