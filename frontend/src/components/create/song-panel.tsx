"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Loader2, Music, Plus, ShieldAlert } from "lucide-react";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import {
  generateSong,
  getGenerationQuota,
  type GenerateRequest,
} from "~/actions/generation";
import { useRouter } from "next/navigation";

const inspirationTags = [
  "80s synth-pop",
  "Acoustic ballad",
  "Epic movie score",
  "Lo-fi hip hop",
  "Driving rock anthem",
  "Summer beach vibe",
];

const styleTags = [
  "Industrial rave",
  "Heavy bass",
  "Orchestral",
  "Electronic beats",
  "Funky guitar",
  "Soulful vocals",
  "Ambient pads",
];

export function SongPanel({
  initialRemaining,
  emailVerified,
}: {
  initialRemaining: number;
  emailVerified: boolean;
}) {
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [description, setDescription] = useState("");
  const [instrumental, setInstrumental] = useState(false);

  const [lyricsMode, setLyricsMode] = useState<"write" | "auto">("write");
  const [lyrics, setLyrics] = useState("");

  const [styleInput, setStyleInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const interval = setInterval(() => {
      void getGenerationQuota()
        .then((quota) => setRemaining(quota.remaining))
        .catch((error) => {
          console.error(
            "[generation] Failed to refresh remaining quota",
            error,
          );
        });
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleStyleInputTagClick = (tag: string) => {
    const currentTags = styleInput
      .split(", ")
      .map((s) => s.trim())
      .filter((s) => s);

    if (!currentTags.includes(tag)) {
      if (styleInput.trim() === "") {
        setStyleInput(tag);
      } else {
        setStyleInput(styleInput + ", " + tag);
      }
    }
  };

  const handleInspirationTagClick = (tag: string) => {
    const currentTags = description
      .split(", ")
      .map((s) => s.trim())
      .filter((s) => s);

    if (!currentTags.includes(tag)) {
      if (description.trim() === "") {
        setDescription(tag);
      } else {
        setDescription(description + ", " + tag);
      }
    }
  };

  const handleCreate = async () => {
    if (mode === "simple" && !description.trim()) {
      toast.error("Please describe your song before creating.");
      return;
    }

    if (mode === "custom" && !styleInput.trim()) {
      toast.error("Please add some styles for your song.");
      return;
    }

    if (mode === "custom" && !instrumental && !lyrics.trim()) {
      toast.error("Please add lyrics or describe the lyrics for your song.");
      return;
    }
    if (!turnstileSiteKey) {
      toast.error("Song generation bot protection is not configured.");
      return;
    }
    if (!turnstileToken) {
      toast.error("Complete the bot check before creating a song.");
      return;
    }
    if (!emailVerified) {
      toast.error("Verify your email address before creating songs.");
      return;
    }
    if (remaining === 0) {
      toast.error("You’ve reached your limit of 5 songs.");
      return;
    }

    let requestBody: GenerateRequest;

    if (mode === "simple") {
      requestBody = {
        fullDescribedSong: description,
        instrumental: instrumental,
      };
    } else {
      const prompt = styleInput;
      if (lyricsMode === "write") {
        requestBody = {
          prompt,
          lyrics,
          instrumental,
        };
      } else {
        requestBody = {
          prompt,
          describedLyrics: lyrics,
          instrumental,
        };
      }
    }

    try {
      setLoading(true);
      const result = await generateSong(requestBody, turnstileToken);
      if (!result.ok) {
        if (result.remaining !== undefined) setRemaining(result.remaining);
        toast.error(result.message);
        return;
      }

      setRemaining(result.remaining);
      window.dispatchEvent(
        new CustomEvent("songs-queued", {
          detail: result.songs,
        }),
      );
      setDescription("");
      setLyrics("");
      setStyleInput("");
      setTurnstileToken("");
      turnstileRef.current?.reset();
      router.refresh();
      toast.success(
        `Songs added to your queue. ${result.remaining} of 5 songs remaining.`,
      );
    } catch (error) {
      console.error("Failed to queue song generation:", error);
      toast.error("Failed to generate song. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-muted/30 flex w-full flex-col border-b lg:sticky lg:top-0 lg:h-[calc(100svh-3rem)] lg:max-h-[calc(100svh-3rem)] lg:min-h-0 lg:w-80 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="bg-background/80 mb-4 rounded-lg border p-3">
          <p className="text-sm font-semibold">
            {remaining} of 5 songs remaining
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            This lifetime limit applies to every account, including paid users.
          </p>
        </div>
        {!emailVerified && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>Verify your email address before generating songs.</p>
          </div>
        )}
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "simple" | "custom")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="simple">Simple</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="simple" className="mt-6 space-y-6">
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Describe your song</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A dreamy lofi hip song, perfect for studying and relaxing"
                className="min-h-30 resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("custom")}
              >
                <Plus className="mr-2" />
                Lyrics
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Instrumental</label>
                <Switch
                  checked={instrumental}
                  onCheckedChange={setInstrumental}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Inspiration</label>
              <div className="w-full overflow-x-auto whitespace-nowrap">
                <div className="flex gap-2 pb-2">
                  {inspirationTags.map((tag) => (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 bg-transparent text-xs"
                      key={tag}
                      onClick={() => handleInspirationTagClick(tag)}
                    >
                      <Plus className="mr-1" />
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-6 space-y-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Lyrics</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={lyricsMode === "auto" ? "secondary" : "ghost"}
                    onClick={() => {
                      setLyricsMode("auto");
                      setLyrics("");
                    }}
                    size="sm"
                    className="h-7 text-xs"
                  >
                    Auto
                  </Button>
                  <Button
                    variant={lyricsMode === "write" ? "secondary" : "ghost"}
                    onClick={() => {
                      setLyricsMode("write");
                      setLyrics("");
                    }}
                    size="sm"
                    className="h-7 text-xs"
                  >
                    Write
                  </Button>
                </div>
              </div>

              <Textarea
                placeholder={
                  lyricsMode === "write"
                    ? "Add your own lyrics here"
                    : "Describe your lyrics, e.g., a sad song about lost love"
                }
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                className="min-h-25 resize-none"
              />
              <div className="w-full overflow-x-auto whitespace-nowrap">
                <div className="flex gap-2 pb-2">
                  {styleTags.map((tag) => (
                    <Badge
                      variant="secondary"
                      key={tag}
                      className="hover:bg-secondary/80 shrink-0 cursor-pointer text-xs"
                      onClick={() => handleStyleInputTagClick(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Instrumental</label>
              <Switch
                checked={instrumental}
                onCheckedChange={setInstrumental}
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Styles</label>
              <Textarea
                placeholder="Enter style tags"
                value={styleInput}
                onChange={(e) => setStyleInput(e.target.value)}
                className="min-h-15 resize-none"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="bg-background/80 border-t p-4 lg:shrink-0">
        {turnstileSiteKey ? (
          <div className="mb-3 flex justify-center">
            <Turnstile
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              options={{ action: "generate" }}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken("")}
              onError={() => {
                setTurnstileToken("");
                toast.error("Bot verification failed. Please retry.");
              }}
            />
          </div>
        ) : (
          <p className="text-destructive mb-3 text-center text-xs">
            Turnstile site key is not configured.
          </p>
        )}
        <Button
          onClick={handleCreate}
          disabled={
            loading ||
            remaining === 0 ||
            !emailVerified ||
            !turnstileSiteKey ||
            !turnstileToken
          }
          className="w-full cursor-pointer bg-linear-to-r from-orange-500 to-pink-500 font-medium text-white hover:from-orange-600 hover:to-pink-600"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Music />}
          {loading
            ? "Creating..."
            : remaining === 0
              ? "Limit reached"
              : "Create"}
        </Button>
      </div>
    </section>
  );
}
