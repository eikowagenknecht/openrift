import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { decksQueryOptions } from "@/hooks/use-decks";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/decks/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Decks", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(decksQueryOptions);
  },
  errorComponent: RouteErrorFallback,
});
