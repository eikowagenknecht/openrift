import type { CardDetailResponse, Marketplace } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import {
  buildCardMetaDescription,
  getCardFrontImageFullUrl,
  pickCardMetaPrinting,
} from "@/lib/card-meta";
import { breadcrumbJsonLd, productJsonLd, seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";

const cardDetailSearchSchema = z.object({
  printingId: z.string().optional(),
});

interface CardDetailLoaderData {
  data: CardDetailResponse;
  printingId: string | undefined;
  languageOrder: readonly string[];
  domainLabels: Record<string, string>;
  cardTypeLabels: Record<string, string>;
}

const MARKETPLACE_OFFER_CONFIG: { key: Marketplace; seller: string; currency: string }[] = [
  { key: "tcgplayer", seller: "TCGplayer", currency: "USD" },
  { key: "cardmarket", seller: "Cardmarket", currency: "EUR" },
  { key: "cardtrader", seller: "CardTrader", currency: "EUR" },
];

export const Route = createFileRoute("/_app/cards_/$cardSlug")({
  validateSearch: cardDetailSearchSchema,
  loaderDeps: ({ search }) => ({ printingId: search.printingId }),
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const loaded = loaderData as CardDetailLoaderData | undefined;
    const data = loaded?.data;
    if (!data) {
      return seoHead({ siteUrl, title: "Card" });
    }

    // If the URL carries `?printingId=X` for a real printing, feature that
    // variant in the meta tags so shared links unfurl with the matching art
    // and rules text. Fall back to the EN-first preferred printing otherwise.
    const linked = loaded?.printingId
      ? data.printings.find((p) => p.id === loaded.printingId)
      : undefined;
    const metaPrinting = linked ?? pickCardMetaPrinting(data.printings, loaded.languageOrder);
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
    });

    // Schema.org Product/Offer JSON-LD reads from the response's `prices` sibling
    // (not from each printing) so the data is available synchronously at SSR time
    // for crawlers that don't execute JS. Each marketplace becomes its own offer
    // so the markup correctly attributes the listing to the third-party seller.
    const marketplaceOffers = MARKETPLACE_OFFER_CONFIG.flatMap(({ key, seller, currency }) => {
      const prices = data.printings
        .map((p) => data.prices[p.id]?.[key])
        .filter((price): price is number => price !== undefined && price > 0);
      if (prices.length === 0) {
        return [];
      }
      return [{ seller, currency, priceLow: Math.min(...prices), priceHigh: Math.max(...prices) }];
    });

    return {
      ...head,
      scripts: [
        productJsonLd({
          siteUrl,
          name: data.card.name,
          description: `${data.card.name} is a ${data.card.type} card from Riftbound.`,
          image: imageUrl,
          url: cardPath,
          marketplaceOffers,
        }),
        breadcrumbJsonLd(siteUrl, [
          { name: "Cards", path: "/cards" },
          { name: data.card.name, path: cardPath },
        ]),
      ],
    };
  },
  loader: async ({ context, params, deps }): Promise<CardDetailLoaderData> => {
    // Fetch card detail and init in parallel. The head/meta preview picks
    // the preferred printing using the live language sort order from
    // /api/enums — logged-out crawlers fall through to this default.
    const [data, init] = await Promise.all([
      context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
    const languageRows = (init.enums.languages ?? []) as { slug: string; sortOrder: number }[];
    // Loader runs for crawlers/anonymous users — no user preference available,
    // so pass [] and let the helper fall through to the DB default.
    const languageOrder = effectiveLanguageOrder([], languageRows);
    const labelMap = (rows: readonly { slug: string; label: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.slug, row.label]));
    return {
      data,
      printingId: deps.printingId,
      languageOrder,
      domainLabels: labelMap(init.enums.domains ?? []),
      cardTypeLabels: labelMap(init.enums.cardTypes ?? []),
    };
  },
  component: () => null,
  pendingComponent: CardDetailPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
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
