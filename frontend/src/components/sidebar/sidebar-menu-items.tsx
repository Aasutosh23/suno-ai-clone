"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, Library, PlusCircle } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "~/components/ui/breadcrumb";

const mainItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Create", url: "/create", icon: PlusCircle },
  { title: "My Songs", url: "/library", icon: Library },
  { title: "Explore", url: "/explore", icon: Compass },
];

const extraTitles = [
  { title: "Billing", url: "/billing" },
  { title: "Settings", url: "/settings" },
];

const matches = (pathname: string, url: string) =>
  url === "/" ? pathname === "/" : pathname.startsWith(url);

export default function SidebarMenuItems() {
  const pathname = usePathname();

  return (
    <>
      {mainItems.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            isActive={matches(pathname, item.url)}
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
    </>
  );
}

export function AppBreadcrumb() {
  const pathname = usePathname();

  const current = [...mainItems, ...extraTitles].find((item) =>
    matches(pathname, item.url),
  );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="font-semibold">
            {current?.title ?? "Home"}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
