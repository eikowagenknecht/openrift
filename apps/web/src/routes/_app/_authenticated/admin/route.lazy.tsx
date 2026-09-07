import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY_BASE,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SidebarProvider className="flex-1">
        <PageTopBarHeightContext value={topBarHeight}>
          <TopBarSlotContext value={topBarSlot}>
            <AdminSidebar />
            <AdminContent setTopBarSlot={setTopBarSlot} />
          </TopBarSlotContext>
        </PageTopBarHeightContext>
      </SidebarProvider>
    </div>
  );
}

function AdminContent({ setTopBarSlot }: { setTopBarSlot: (el: HTMLDivElement | null) => void }) {
  return (
    <div className="pr-safe flex min-w-0 flex-1 flex-col pl-3">
      {/* Column already clears iOS safe areas (ml-safe sidebar, pr-safe right);
          adding px-safe here would double-inset on notched phones in landscape. */}
      <div
        ref={setTopBarSlot}
        className={cn(PAGE_TOP_BAR_STICKY_BASE, "mr-safe-neg pr-safe -ml-3 pl-3")}
      />
      <div className="flex flex-1 flex-col pt-3 pb-6">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
