import { headers } from "next/headers";
import { redirect } from "next/navigation";
import CreateSong from "~/components/create";
import { auth } from "~/lib/auth";

export default async function ExplorePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  return (
    <div className="flex min-h-full w-full flex-col gap-6 p-8 pl-19">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Discover songs that creators have published to the community.
        </p>
      </div>
      <CreateSong />
    </div>
  );
}
