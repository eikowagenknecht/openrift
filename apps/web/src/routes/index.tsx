import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Session is pre-fetched in the root route's beforeLoad via fetchSession()
    // and stored in the query cache.
    const session = context.queryClient.getQueryData<{ user: unknown } | null>(["session"]);
    if (session?.user) {
      throw redirect({ to: "/cards" });
    }
  },
});
