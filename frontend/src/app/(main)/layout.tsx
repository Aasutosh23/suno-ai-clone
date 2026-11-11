import { Suspense } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/sidebar/app-sidebar";
import { AppBreadcrumb } from "~/components/sidebar/sidebar-menu-items";
import { Credits } from "~/components/sidebar/credits";
import SoundBar from "~/components/sound-bar";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <AppSidebar
        creditsSlot={
          <Suspense
            fallback={
              <div className="bg-muted/50 h-24 animate-pulse rounded-xl border" />
            }
          >
            <Credits />
          </Suspense>
        }
      />
      <SidebarInset className="h-svh overflow-hidden">
        <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger variant="ghost" className="text-foreground -ml-1" />
          <div className="bg-border mx-2 h-4 w-px" />
          <AppBreadcrumb />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
        <SoundBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
