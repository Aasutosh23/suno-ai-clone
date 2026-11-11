"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Music,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "~/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { authClient } from "~/lib/auth-client";
import SidebarMenuItems from "./sidebar-menu-items";

const accountItems = [
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  creditsSlot?: React.ReactNode;
}

export function AppSidebar({ creditsSlot }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const name = session?.user?.name ?? "User";
  const email = session?.user?.email ?? "";
  const image = session?.user?.image ?? undefined;
  const initial = name.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth/sign-in");
        },
      },
    });
  };

  return (
    <Sidebar className="min-w-0 overflow-hidden">
      {/* Header */}
      <SidebarHeader className="min-w-0">
        <Link href="/" className="flex min-w-0 items-center gap-3 px-2 py-3">
          <div className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Music className="h-5 w-5" />
          </div>

          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-lg font-bold">Music Generator</span>
            <span className="text-muted-foreground truncate text-xs font-semibold">
              Create songs with AI
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Header Separator */}
      <SidebarSeparator className="mx-2 block h-px w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] shrink-0" />

      {/* Main Content */}
      <SidebarContent className="min-w-0 overflow-x-hidden">
        {/* Main Menu */}
        <SidebarGroup className="min-w-0">
          <SidebarGroupLabel className="text-xs font-bold tracking-wide uppercase">
            Menu
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItems />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Account Menu */}
        <SidebarGroup className="min-w-0">
          <SidebarGroupLabel className="text-xs font-bold tracking-wide uppercase">
            Account
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.url)}
                    closeOnMobileClick
                    className="min-w-0 text-sm font-semibold"
                  >
                    <Link href={item.url}>
                      <item.icon className="shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Credits Card — rendered by server component */}
        {creditsSlot && (
          <SidebarGroup className="min-w-0">
            <SidebarGroupContent>{creditsSlot}</SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer Separator */}
      <SidebarSeparator className="mx-2 block h-px w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] shrink-0" />

      {/* Footer */}
      <SidebarFooter className="min-w-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={image} alt={name} />
                    <AvatarFallback className="font-bold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>

                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">{name}</span>
                    <span className="text-muted-foreground truncate text-xs font-medium">
                      {email}
                    </span>
                  </div>

                  <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56 max-w-[calc(100vw-1rem)]"
              >
                <DropdownMenuLabel className="font-bold">
                  My Account
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="font-semibold"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
