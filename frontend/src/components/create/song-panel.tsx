"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Loader2, Music, Plus } from "lucide-react";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import {
  generateSong,
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

export function SongPanel() {
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [description, setDescription] = useState("");
  const [instrumental, setInstrumental] = useState(false);

  const [lyricsMode, setLyricsMode] = useState<"write" | "auto">("write");
  const [lyrics, setLyrics] = useState("");

  const [styleInput, setStyleInput] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      const result = await generateSong(requestBody);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      window.dispatchEvent(
        new CustomEvent("songs-queued", {
          detail: result.songs,
        }),
      );
      setDescription("");
      setLyrics("");
      setStyleInput("");
      router.refresh();
      toast.success("Songs added to your queue.");
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
        <Button
          onClick={handleCreate}
          disabled={loading}
          className="w-full cursor-pointer bg-linear-to-r from-orange-500 to-pink-500 font-medium text-white hover:from-orange-600 hover:to-pink-600"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Music />}
          {loading ? "Creating..." : "Create"}
        </Button>
      </div>
    </section>
  );
}
