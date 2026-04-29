import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { sessionQueryOptions } from "@/lib/auth-session";

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
    // Extend route context with userId so child route loaders can pass it
    // to user-scoped query factories without re-reading the session.
    return { userId: session.user.id };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
