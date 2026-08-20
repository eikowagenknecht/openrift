import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  DistributionChannelKind,
  Marker,
  PrintingDistributionChannel,
} from "@openrift/shared";

import type { Repos } from "../deps.js";

interface MarkerChannelMaps {
  markerBySlug: Map<string, Marker>;
  channelsByPrinting: Map<string, PrintingDistributionChannel[]>;
}

type CardRow = Awaited<ReturnType<Repos["catalog"]["cardsByIds"]>>[number];
type CardBanRow = Awaited<ReturnType<Repos["catalog"]["cardBansByCardIds"]>>[number];
type CardErrataRow = Awaited<ReturnType<Repos["catalog"]["cardErrataByCardIds"]>>[number];
type PrintingRow = Awaited<ReturnType<Repos["catalog"]["printingsBySetId"]>>[number];
type PrintingImageRow = Awaited<
  ReturnType<Repos["catalog"]["printingImagesByPrintingIds"]>
>[number];

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
  const [markerRows, channelRows, allChannels] = await Promise.all([
    repos.catalog.markersList(),
    repos.distributionChannels.listForPrintingIds(printingIds),
    repos.distributionChannels.listAll(),
  ]);

  const markerBySlug = new Map<string, Marker>(markerRows.map((m) => [m.slug, m]));

  // Resolve each channel's ancestor label chain (root → direct parent). The
  // full channel list is small, so an in-memory walk beats a recursive query.
  const channelById = new Map(allChannels.map((c) => [c.id, c]));
  function ancestorLabelsFor(startId: string | null): string[] {
    const labels: string[] = [];
    let cursor = startId;
    let depth = 0;
    while (cursor !== null && depth < 32) {
      const parent = channelById.get(cursor);
      if (!parent) {
        break;
      }
      labels.unshift(parent.label);
      cursor = parent.parentId;
      depth += 1;
    }
    return labels;
  }

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
      ancestorLabels: ancestorLabelsFor(row.channelParentId),
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
 * Narrows a printing row's substitute-art override to what the wire carries.
 *
 * Two shapes never reach a client. `auto` is the default nearly every printing
 * holds, so it is omitted rather than repeated across the whole catalog — an
 * absent field already means "derive it". And a pin whose file has no rehosted
 * copy has no servable id to send, so it is emitted as `auto` too: the client
 * derives a substitute while the rehost is pending, instead of falling back to
 * a placeholder for art we actually have. That leaves one invariant on the
 * wire — `fallbackArtMode: "pinned"` always arrives with a `fallbackImageId`.
 *
 * @returns The override fields to spread onto the response, possibly none.
 */
export function resolveFallbackArt(row: {
  fallbackArtMode: string;
  fallbackImageId: string | null;
}): Pick<CatalogPrintingResponse, "fallbackArtMode" | "fallbackImageId"> {
  if (row.fallbackArtMode === "none") {
    return { fallbackArtMode: "none" };
  }
  if (row.fallbackArtMode === "pinned" && row.fallbackImageId !== null) {
    return { fallbackArtMode: "pinned", fallbackImageId: row.fallbackImageId };
  }
  return {};
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

/**
 * Builds the `cards` lookup shared by the public catalog reads: raw card
 * rows decorated with their resolved errata and ban list, keyed by card id.
 * @returns Card responses keyed by card id.
 */
export function buildCardsResponse(
  cardRows: readonly CardRow[],
  banRows: readonly CardBanRow[],
  errataRows: readonly CardErrataRow[],
): Record<string, CatalogCardResponse> {
  const bansByCard = Map.groupBy(banRows, (r) => r.cardId);
  const errataByCard = new Map(
    errataRows.map((r) => [
      r.cardId,
      {
        correctedRulesText: r.correctedRulesText,
        correctedEffectText: r.correctedEffectText,
        source: r.source,
        sourceUrl: r.sourceUrl,
        effectiveDate: r.effectiveDate,
      },
    ]),
  );

  return Object.fromEntries(
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
}

/**
 * Builds the `printings` list shared by the public catalog reads: raw
 * printing rows decorated with resolved markers, distribution channels, and
 * images.
 * @returns Printing responses in the same order as `printingRows`.
 */
export function buildPrintingsResponse(
  printingRows: readonly PrintingRow[],
  imageRows: readonly PrintingImageRow[],
  markerBySlug: ReadonlyMap<string, Marker>,
  channelsByPrinting: ReadonlyMap<string, PrintingDistributionChannel[]>,
): CatalogPrintingResponse[] {
  const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

  return printingRows.map(({ markerSlugs, fallbackArtMode, fallbackImageId, ...rest }) => ({
    ...rest,
    ...resolveFallbackArt({ fallbackArtMode, fallbackImageId }),
    markers: resolveMarkers(markerSlugs, markerBySlug),
    distributionChannels: channelsByPrinting.get(rest.id) ?? [],
    images: (imagesByPrinting.get(rest.id) ?? []).map((i) => ({
      face: i.face,
      imageId: i.imageId,
    })),
  }));
}
