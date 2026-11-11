import { NonRetriableError } from "inngest";
import { db } from "~/server/db";
import { generateSongEvent, inngest } from "./client";
import { env } from "~/env";
import { releaseSongQuota } from "~/lib/generation-quota";

function getFailedSongId(event: unknown) {
  if (typeof event !== "object" || event === null || !("data" in event)) {
    return undefined;
  }

  const failureData = event.data;
  if (
    typeof failureData !== "object" ||
    failureData === null ||
    !("event" in failureData)
  ) {
    return undefined;
  }

  const originalEvent = failureData.event;
  if (
    typeof originalEvent !== "object" ||
    originalEvent === null ||
    !("data" in originalEvent)
  ) {
    return undefined;
  }

  const originalData = originalEvent.data;
  if (
    typeof originalData !== "object" ||
    originalData === null ||
    !("songId" in originalData) ||
    typeof originalData.songId !== "string"
  ) {
    return undefined;
  }

  return originalData.songId;
}

export const generateSong = inngest.createFunction(
  {
    id: "generate-song",
    concurrency: [{ limit: 1, key: "event.data.userId" }, { limit: 2 }],
    onFailure: async ({ event, error }) => {
      const songId = getFailedSongId(event);
      console.error("[generation] Inngest job failed", {
        songId,
        error,
      });
      if (typeof songId === "string") await releaseSongQuota(songId);
    },
    triggers: [{ event: generateSongEvent }],
  },
  async ({ event, step }) => {
    const { songId } = event.data;

    const { userId, credits, endpoint, body } = await step.run(
      "check-credits",
      async () => {
        const song = await db.song.findUniqueOrThrow({
          where: {
            id: songId,
          },
          select: {
            user: {
              select: {
                id: true,
                credits: true,
              },
            },
            prompt: true,
            lyrics: true,
            fullDescribedSong: true,
            describedLyrics: true,
            guidanceScale: true,
            inferStep: true,
            audioDuration: true,
            seed: true,
            instrumental: true,
          },
        });

        type RequestBody = {
          guidance_scale?: number;
          infer_step?: number;
          audio_duration?: number;
          seed?: number;
          full_described_song?: string;
          prompt?: string;
          lyrics?: string;
          described_lyrics?: string;
          instrumental?: boolean;
        };

        let endpoint = "";
        let body: RequestBody = {};

        const commonParams = {
          guidance_scale: song.guidanceScale ?? undefined,
          infer_step: song.inferStep ?? undefined,
          audio_duration: song.audioDuration ?? undefined,
          seed: song.seed ?? undefined,
          instrumental: song.instrumental ?? undefined,
        };

        if (song.fullDescribedSong) {
          endpoint = env.GENERATE_FROM_DESCRIPTION;
          body = {
            full_described_song: song.fullDescribedSong,
            ...commonParams,
          };
        } else if (song.prompt && (song.lyrics?.trim() || song.instrumental)) {
          endpoint = env.GENERATE_WITH_LYRICS;
          body = {
            lyrics: song.lyrics ?? "",
            prompt: song.prompt,
            ...commonParams,
          };
        } else if (
          song.prompt &&
          (song.describedLyrics?.trim() || song.instrumental)
        ) {
          endpoint = env.GENERATE_FROM_DESCRIBED_LYRICS;
          body = {
            described_lyrics: song.describedLyrics ?? "",
            prompt: song.prompt,
            ...commonParams,
          };
        }

        if (!endpoint) {
          throw new NonRetriableError(
            "No valid input found to generate the song",
          );
        }

        return {
          userId: song.user.id,
          credits: song.user.credits,
          endpoint: endpoint,
          body: body,
        };
      },
    );

    if (credits > 0) {
      await step.run("set-status-processing", async () => {
        return await db.song.update({
          where: {
            id: songId,
          },
          data: {
            status: "processing",
          },
        });
      });

      const response = await step.fetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "Modal-Key": env.MODAL_KEY,
          "Modal-Secret": env.MODAL_SECRET,
          Authorization: `Bearer ${env.GENERATION_API_TOKEN}`,
        },
      });

      if (!response.ok) {
        console.error("[generation] Music provider returned an error", {
          songId,
          status: response.status,
          statusText: response.statusText,
        });
      }

      await step.run("update-song-result", async () => {
        const responseData = response.ok
          ? ((await response.json()) as {
              s3_key: string;
              cover_image_s3_key: string;
              categories: string[];
            })
          : null;

        await db.song.update({
          where: {
            id: songId,
          },
          data: {
            s3Key: responseData?.s3_key,
            thumbnailS3Key: responseData?.cover_image_s3_key,
            status: response.ok ? "processed" : "failed",
          },
        });

        if (responseData && responseData.categories.length > 0) {
          await db.song.update({
            where: { id: songId },
            data: {
              categories: {
                connectOrCreate: responseData.categories.map(
                  (categoryName) => ({
                    where: { name: categoryName },
                    create: { name: categoryName },
                  }),
                ),
              },
            },
          });
        }
      });

      if (!response.ok) {
        await step.run("refund-failed-generation-slot", async () => {
          await releaseSongQuota(songId);
        });
      }

      return await step.run("deduct-credits", async () => {
        if (!response.ok) return;

        return await db.user.update({
          where: { id: userId },
          data: {
            credits: {
              decrement: 1,
            },
          },
        });
      });
    } else {
      await step.run("set-status-no-credits", async () => {
        await releaseSongQuota(songId, "no credits");
      });
    }
  },
);
