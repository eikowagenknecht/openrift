import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  DistributionChannelWithCount,
  Marketplace,
  PriceMap,
  PromosListResponse,
} from "@openrift/shared";
import { promosListResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";
import { toCardImageVariants } from "../../utils/card-image.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const getPromos = createRoute({
  method: "get",
  path: "/promos",
  tags: ["Promos"],
  responses: {
    200: {
      content: { "application/json": { schema: promosListResponseSchema } },
      description:
        "All event-distribution channels with their printings and cards (the public 'promos' page)",
    },
  },
});

const promosApp = new OpenAPIHono<{ Variables: Variables }>();
promosApp.use("/promos", etag());
export const promosRoute = promosApp.openapi(getPromos, async (c) => {
  const repos = c.get("repos");
  const { catalog, marketplace, distributionChannels } = repos;

  const [eventChannels, printingRows] = await Promise.all([
    distributionChannels.listByKind("event"),
    catalog.eventDistributedPrintings(),
  ]);

  const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
  const printingIds = printingRows.map((p) => p.id);

  const [cardRows, banRows, errataRows, imageRows, priceRows, markerChannelMaps] =
    await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBansByCardIds(cardIds),
      catalog.cardErrataByCardIds(cardIds),
      catalog.printingImagesByPrintingIds(printingIds),
      marketplace.latestPricesForPrintings(printingIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
  const { markerBySlug, channelsByPrinting } = markerChannelMaps;

  const bansByCard = Map.groupBy(banRows, (r) => r.cardId);
  const errataByCard = new Map(
    errataRows.map((r) => [
      r.cardId,
      {
        correctedRulesText: r.correctedRulesText,
        correctedEffectText: r.correctedEffectText,
        source: r.source,
        sourceUrl: r.sourceUrl,
        effectiveDate: r.effectiveDate ? String(r.effectiveDate) : null,
      },
    ]),
  );

  const cards: Record<string, CatalogCardResponse> = Object.fromEntries(
    cardRows.map((r) => [
      r.id,
      {
        ...r,
        errata: errataByCard.get(r.id) ?? null,
        bans: (bansByCard.get(r.id) ?? []).map((b) => ({
          formatId: b.formatId,
          formatName: b.formatName,
          bannedAt: b.bannedAt,
          reason: b.reason,
        })),
      },
    ]),
  );

  const prices: PriceMap = {};
  for (const row of priceRows) {
    let entry = prices[row.printingId];
    if (!entry) {
      entry = {};
      prices[row.printingId] = entry;
    }
    entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
  }

  const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

  const printings: CatalogPrintingResponse[] = printingRows.map(({ markerSlugs, ...rest }) => ({
    ...rest,
    markers: resolveMarkers(markerSlugs, markerBySlug),
    distributionChannels: channelsByPrinting.get(rest.id) ?? [],
    images: (imagesByPrinting.get(rest.id) ?? []).map((i) => ({
      face: i.face,
      ...toCardImageVariants(i.url),
    })),
  }));

  // Count cards + printings per event channel by walking the resolved links.
  const channelCounts = new Map<string, { cards: Set<string>; printings: number }>();
  for (const printing of printings) {
    for (const link of printing.distributionChannels) {
      if (link.channel.kind !== "event") {
        continue;
      }
      let entry = channelCounts.get(link.channel.id);
      if (!entry) {
        entry = { cards: new Set(), printings: 0 };
        channelCounts.set(link.channel.id, entry);
      }
      entry.cards.add(printing.cardId);
      entry.printings += 1;
    }
  }

  // Roll printing counts from each channel up to its ancestors so a parent
  // header can display the aggregate without each page having to re-walk the
  // tree. Cards roll up too, deduplicated by union of child sets.
  const rollupCards = new Map<string, Set<string>>();
  const rollupPrintings = new Map<string, number>();
  const channelById = new Map(eventChannels.map((ch) => [ch.id, ch]));
  for (const [leafId, leafCounts] of channelCounts) {
    let cursorId: string | null = leafId;
    while (cursorId !== null) {
      let cardSet = rollupCards.get(cursorId);
      if (!cardSet) {
        cardSet = new Set();
        rollupCards.set(cursorId, cardSet);
      }
      for (const cardId of leafCounts.cards) {
        cardSet.add(cardId);
      }
      rollupPrintings.set(cursorId, (rollupPrintings.get(cursorId) ?? 0) + leafCounts.printings);
      cursorId = channelById.get(cursorId)?.parentId ?? null;
    }
  }

  const channels: DistributionChannelWithCount[] = eventChannels.map((ch) => ({
    id: ch.id,
    slug: ch.slug,
    label: ch.label,
    description: ch.description,
    kind: "event",
    parentId: ch.parentId,
    childrenLabel: ch.childrenLabel,
    cardCount: rollupCards.get(ch.id)?.size ?? 0,
    printingCount: rollupPrintings.get(ch.id) ?? 0,
  }));

  const content: PromosListResponse = { channels, cards, printings, prices };
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json(content);
});
