import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import { Coins } from "lucide-react";
import Upgrade from "~/components/sidebar/upgrade";

export default async function BillingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { credits: true },
  });

  return (
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <h1 className="text-2xl font-bold">Billing</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Manage your credits and subscription.
      </p>

      {/* Credits Summary Card */}
      <div className="bg-muted/40 mt-8 rounded-xl border p-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Available Credits</p>
            <p className="text-3xl font-bold tabular-nums">{user.credits}</p>
          </div>
        </div>

        <p className="text-muted-foreground mt-4 text-sm">
          1 credit = 1 generated song. Credits never expire.
        </p>
      </div>
      <div className="mt-8">
        <Upgrade />
      </div>
    </div>
  );
}
