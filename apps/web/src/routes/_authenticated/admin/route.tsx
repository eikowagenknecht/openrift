import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
const pageTitles: Record<string, string> = {
  "/_authenticated/admin/": "Overview",
  "/_authenticated/admin/sets": "Sets",
  "/_authenticated/admin/tcgplayer-groups": "TCGplayer Sets",
  "/_authenticated/admin/tcgplayer-mappings": "TCGplayer Products",
  "/_authenticated/admin/cardmarket-expansions": "Cardmarket Sets",
  "/_authenticated/admin/cm-mappings": "Cardmarket Products",
  "/_authenticated/admin/settings": "Settings",
};

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const res = await fetch("/api/admin/me", {
      credentials: "include",
    });
    if (!res.ok) {
      throw redirect({ to: "/" });
    }
    const data = (await res.json()) as { isAdmin: boolean };
    if (!data.isAdmin) {
      throw redirect({ to: "/" });
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
    <div className="relative flex w-full flex-1 flex-col">
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
