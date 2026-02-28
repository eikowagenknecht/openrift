import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { featureFlags } from "@/lib/feature-flags";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (!featureFlags.auth) {
      throw redirect({ to: "/" });
    }
    const { data: session } = await authClient.getSession();
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
