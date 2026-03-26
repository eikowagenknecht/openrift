import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";
import { sessionQueryOptions } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/_authenticated")({
  errorComponent: RouteErrorFallback,
  beforeLoad: async ({ location, context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  usePreferencesSync();
  return <Outlet />;
}
