import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { loansQueryOptions } from "@/features/groups/hooks/use-loans";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/loans")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Lending", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...loansQueryOptions(context.userId), staleTime: "static" });
  },
  errorComponent: RouteErrorFallback,
});
