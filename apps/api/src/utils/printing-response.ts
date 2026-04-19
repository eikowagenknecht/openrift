import type {
  DistributionChannelKind,
  Marker,
  PrintingDistributionChannel,
} from "@openrift/shared";

import type { Repos } from "../deps.js";

interface MarkerChannelMaps {
  markerBySlug: Map<string, Marker>;
  channelsByPrinting: Map<string, PrintingDistributionChannel[]>;
}

/**
 * Loads marker metadata + per-printing distribution channel links and indexes
 * them so route handlers can decorate raw printing rows with the resolved
 * `markers[]` and `distributionChannels[]` arrays expected on the wire.
 *
 * @returns Indexed maps keyed by marker slug and printing id.
 */
export async function loadMarkerAndChannelMaps(
  repos: Repos,
  printingIds: readonly string[],
): Promise<MarkerChannelMaps> {
  const [markerRows, channelRows] = await Promise.all([
    repos.catalog.markersList(),
    repos.distributionChannels.listForPrintingIds(printingIds),
  ]);

  const markerBySlug = new Map<string, Marker>(markerRows.map((m) => [m.slug, m]));

  const channelsByPrinting = new Map<string, PrintingDistributionChannel[]>();
  for (const row of channelRows) {
    const link: PrintingDistributionChannel = {
      channel: {
        id: row.channelId,
        slug: row.channelSlug,
        label: row.channelLabel,
        description: row.channelDescription,
        kind: row.channelKind as DistributionChannelKind,
        parentId: row.channelParentId,
        childrenLabel: row.channelChildrenLabel,
      },
      distributionNote: row.distributionNote,
    };
    const list = channelsByPrinting.get(row.printingId);
    if (list) {
      list.push(link);
    } else {
      channelsByPrinting.set(row.printingId, [link]);
    }
  }

  return { markerBySlug, channelsByPrinting };
}

/**
 * Resolves a printing's marker slug array against a slug→Marker map.
 * Skips slugs missing from the map (defensive for stale denormalized data).
 *
 * @returns A list of full Marker objects.
 */
export function resolveMarkers(
  markerSlugs: readonly string[],
  markerBySlug: ReadonlyMap<string, Marker>,
): Marker[] {
  return markerSlugs
    .map((slug) => markerBySlug.get(slug))
    .filter((m): m is Marker => m !== undefined);
}
