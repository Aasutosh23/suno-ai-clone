import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SongPanel } from "~/components/create/song-panel";
import TrackListFetcher from "~/components/create/track-list-fetcher";
import { auth } from "~/lib/auth";

export default async function CreatePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <SongPanel />
      <Suspense
        fallback={
          <div className="flex min-h-40 w-full flex-1 items-center justify-center lg:min-w-0">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <TrackListFetcher />
      </Suspense>
    </div>
  );
}
