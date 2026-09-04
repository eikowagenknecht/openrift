import { legendDisplayName, RENAMED_LANGUAGES } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

interface JsonLdItem {
  name: string;
  url: string;
}

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

    // beforeLoad throws a redirect, which narrows loaderData to never here.
    const items = (loaderData as { items: JsonLdItem[] } | undefined)?.items ?? [];

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
    // Only the JSON-LD item list is returned — the loaderData return value is
    // serialized on top of the dehydrated queries, doubling the payload.
    const [data] = await Promise.all([
      context.queryClient.query({
        ...publicPromoListQueryOptions(params.language),
        staleTime: "static",
      }),
      context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
    ]);
    if (data.printings.length === 0) {
      throw notFound();
    }

    const seenCardIds = new Set<string>();
    const items: JsonLdItem[] = [];
    for (const printing of data.printings) {
      if (seenCardIds.has(printing.cardId)) {
        continue;
      }
      seenCardIds.add(printing.cardId);
      const card = data.cards[printing.cardId];
      if (!card) {
        continue;
      }
      items.push({ name: legendDisplayName(card), url: `/cards/${card.slug}` });
    }
    return { items };
  },
  errorComponent: RouteErrorFallback,
});
