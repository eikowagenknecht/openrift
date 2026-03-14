import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { client } from "@/lib/rpc-client";
const pageTitles: Record<string, string> = {
  "/_authenticated/admin/": "Overview",
  "/_authenticated/admin/sets": "Sets",
  "/_authenticated/admin/marketplace-overview": "Marketplace Overview",
  "/_authenticated/admin/marketplace-groups": "Marketplace Groups",
  "/_authenticated/admin/marketplace-mappings": "Marketplace Mappings",
  "/_authenticated/admin/ignored-products": "Ignored Products",
  "/_authenticated/admin/cards-manage": "Manage Sources",
  "/_authenticated/admin/cards": "Cards",
  "/_authenticated/admin/settings": "Settings",
  "/_authenticated/admin/feature-flags": "Feature Flags",
  "/_authenticated/admin/scan": "Scan Test",
  "/_authenticated/admin/cards_/$cardId": "Card Source",
  "/_authenticated/admin/cards_/new/$name": "New Card",
  "/_authenticated/admin/error-test": "Error Test",
};

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const res = await client.api.admin.me.$get();
    if (!res.ok) {
      throw redirect({ to: "/cards" });
    }
    const data = (await res.json()) as { isAdmin: boolean };
    if (!data.isAdmin) {
      throw redirect({ to: "/cards" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SidebarProvider className="min-h-0!">
      <AdminSidebar />
      <AdminContent />
    </SidebarProvider>
  );
}

function AdminContent() {
  const matches = useMatches();
  const routeId = matches.at(-1)?.routeId ?? "";
  const title = pageTitles[routeId] ?? "Admin";

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-4! self-center!" />
        <h1 className="text-sm font-medium">{title}</h1>
      </header>
      <div className="flex-1 p-4 sm:p-6">
        <Outlet />
      </div>
    </div>
  );
}
