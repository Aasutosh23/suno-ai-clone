import { Loader2 } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import TrackListFetcher from "~/components/create/track-list-fetcher";
import { auth } from "~/lib/auth";

export default async function LibraryPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-6 pt-6 sm:px-6">
        <h1 className="text-2xl font-bold">My Songs</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your generated songs, all in one place.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex min-h-40 flex-1 items-center justify-center">
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
          </div>
        }
      >
        <TrackListFetcher />
      </Suspense>
    </div>
  );
}
