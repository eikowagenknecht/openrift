import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PROMOS_DESCRIPTION =
  "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.";

/**
 * Picks a deterministic default language for the /promos redirect. Prefers EN
 * when present; otherwise falls back to the first language alphabetically.
 *
 * @returns The chosen language code, or null when no printings exist.
 */
function pickDefaultLanguage(languages: ReadonlySet<string>): string | null {
  if (languages.has("EN")) {
    return "EN";
  }
  const sorted = [...languages].toSorted();
  return sorted[0] ?? null;
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
      context.queryClient.ensureQueryData(publicPromoListQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
    const languages = new Set(data.printings.map((printing) => printing.language));
    const defaultLanguage = pickDefaultLanguage(languages);
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
