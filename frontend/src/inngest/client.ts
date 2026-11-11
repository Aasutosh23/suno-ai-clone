import { eventType, Inngest } from "inngest";
import { z } from "zod";

export const inngest = new Inngest({ id: "music-generator" });

export const generateSongEvent = eventType("generate-song-event", {
  schema: z.object({
    songId: z.string(),
    userId: z.string(),
  }),
});
