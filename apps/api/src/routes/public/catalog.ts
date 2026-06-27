import type { CatalogResponse } from "@openrift/shared";
import { assembleCatalogStaticParts } from "@openrift/shared/catalog-assembly";
import { catalogContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(catalogContract).$context<ApiContext>().use(requireUser);

/**
 * `GET /catalog`.
 *
 * Cards and printings are both returned as maps keyed by their own id; the id
 * is therefore omitted from each value (identity lives in the key). Sets stay
 * an array.
 *
 * The static parts (sets, cards, printings, custom-tag assignments) are
 * assembled by the shared `assembleCatalogStaticParts` — the exact same pure
 * transform the synced web client runs over Electric rows (ADR-027). This route
 * is a thin DB-fetch + assembly + dynamic-merge caller. `totalCopies` is the
 * only dynamic field merged here; prices live on a separate `/api/v1/prices`
 * endpoint with its own cache lifetime, so the catalog ETag stays stable across
 * daily price refreshes.
 */
export const catalogRouter = {
  catalog: os.catalog.handler(async ({ context }): Promise<CatalogResponse> => {
    const repos = context.repos;
    const { catalog, distributionChannels, customTags } = repos;

    const [
      setRows,
      cardRows,
      printingRows,
      imageRows,
      banRows,
      errataRows,
      markerRows,
      allChannels,
      customTagAssignmentRows,
      totalCopies,
    ] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      catalog.cardBans(),
      catalog.cardErrata(),
      catalog.markersList(),
      distributionChannels.listAll(),
      customTags.assignmentRows(),
      catalog.totalCopies(),
    ]);

    const channelLinkRows = await distributionChannels.listForPrintingIds(
      printingRows.map((printing) => printing.id),
    );

    const staticParts = assembleCatalogStaticParts({
      setRows,
      cardRows,
      printingRows,
      imageRows,
      banRows,
      errataRows,
      markerRows,
      allChannels,
      channelLinkRows,
      customTagAssignmentRows,
    });

    return {
      ...staticParts,
      // Dynamic, per-request community scalar — never part of the synced shape.
      totalCopies,
    };
  }),
};
