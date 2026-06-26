import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
} from "@openrift/shared";
import { catalogContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const os = implement(catalogContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of `GET /catalog`. Logic unchanged from the previous
 * `@hono/zod-openapi` handler.
 *
 * Cards and printings are both returned as maps keyed by their own id; the id
 * is therefore omitted from each value (identity lives in the key). Sets stay
 * an array. Prices live on a separate `/api/v1/prices` endpoint with its own
 * cache lifetime, so the catalog ETag stays stable across daily price refreshes.
 */
export const catalogRouter = {
  catalog: os.catalog.handler(async ({ context }): Promise<CatalogResponse> => {
    const repos = context.repos;
    const { catalog } = repos;

    const [
      sets,
      cardRows,
      printingRows,
      imageRows,
      banRows,
      errataRows,
      totalCopies,
      customTagAssignmentsMap,
    ] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      catalog.cardBans(),
      catalog.cardErrata(),
      catalog.totalCopies(),
      repos.customTags.assignmentsByCard(),
    ]);

    const { markerBySlug, channelsByPrinting } = await loadMarkerAndChannelMaps(
      repos,
      printingRows.map((p) => p.id),
    );

    // Group active bans by card
    const bansByCard = Map.groupBy(banRows, (r) => r.cardId);

    // Build errata lookup (one per card at most)
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

    const cards: Record<string, CatalogResponseCardValue> = {};
    for (const { id, ...rest } of cardRows) {
      cards[id] = {
        ...rest,
        errata: errataByCard.get(id) ?? null,
        bans: (bansByCard.get(id) ?? []).map((b) => ({
          formatId: b.formatId,
          formatName: b.formatName,
          bannedAt: b.bannedAt,
          reason: b.reason,
        })),
      };
    }

    // Build images lookup (null URLs already filtered at the DB level)
    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const printings: Record<string, CatalogResponsePrintingValue> = {};
    for (const { id, markerSlugs, ...rest } of printingRows) {
      printings[id] = {
        ...rest,
        markers: resolveMarkers(markerSlugs, markerBySlug),
        distributionChannels: channelsByPrinting.get(id) ?? [],
        images: (imagesByPrinting.get(id) ?? []).map((i) => ({
          face: i.face,
          imageId: i.imageId,
        })),
      };
    }

    return {
      sets,
      cards,
      printings,
      totalCopies,
      customTagAssignments: Object.fromEntries(customTagAssignmentsMap),
    };
  }),
};
