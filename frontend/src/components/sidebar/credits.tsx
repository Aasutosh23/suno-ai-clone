import { headers } from "next/headers";
import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";
import { Button } from "~/components/ui/button";

export async function Credits() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { credits: true },
  });

  return (
    <div className="bg-muted/50 min-w-0 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <Coins className="h-4 w-4 shrink-0" />
          <span>Credits</span>
        </div>
        <span className="text-lg font-bold tabular-nums">{user.credits}</span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs font-medium">
        1 credit = 1 song
      </p>

      <Button asChild size="sm" className="mt-3 w-full font-semibold">
        <Link href="/billing">
          <Sparkles className="mr-2 h-4 w-4" />
          Buy credits
        </Link>
      </Button>
    </div>
  );
}
