import { headers } from "next/headers";
import { redirect } from "next/navigation";
import CreateSong from "~/components/create";
import { auth } from "~/lib/auth";

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/sign-in");
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-6 p-4 sm:p-6 md:p-8 md:pl-19">
      <h1 className="text-2xl font-bold tracking-tight">Discover Music</h1>
      <CreateSong />
    </div>
  );
}
