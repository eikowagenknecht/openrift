import { createFileRoute, redirect } from "@tanstack/react-router";

import { catalogQueryOptions } from "@/hooks/use-cards";
import { sessionQueryOptions } from "@/lib/auth-session";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session?.user) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(catalogQueryOptions);
  },
});
