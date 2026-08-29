import type { PromosListResponse } from "@openrift/shared";
import { legendDisplayName, RENAMED_LANGUAGES } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PROMOS_DESCRIPTION =
  "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.";

export const Route = createFileRoute("/_app/promos_/$language")({
  validateSearch: filterSearchSchema,
  beforeLoad: ({ search, location, params }) => {
    // Migration 204 renamed ZH to SC. Links shared before then would 404 in the
    // loader, so send them to the new code instead.
    const renamed = RENAMED_LANGUAGES[params.language.toUpperCase()];
    if (renamed) {
      throw redirect({
        to: "/promos/$language",
        params: { language: renamed },
        search,
        replace: true,
      });
    }

    // Strip unknown / malformed search params from the URL — same pattern as
    // /cards. Bots that follow share/tracking links land on a clean canonical
    // URL, and the visible URL stays tidy for users.
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({
        to: "/promos/$language",
        params: { language: params.language },
        search: cleaned,
        replace: true,
      });
    }
  },
  head: ({ params, loaderData }) => {
    const siteUrl = getSiteUrl();
    const path = `/promos/${params.language}`;
    const head = seoHead({
      siteUrl,
      title: "Promo Cards",
      description: PROMOS_DESCRIPTION,
      path,
    });

    const tuple = loaderData as [PromosListResponse, unknown] | undefined;
    const data = tuple?.[0];

    const seenCardIds = new Set<string>();
    const items: { name: string; url: string }[] = [];
    for (const printing of data?.printings ?? []) {
      if (printing.language !== params.language) {
        continue;
      }
      if (seenCardIds.has(printing.cardId)) {
        continue;
      }
      seenCardIds.add(printing.cardId);
      const card = data?.cards[printing.cardId];
      if (!card) {
        continue;
      }
      items.push({ name: legendDisplayName(card), url: `/cards/${card.slug}` });
    }

    return {
      ...head,
      scripts: [
        collectionPageJsonLd({
          siteUrl,
          name: "Riftbound Promo Cards",
          description: PROMOS_DESCRIPTION,
          path,
          items,
        }),
      ],
    };
  },
  loader: async ({ params, context }) => {
    // Catalog is loaded for set metadata (setId → slug+name) so the Set
    // filter chip can render readable names; PromosListResponse only carries
    // setId for each printing.
    const result = await Promise.all([
      context.queryClient.ensureQueryData(publicPromoListQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
    const [data] = result;
    const hasLanguage = data.printings.some((printing) => printing.language === params.language);
    if (!hasLanguage) {
      throw notFound();
    }
    return result;
  },
  errorComponent: RouteErrorFallback,
});
