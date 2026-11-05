"use client";

import { AuthView as BetterAuthView } from "@daveyplate/better-auth-ui";

export function AuthView({ pathname }: { pathname: string }) {
  return (
    <main className="container flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <BetterAuthView pathname={pathname} />
    </main>
  );
}
