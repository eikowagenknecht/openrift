import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";
import { useSession } from "@/lib/auth-client";
import { CONTAINER_WIDTH, FOOTER_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { data: session } = useSession();
  usePreferencesSync(Boolean(session?.user));
  const matches = useMatches();
  const hideFooter = matches.some((match) => match.staticData?.hideFooter);

  return (
    <>
      <Header />
      <main className={`flex flex-1 flex-col ${CONTAINER_WIDTH}`}>
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
        {!hideFooter && <Footer className={FOOTER_PADDING_NO_TOP} />}
      </main>
    </>
  );
}
