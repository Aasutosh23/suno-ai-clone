"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";
import { db } from "~/server/db";

const CREDIT_PACKAGES = [25, 100, 250] as const;

export async function simulateCreditPurchase(credits: number) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");
  if (!CREDIT_PACKAGES.some((packageCredits) => packageCredits === credits)) {
    throw new Error("Invalid demo credit package");
  }

  const user = await db.user.update({
    where: { id: session.user.id },
    data: { credits: { increment: credits } },
    select: { credits: true },
  });

  revalidatePath("/billing");
  return user.credits;
}
