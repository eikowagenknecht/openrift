import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Footer } from "@/components/layout/footer";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBarHeightContext,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { TopBarSlotContext } from "./route";

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
      {/* Page top bar lives in the content column (not full-width above the sidebar)
          so the sidebar can rise to the header. -mx-3 full-bleeds the blur across the
          column while PAGE_TOP_BAR_STICKY's own px-safe keeps its content aligned. */}
      <div ref={setTopBarSlot} className={cn(PAGE_TOP_BAR_STICKY, "-mx-3")} />
      <div className="flex flex-1 flex-col pb-6">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
