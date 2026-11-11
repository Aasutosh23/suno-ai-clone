"use client";

import { usePathname } from "next/navigation";
import { BreadcrumbPage } from "../ui/breadcrumb";

export default function BreadcrumbPageClient() {
  const path = usePathname();

  return (
    <BreadcrumbPage className="text-foreground font-semibold">
      {path === "/" && "Home"}
      {path === "/create" && "Create"}
    </BreadcrumbPage>
  );
}
