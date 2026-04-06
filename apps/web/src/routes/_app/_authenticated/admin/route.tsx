import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { RouteErrorFallback } from "@/components/error-message";
import { Footer } from "@/components/layout/footer";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isAdminQueryOptions } from "@/hooks/use-admin";

export const Route = createFileRoute("/_app/_authenticated/admin")({
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
      <SidebarProvider className="min-h-0!">
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
      <div className="flex min-h-0 flex-1 flex-col p-3 pb-6">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
