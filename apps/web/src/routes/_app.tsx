import { createFileRoute, Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppBackground } from "@/components/layout/app-background";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";
import { sessionQueryOptions, useSession } from "@/lib/auth-session";
import { CONTAINER_WIDTH, FOOTER_PADDING_NO_TOP } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    // Preload session so the Header can render auth-dependent UI during SSR
    // (profile icon, gated menu entries). Non-critical: if it fails, the
    // client-side useQuery will retry.
    await context.queryClient.ensureQueryData(sessionQueryOptions()).catch(() => null);
  },
  component: AppLayout,
});

function AppLayout() {
  const { data: session } = useSession();
  usePreferencesSync(Boolean(session?.user));
  const matches = useMatches();
  const hideFooter = matches.some((match) => match.staticData?.hideFooter);

  // The selection store is a singleton — without this, a printing selected on
  // one card-browser surface (e.g. /collections) re-appears in the next
  // surface's detail pane (e.g. /lists/<id>). Close it on every pathname
  // change so the detail belongs to the current page.
  const pathname = useLocation({ select: (loc) => loc.pathname });
  useEffect(() => {
    useSelectionStore.getState().closeDetail();
  }, [pathname]);

  return (
    <>
      <AppBackground />
      <Header />
      <main className={`flex min-h-0 flex-1 flex-col ${CONTAINER_WIDTH}`}>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
        {!hideFooter && <Footer className={FOOTER_PADDING_NO_TOP} />}
      </main>
    </>
  );
}
