import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { RouteErrorFallback } from "@/components/error-message";
import { Footer } from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isAdminQueryOptions } from "@/hooks/use-admin";
const pageTitles: Record<string, string> = {
  "/_app/_authenticated/admin/sets": "Sets",
  "/_app/_authenticated/admin/marketplace-overview": "Marketplace Overview",
  "/_app/_authenticated/admin/marketplace-groups": "Marketplace Groups",
  "/_app/_authenticated/admin/marketplace-mappings": "Marketplace Mappings",
  "/_app/_authenticated/admin/ignored-products": "Ignored Products",
  "/_app/_authenticated/admin/ignored-sources": "Ignored Sources",
  "/_app/_authenticated/admin/sources": "Sources",
  "/_app/_authenticated/admin/cards": "Cards",
  "/_app/_authenticated/admin/images": "Images",
  "/_app/_authenticated/admin/settings": "Settings",
  "/_app/_authenticated/admin/feature-flags": "Feature Flags",
  "/_app/_authenticated/admin/promo-types": "Promo Types",
  "/_app/_authenticated/admin/scan": "Scan Test",
  "/_app/_authenticated/admin/cards_/$cardSlug": "Card Source",
  "/_app/_authenticated/admin/cards_/new/$name": "New Card",
  "/_app/_authenticated/admin/error-test": "Error Test",
};

export const Route = createFileRoute("/_app/_authenticated/admin")({
  errorComponent: RouteErrorFallback,
  beforeLoad: async ({ context }) => {
    const isAdmin = await context.queryClient.ensureQueryData(isAdminQueryOptions);
    if (!isAdmin) {
      throw redirect({ to: "/cards" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="flex-1">
      <SidebarProvider className="min-h-0!">
        <AdminSidebar />
        <AdminContent />
      </SidebarProvider>
    </div>
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
      <Footer />
    </div>
  );
}
