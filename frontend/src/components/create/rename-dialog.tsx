"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Track } from "./track-list";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function RenameDialog({
  track,
  onClose,
  onRename,
}: {
  track: Track;
  onClose: () => void;
  onRename: (trackId: string, newTitle: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(track.title ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = title.trim();
  const canSave = trimmed.length > 0 && trimmed !== (track.title ?? "").trim();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSave || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      await onRename(track.id, trimmed);
      onClose();
    } catch {
      setError("Couldn't rename the song. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Don't allow closing while the rename is in progress
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Song</DialogTitle>
            <DialogDescription>
              Enter a new name for your song. Click save when you&apos;re done.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Title
              </Label>
              <Input
                id="name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
                autoComplete="off"
                autoFocus
                className="col-span-3"
              />
            </div>
            {error && (
              <p className="text-destructive col-span-4 text-sm">{error}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={isSaving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
