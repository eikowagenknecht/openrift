import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/layout/header";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";
import { useSession } from "@/lib/auth-client";
import { CONTAINER_WIDTH } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { data: session } = useSession();
  usePreferencesSync(Boolean(session?.user));

  return (
    <>
      <Header />
      <main className={`flex flex-1 flex-col ${CONTAINER_WIDTH}`}>
        <Outlet />
      </main>
    </>
  );
}
