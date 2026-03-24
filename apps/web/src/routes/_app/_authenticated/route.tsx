import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_authenticated")({
  beforeLoad: ({ location, context }) => {
    // Session is pre-fetched in the root route's beforeLoad via fetchSession()
    // and stored in the query cache.
    const session = context.queryClient.getQueryData<{ user: unknown } | null>(["session"]);
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
  return <Outlet />;
}
