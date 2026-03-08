import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useMatch } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { lazy } from "react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { ReloadPrompt } from "@/components/pwa/reload-prompt";
import { Toaster } from "@/components/ui/sonner";
import { SWUpdateProvider } from "@/hooks/use-sw-update";

const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    });

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
});

function RootComponent() {
  const isAdmin = useMatch({ from: "/_authenticated/admin", shouldThrow: false });

  return (
    <NuqsAdapter>
      <SWUpdateProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <Header />
          {isAdmin ? (
            <div className="mx-auto flex w-full max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide) flex-1 flex-col">
              <Outlet />
            </div>
          ) : (
            <>
              <main className="mx-auto flex w-full max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide) flex-1 flex-col px-4 py-6">
                <Outlet />
              </main>
              <Footer />
            </>
          )}
          <Toaster position="bottom-right" />
          <ReloadPrompt />
          <OfflineIndicator />
        </div>
        <TanStackRouterDevtools />
      </SWUpdateProvider>
    </NuqsAdapter>
  );
}
