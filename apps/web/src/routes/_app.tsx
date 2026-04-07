import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";
import { sessionQueryOptions, useSession } from "@/lib/auth-session";
import { CONTAINER_WIDTH, FOOTER_PADDING_NO_TOP } from "@/lib/utils";

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

  return (
    <>
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
