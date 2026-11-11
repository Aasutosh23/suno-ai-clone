"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "../lib/auth-client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthUIProvider
      authClient={authClient}
      account={{ basePath: "/settings", fields: ["name"] }}
      captcha={
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
          ? {
              provider: "cloudflare-turnstile",
              siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
              endpoints: ["/sign-up/email"],
            }
          : undefined
      }
      localizeErrors={false}
      navigate={(href) => router.push(href)}
      replace={(href) => router.replace(href)}
      onSessionChange={() => {
        router.refresh();
      }}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}
