import type { Marker, PrintingDistributionChannel } from "@openrift/shared";
import { buildChannelsByPrinting, indexMarkersBySlug } from "@openrift/shared/catalog-assembly";

import type { Repos } from "../deps.js";

// The pure transform (marker indexing, channel ancestor-label resolution) lives
// in `@openrift/shared/catalog-assembly` so the same code runs server-side here
// and client-side over Electric-synced rows (ADR-027 catalog vertical). This
// module is the thin server-side adapter: it fetches the rows and hands them to
// the shared builders. `resolveMarkers` is re-exported unchanged for the route
// layer that decorates printing rows one at a time.
export { resolveMarkers } from "@openrift/shared/catalog-assembly";

interface MarkerChannelMaps {
  markerBySlug: Map<string, Marker>;
  channelsByPrinting: Map<string, PrintingDistributionChannel[]>;
}

/**
 * Loads marker metadata + per-printing distribution channel links and indexes
 * them (via the shared pure builders) so route handlers can decorate raw
 * printing rows with the resolved `markers[]` and `distributionChannels[]`
 * arrays expected on the wire.
 *
 * @returns Indexed maps keyed by marker slug and printing id.
 */
export async function loadMarkerAndChannelMaps(
  repos: Repos,
  printingIds: readonly string[],
): Promise<MarkerChannelMaps> {
  const [markerRows, channelRows, allChannels] = await Promise.all([
    repos.catalog.markersList(),
    repos.distributionChannels.listForPrintingIds(printingIds),
    repos.distributionChannels.listAll(),
  ]);

  return {
    markerBySlug: indexMarkersBySlug(markerRows),
    channelsByPrinting: buildChannelsByPrinting(channelRows, allChannels),
  };
}
