import type { CardDetailResponse, Marketplace, PricesResponse } from "@openrift/shared";
import { MARKETPLACE_CURRENCY, priceLookupFromMap } from "@openrift/shared";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import { pricesQueryOptions } from "@/hooks/use-prices";
import {
  buildCardMetaDescription,
  getCardFrontImageFullUrl,
  resolveCardMetaPrinting,
} from "@/lib/card-meta";
import { breadcrumbJsonLd, productJsonLd, seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";

const cardDetailSearchSchema = z.object({
  printingId: z.string().optional(),
});

interface MarketplaceOffer {
  seller: string;
  currency: string;
  priceLow: number;
  priceHigh: number;
  offerCount: number;
}

interface CardDetailLoaderData {
  data: CardDetailResponse;
  languageOrder: readonly string[];
  domainLabels: Record<string, string>;
  cardTypeLabels: Record<string, string>;
  // Precomputed in the loader from the /prices resource: prices are no
  // longer inlined on CardDetailResponse, so the SSR head can't derive these.
  marketplaceOffers: MarketplaceOffer[];
}

// Currency is sourced from the shared MARKETPLACE_CURRENCY map so the
// JSON-LD offer currency stays in lockstep with how the rest of the app labels
// each marketplace's cents.
const MARKETPLACE_OFFER_CONFIG: { key: Marketplace; seller: string; currency: string }[] = [
  { key: "tcgplayer", seller: "TCGplayer", currency: MARKETPLACE_CURRENCY.tcgplayer },
  { key: "cardmarket", seller: "Cardmarket", currency: MARKETPLACE_CURRENCY.cardmarket },
  { key: "cardtrader", seller: "CardTrader", currency: MARKETPLACE_CURRENCY.cardtrader },
];

export const Route = createFileRoute("/_app/cards_/$cardSlug")({
  validateSearch: cardDetailSearchSchema,
  // Return an empty (stable) deps object so the match ID — hashed from
  // `loaderDeps` — doesn't change when the user clicks through variants and the
  // URL `?printingId=…` is rewritten. Otherwise every variant switch creates a
  // fresh match in `status: "pending"`, throws `loadPromise` to the route's
  // Suspense boundary, briefly renders `CardDetailPending`, and remounts the
  // detail subtree (wasted work + visible skeleton flash on slow connections).
  // The `head` below reads `printingId` from the match's live search (not from
  // loaderData), so the SSR meta tags still pick the right variant for shared
  // links without the loader having to depend on it.
  loaderDeps: () => ({}),
  head: ({ loaderData, match }) => {
    const siteUrl = getSiteUrl();
    const loaded = loaderData as CardDetailLoaderData | undefined;
    const data = loaded?.data;
    if (!data) {
      return seoHead({ siteUrl, title: "Card" });
    }

    // Read `?printingId=X` straight from the match's validated search rather
    // than from loaderData: the loader is memoized on a deliberately empty
    // `loaderDeps` (see above) so it can't carry the per-variant id, but `head`
    // runs against the live search and so unfurls a shared variant link with the
    // matching art and rules text. Falls back to the EN-first preferred printing.
    const metaPrinting = resolveCardMetaPrinting(
      data.printings,
      match.search.printingId,
      loaded.languageOrder,
    );
    const imageUrl = toAbsoluteUrl(siteUrl, getCardFrontImageFullUrl(metaPrinting));
    const description = buildCardMetaDescription(data.card, metaPrinting, {
      domains: loaded.domainLabels,
      cardTypes: loaded.cardTypeLabels,
    });
    // Canonical always points at the query-less card URL so search engines
    // consolidate rankings for all variants onto one page.
    const cardPath = `/cards/${data.card.slug}`;
    const head = seoHead({
      siteUrl,
      title: `${data.card.name} — Riftbound Card`,
      description,
      path: cardPath,
      ogImage: imageUrl,
      ogType: "product",
    });

    // Schema.org Product/Offer JSON-LD. Prices are no longer inlined on the card
    // response; the loader precomputes the per-marketplace offers from
    // the /prices resource so they're available synchronously at SSR time for
    // crawlers that don't execute JS. productJsonLd returns null for a card
    // with no marketplace prices (a Product without offers is invalid to
    // Google), so the script is dropped entirely in that case.
    return {
      ...head,
      scripts: [
        productJsonLd({
          siteUrl,
          name: data.card.name,
          description: `${data.card.name} is a ${data.card.types.join(" ")} card from Riftbound.`,
          image: imageUrl,
          url: cardPath,
          marketplaceOffers: loaded.marketplaceOffers,
        }),
        breadcrumbJsonLd(siteUrl, [
          { name: "Cards", path: "/cards" },
          { name: data.card.name, path: cardPath },
        ]),
      ].filter((script) => script !== null),
    };
  },
  loader: async ({ context, params }): Promise<CardDetailLoaderData> => {
    // Fetch card detail and init in parallel. The head/meta preview picks
    // the preferred printing using the live language sort order from
    // /api/enums — logged-out crawlers fall through to this default.
    let data: CardDetailResponse;
    let init: Awaited<ReturnType<typeof initQueryOptions.queryFn & object>>;
    try {
      [data, init] = await Promise.all([
        context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
        context.queryClient.ensureQueryData(initQueryOptions),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
    const languageRows = (init.enums.languages ?? []) as { slug: string; sortOrder: number }[];
    // Loader runs for crawlers/anonymous users — no user preference available,
    // so pass [] and let the helper fall through to the DB default.
    const languageOrder = effectiveLanguageOrder([], languageRows);
    const labelMap = (rows: readonly { slug: string; label: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.slug, row.label]));

    // Prices come from the /prices resource now, not inlined on the
    // card response. They're SEO-only here, so a price-fetch failure must not
    // break the card page — fall back to no offers.
    let pricesResponse: PricesResponse;
    try {
      pricesResponse = await context.queryClient.ensureQueryData(pricesQueryOptions);
    } catch {
      pricesResponse = { prices: {}, currencies: MARKETPLACE_CURRENCY };
    }
    const priceLookup = priceLookupFromMap(pricesResponse.prices);
    const marketplaceOffers = MARKETPLACE_OFFER_CONFIG.flatMap(({ key, seller, currency }) => {
      // priceLookup returns major units (cents are converted at this boundary).
      const prices = data.printings
        .map((printing) => priceLookup.get(printing.id, key))
        .filter((price): price is number => price !== undefined && price > 0);
      if (prices.length === 0) {
        return [];
      }
      return [
        {
          seller,
          currency,
          priceLow: Math.min(...prices),
          priceHigh: Math.max(...prices),
          offerCount: prices.length,
        },
      ];
    });

    return {
      data,
      languageOrder,
      domainLabels: labelMap(init.enums.domains ?? []),
      cardTypeLabels: labelMap(init.enums.cardTypes ?? []),
      marketplaceOffers,
    };
  },
  component: () => null,
  pendingComponent: CardDetailPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function CardDetailPending() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-4`}>
      <Skeleton className="h-5 w-24" />
      <div>
        <Skeleton className="mb-1 h-8 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        <Skeleton className="aspect-card w-full rounded-xl md:w-80" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
