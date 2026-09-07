import type { ReactNode } from "react";
import { use } from "react";
import { createPortal } from "react-dom";

import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { useSidebar } from "@/components/ui/sidebar";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/admin/route";

interface AdminPageTopBarProps {
  title: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
}

/**
 * Per-page sticky top bar for admin pages. Portals a {@link PageTopBar} with
 * the page title (sidebar toggle on mobile) and optional actions into the
 * admin layout's sticky slot. Render it once at the top of every admin page.
 */
export function AdminPageTopBar({ title, back, actions }: AdminPageTopBarProps) {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);

  if (!topBarSlot) {
    return null;
  }

  return createPortal(
    <PageTopBar>
      {back}
      <PageTopBarTitle onToggleSidebar={toggleSidebar}>{title}</PageTopBarTitle>
      {actions && <PageTopBarActions>{actions}</PageTopBarActions>}
    </PageTopBar>,
    topBarSlot,
  );
}
