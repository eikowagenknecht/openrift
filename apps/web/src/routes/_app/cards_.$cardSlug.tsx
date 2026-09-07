import { marketplaceLabel } from "@openrift/shared/marketplace";
import { priceLookupFromMap } from "@openrift/shared/price-lookup";
import type { CardDetailResponse } from "@openrift/shared/types/api/catalog";
import type { PricesResponse } from "@openrift/shared/types/api/pricing";
import { ALL_MARKETPLACES, MARKETPLACE_CURRENCY } from "@openrift/shared/types/pricing";
import { legendDisplayName } from "@openrift/shared/utils";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import { fetchPricesForSeo, pricesQueryOptions } from "@/hooks/use-prices";
import type { CardMarketplaceOffer } from "@/lib/card-meta";
import {
  buildCardMetaDescription,
  getCardFrontImageFullUrl,
  resolveCardMetaPrinting,
} from "@/lib/card-meta";
import { breadcrumbJsonLd, productJsonLd, seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

const cardDetailSearchSchema = z.object({
  printingId: z.string().optional(),
});

interface CardDetailLoaderData {
  data: CardDetailResponse;
  languageOrder: readonly string[];
  domainLabels: Record<string, string>;
  cardTypeLabels: Record<string, string>;
  marketplaceOffers: CardMarketplaceOffer[];
}

const MARKETPLACE_OFFER_CONFIG = ALL_MARKETPLACES.map((key) => ({
  key,
  seller: marketplaceLabel(key),
  currency: MARKETPLACE_CURRENCY[key],
}));

export const Route = createFileRoute("/_app/cards_/$cardSlug")({
  validateSearch: cardDetailSearchSchema,
  // Empty deps keep the match ID stable across `?printingId=` changes; depending on
  // it would remount the detail subtree (skeleton flash) on every variant switch.
  loaderDeps: () => ({}),
  head: ({ loaderData, match }) => {
    const siteUrl = getSiteUrl();
    const loaded = loaderData as CardDetailLoaderData | undefined;
    const data = loaded?.data;
    if (!data) {
      return seoHead({ siteUrl, title: "Card" });
    }

    // Read from the live search, not loaderData: loaderDeps is empty (see above), so
    // loaderData never carries the per-variant printingId.
    const metaPrinting = resolveCardMetaPrinting(
      data.printings,
      match.search.printingId,
      loaded.languageOrder,
    );
    const imageUrl = toAbsoluteUrl(siteUrl, getCardFrontImageFullUrl(metaPrinting));
    const description = buildCardMetaDescription(
      data.card,
      metaPrinting,
      {
        domains: loaded.domainLabels,
        cardTypes: loaded.cardTypeLabels,
      },
      loaded.marketplaceOffers,
    );
    const cardPath = `/cards/${data.card.slug}`;
    const cardName = legendDisplayName(data.card);
    const titleSuffix =
      loaded.marketplaceOffers.length > 0 ? "Riftbound Card Price & Data" : "Riftbound Card";
    const head = seoHead({
      siteUrl,
      title: `${cardName} - ${titleSuffix}`,
      description,
      path: cardPath,
      ogImage: imageUrl,
      ogType: "product",
    });

    // productJsonLd returns null with no marketplace prices, since Google flags a
    // Product script with no offers as invalid; filtered out below.
    return {
      ...head,
      scripts: [
        productJsonLd({
          siteUrl,
          name: cardName,
          description: `${cardName} is a ${data.card.types.join(" ")} card from Riftbound.`,
          image: imageUrl,
          url: cardPath,
          marketplaceOffers: loaded.marketplaceOffers,
        }),
        breadcrumbJsonLd(siteUrl, [
          { name: "Cards", path: "/cards" },
          { name: cardName, path: cardPath },
        ]),
      ].filter((script) => script !== null),
    };
  },
  loader: async ({ context, params }): Promise<CardDetailLoaderData> => {
    let data: CardDetailResponse;
    let init: Awaited<ReturnType<typeof initQueryOptions.queryFn & object>>;
    try {
      // select: undefined keeps the raw response; the enriched shape drops fields
      // the JSON-LD below still needs.
      [data, init] = await Promise.all([
        context.queryClient.query({
          ...cardDetailQueryOptions(params.cardSlug),
          select: undefined,
          staleTime: "static",
        }),
        context.queryClient.query({ ...initQueryOptions, select: undefined, staleTime: "static" }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
    const languageRows = (init.enums.languages ?? []) as { slug: string; sortOrder: number }[];
    const languageOrder = effectiveLanguageOrder([], languageRows);
    const labelMap = (rows: readonly { slug: string; label: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.slug, row.label]));

    // Server path bypasses the query client: writing prices there gets dehydrated
    // into the SSR HTML, inlining the ~270 KB catalog price map into every page.
    let pricesResponse: PricesResponse;
    try {
      pricesResponse =
        globalThis.window === undefined
          ? await fetchPricesForSeo()
          : await context.queryClient.query({
              ...pricesQueryOptions,
              select: undefined,
              staleTime: "static",
            });
    } catch {
      pricesResponse = { prices: {}, currencies: MARKETPLACE_CURRENCY, stale: {} };
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
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-4")}>
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
