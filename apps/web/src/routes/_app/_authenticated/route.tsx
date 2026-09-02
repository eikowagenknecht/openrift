import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { useSessionExpiredRedirect } from "@/hooks/use-session-expired-redirect";
import { sessionQueryOptions } from "@/lib/auth-session";

export const Route = createFileRoute("/_app/_authenticated")({
  errorComponent: RouteErrorFallback,
  beforeLoad: async ({ location, context }) => {
    const session = await context.queryClient.query({
      ...sessionQueryOptions(),
      staleTime: "static",
    });
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
  // beforeLoad above only guards navigation INTO the layout. If the session
  // expires while the user is already here, the children must unmount in the
  // same render that observes the null session — otherwise a mounted
  // user-scoped component (deck editor, collection grid, …) re-renders first
  // and useRequiredUserId() throws into the error boundary. The hook schedules
  // the /login redirect; rendering null here does the immediate unmount.
  const sessionExpired = useSessionExpiredRedirect();
  if (sessionExpired) {
    return null;
  }
  return <Outlet />;
}
