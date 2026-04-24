import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { RouteErrorFallback } from "@/components/error-message";
import { Footer } from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isAdminQueryOptions } from "@/hooks/use-admin";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { FOOTER_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createFileRoute("/_app/_authenticated/admin")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Admin", noIndex: true }),
  staticData: { hideFooter: true },
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
      {/*
        Pin the sidebar-provider's height directly. On desktop the in-flow
        sidebar (NestedSidebar) would size the flex row via calc(100svh - ...),
        but on mobile the sidebar is a Sheet portal, so nothing in the row
        provides height. Without an explicit height here, the nested
        flex-1 / min-h-0 chain collapses to zero and the admin tables render
        no rows at all.
      */}
      <SidebarProvider className="h-[calc(100svh-3.5rem-1px)] min-h-0!">
        <AdminSidebar />
        <AdminContent />
      </SidebarProvider>
    </div>
  );
}

function AdminContent() {
  const matches = useMatches();
  const title = matches.at(-1)?.staticData?.title ?? "Admin";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 items-center gap-2 border-b px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-1 h-4! self-center!" />
        <h1 className="text-sm font-medium">{title}</h1>
      </header>
      {/*
        overflow-y-auto lets long pages (e.g. the card detail page, which does
        not provide its own internal scroll) scroll within the bounded admin
        layout. Pages that *do* manage their own scroll (the Cards /
        Candidates / Unmatched tables) nest a flex-1 / min-h-0 chain here, so
        this wrapper never grows past its flex allocation and their internal
        scrollers keep working.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 pb-6">
        <Outlet />
      </div>
      <Footer className={FOOTER_PADDING_NO_TOP} />
    </div>
  );
}
