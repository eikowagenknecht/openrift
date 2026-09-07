import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PROMOS_DESCRIPTION =
  "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.";

const PROBE_LANGUAGE = "EN";

function pickDefaultLanguage(languages: readonly string[]): string | null {
  if (languages.includes(PROBE_LANGUAGE)) {
    return PROBE_LANGUAGE;
  }
  return languages.toSorted()[0] ?? null;
}

export const Route = createFileRoute("/_app/promos")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Promo Cards",
      description: PROMOS_DESCRIPTION,
      path: "/promos",
    }),
  loader: async ({ context, location }) => {
    const [data] = await Promise.all([
      context.queryClient.query({
        ...publicPromoListQueryOptions(PROBE_LANGUAGE),
        staleTime: "static",
      }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
    const defaultLanguage = pickDefaultLanguage(data.languages);
    if (defaultLanguage) {
      throw redirect({
        to: "/promos/$language",
        params: { language: defaultLanguage },
        hash: location.hash || undefined,
        replace: true,
      });
    }
    return null;
  },
  errorComponent: RouteErrorFallback,
});
