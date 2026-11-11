const MAX_SONG_TITLE_LENGTH = 48;

export function getSongTitle(value: string | null | undefined) {
  const title = value?.trim().replace(/\s+/g, " ");
  if (!title) return "Untitled";
  if (title.length <= MAX_SONG_TITLE_LENGTH) return title;

  const truncated = title.slice(0, MAX_SONG_TITLE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const shortened =
    lastSpace > MAX_SONG_TITLE_LENGTH / 2
      ? truncated.slice(0, lastSpace)
      : truncated;

  return `${shortened.trimEnd()}...`;
}
