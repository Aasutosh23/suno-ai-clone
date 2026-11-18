// Generation limit constants — shared between server actions and client UI.
// Keep this file free of "use server" / "use client" so both sides can import it.

export const GENERATION_LIMIT = 5;
export const SONGS_PER_GENERATION = 2; // each generateSong call creates 2 variants
export const TOTAL_SONGS_LIMIT = GENERATION_LIMIT * SONGS_PER_GENERATION;
