import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ruleVersionsQueryOptions, rulesQueryOptions } from "@/hooks/use-rules";

export const Route = createFileRoute("/_app/rules")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rulesQueryOptions),
      context.queryClient.ensureQueryData(ruleVersionsQueryOptions),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
