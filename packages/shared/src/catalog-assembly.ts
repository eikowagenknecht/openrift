// Pure catalog-response assembly (ADR-027 catalog vertical).
//
// One implementation of "raw DB rows → CatalogResponse static parts", callable
// from both sides of the sync boundary:
//   - the API route (server-side, for SSR / crawlers) feeds rows fetched by the
//     catalog repo;
//   - the future web client feeds rows replicated through Electric shapes.
//
// Everything here is a pure function over plain row shapes — no DB handle, no
// `@openrift/api` import — so the shared package stays self-contained and builds
// first in the turbo graph.
//
// What this module produces is the STATIC, syncable part of the response: the
// `sets`, `cards`, `printings`, and `customTagAssignments` maps, all derivable
// from the syncable tables. The DYNAMIC parts — the `totalCopies` community
// scalar and prices — are NOT produced here; the route merges `totalCopies`
// itself and prices come from the separate `/prices` resource.

import type {
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
  CatalogSetResponse,
} from "./types/api/catalog.js";
import type {
  CardBan,
  CardErrata,
  DistributionChannel,
  DistributionChannelKind,
  Marker,
  PrintingDistributionChannel,
  PrintingImage,
} from "./types/catalog.js";
import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  Rarity,
  SetType,
  SuperType,
} from "./types/enums.js";

// ── Input row shapes ─────────────────────────────────────────────────────────
// Plain, transport-agnostic shapes. Each mirrors exactly what one syncable
// table (or a thin join) yields. The API repo rows and the client's synced rows
// both conform to these.

/** A `sets` row, trimmed to the columns the catalog exposes. */
export interface CatalogSetRowInput {
  id: string;
  slug: string;
  name: string;
  releasedAt: string | null;
  released: boolean;
  setType: SetType;
}

/**
 * A `cards` row plus its derived `domains` / `superTypes` aggregates. Note
 * `cards.comment` is deliberately NOT part of the card wire contract (the
 * catalog card schema omits it), so it is absent here even though the column
 * exists on the table.
 */
export interface CatalogCardRowInput {
  id: string;
  slug: string;
  name: string;
  type: CardType;
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  keywords: string[];
  tags: string[];
  domains: Domain[];
  superTypes: SuperType[];
}

/** An active `card_bans` row joined to its format name. */
export interface CatalogBanRowInput {
  cardId: string;
  formatId: string;
  formatName: string;
  bannedAt: string;
  reason: string | null;
}

/** A `card_errata` row (one per card at most). `effectiveDate` may arrive as a
 * `Date`, an ISO string, or null depending on the driver — normalized here. */
export interface CatalogErrataRowInput {
  cardId: string;
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string | null;
  effectiveDate: string | Date | null;
}

/** A `printings` row (incl. the denormalized `canonicalRank`), trimmed to the
 * columns the catalog exposes. `markerSlugs` is the printing's sorted marker
 * array; markers + channels are resolved here from the lookup inputs. */
export interface CatalogPrintingRowInput {
  id: string;
  cardId: string;
  setId: string;
  shortCode: string;
  rarity: Rarity;
  artVariant: ArtVariant;
  isSigned: boolean;
  finish: Finish;
  artist: string;
  publicCode: string;
  printedRulesText: string | null;
  printedEffectText: string | null;
  flavorText: string | null;
  printedName: string | null;
  printedYear: number | null;
  language: string;
  markerSlugs: string[];
  comment: string | null;
  canonicalRank: number;
}

/** An active `printing_images` row with the resolved `image_files.id`. */
export interface CatalogImageRowInput {
  printingId: string;
  face: PrintingImage["face"];
  imageId: string;
}

/** A `markers` row (the marker vocabulary). */
export interface CatalogMarkerRowInput {
  id: string;
  slug: string;
  label: string;
  description: string | null;
}

/** A `distribution_channels` row (the full channel tree, for ancestor walks). */
export interface CatalogChannelRowInput {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  kind: DistributionChannelKind;
  parentId: string | null;
  childrenLabel: string | null;
}

/** A `printing_distribution_channels` link joined to its channel columns. */
export interface CatalogChannelLinkRowInput {
  printingId: string;
  channelId: string;
  channelSlug: string;
  channelLabel: string;
  channelDescription: string | null;
  channelKind: string;
  channelParentId: string | null;
  channelChildrenLabel: string | null;
  distributionNote: string | null;
}

/** A `card_custom_tags` assignment joined to its tag slug. */
export interface CatalogCustomTagAssignmentRowInput {
  cardId: string;
  slug: string;
}

// ── Marker resolution ────────────────────────────────────────────────────────

/**
 * Index a marker vocabulary by slug.
 *
 * @returns A slug → Marker lookup map.
 */
export function indexMarkersBySlug(
  markerRows: readonly CatalogMarkerRowInput[],
): Map<string, Marker> {
  return new Map(
    markerRows.map((row) => [
      row.slug,
      { id: row.id, slug: row.slug, label: row.label, description: row.description },
    ]),
  );
}

/**
 * Resolve a printing's marker slug array against a slug → Marker map. Skips
 * slugs missing from the map (defensive for stale denormalized data).
 *
 * @returns The full Marker objects for the known slugs.
 */
export function resolveMarkers(
  markerSlugs: readonly string[],
  markerBySlug: ReadonlyMap<string, Marker>,
): Marker[] {
  return markerSlugs
    .map((slug) => markerBySlug.get(slug))
    .filter((marker): marker is Marker => marker !== undefined);
}

// ── Distribution-channel breadcrumbs ─────────────────────────────────────────

/**
 * Build per-printing distribution-channel links, each carrying the resolved
 * ancestor-label chain (root → direct parent). The full channel list is small,
 * so an in-memory walk beats a recursive query. A defensive depth cap guards
 * against a cyclic `parentId` graph.
 *
 * @returns A printing id → channel-links map.
 */
export function buildChannelsByPrinting(
  channelLinkRows: readonly CatalogChannelLinkRowInput[],
  allChannels: readonly CatalogChannelRowInput[],
): Map<string, PrintingDistributionChannel[]> {
  const channelById = new Map(allChannels.map((channel) => [channel.id, channel]));

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
  for (const row of channelLinkRows) {
    const channel: DistributionChannel = {
      id: row.channelId,
      slug: row.channelSlug,
      label: row.channelLabel,
      description: row.channelDescription,
      kind: row.channelKind as DistributionChannelKind,
      parentId: row.channelParentId,
      childrenLabel: row.channelChildrenLabel,
    };
    const link: PrintingDistributionChannel = {
      channel,
      distributionNote: row.distributionNote,
      ancestorLabels: ancestorLabelsFor(row.channelParentId),
    };
    const existing = channelsByPrinting.get(row.printingId);
    if (existing) {
      existing.push(link);
    } else {
      channelsByPrinting.set(row.printingId, [link]);
    }
  }
  return channelsByPrinting;
}

// ── Per-card errata / ban grouping ───────────────────────────────────────────

/**
 * Normalize an errata row's `effectiveDate` into an ISO-ish string (or null),
 * regardless of whether the driver handed back a `Date` or a string.
 *
 * @returns The card → CardErrata lookup map.
 */
export function buildErrataByCard(
  errataRows: readonly CatalogErrataRowInput[],
): Map<string, CardErrata> {
  return new Map(
    errataRows.map((row) => [
      row.cardId,
      {
        correctedRulesText: row.correctedRulesText,
        correctedEffectText: row.correctedEffectText,
        source: row.source,
        sourceUrl: row.sourceUrl,
        effectiveDate: row.effectiveDate === null ? null : String(row.effectiveDate),
      },
    ]),
  );
}

/**
 * Group active bans by card.
 *
 * @returns The card → CardBan[] lookup map.
 */
export function buildBansByCard(banRows: readonly CatalogBanRowInput[]): Map<string, CardBan[]> {
  const bansByCard = new Map<string, CardBan[]>();
  for (const row of banRows) {
    const ban: CardBan = {
      formatId: row.formatId,
      formatName: row.formatName,
      bannedAt: row.bannedAt,
      reason: row.reason,
    };
    const existing = bansByCard.get(row.cardId);
    if (existing) {
      existing.push(ban);
    } else {
      bansByCard.set(row.cardId, [ban]);
    }
  }
  return bansByCard;
}

/**
 * Merge custom-tag assignment rows into a card → sorted-slugs map. Slugs are
 * sorted so the output is deterministic regardless of input ordering.
 *
 * @returns The card → custom-tag-slugs lookup map.
 */
export function buildCustomTagAssignments(
  assignmentRows: readonly CatalogCustomTagAssignmentRowInput[],
): Map<string, string[]> {
  const byCard = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const existing = byCard.get(row.cardId);
    if (existing) {
      existing.push(row.slug);
    } else {
      byCard.set(row.cardId, [row.slug]);
    }
  }
  for (const slugs of byCard.values()) {
    slugs.sort();
  }
  return byCard;
}

// ── Shaping into CatalogResponse parts ───────────────────────────────────────

/** The static, syncable parts of the catalog response (everything except the
 * dynamic `totalCopies` scalar, which the route merges separately). */
export interface CatalogStaticParts {
  sets: CatalogSetResponse[];
  cards: Record<string, CatalogResponseCardValue>;
  printings: Record<string, CatalogResponsePrintingValue>;
  customTagAssignments: Record<string, string[]>;
}

/**
 * Map trimmed set rows to their wire shape (currently a 1:1 passthrough).
 *
 * @returns The wire set objects in input order.
 */
export function shapeSets(setRows: readonly CatalogSetRowInput[]): CatalogSetResponse[] {
  return setRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    releasedAt: row.releasedAt,
    released: row.released,
    setType: row.setType,
  }));
}

/**
 * Build the cards map (keyed by card id; identity lives in the key) with errata
 * + bans merged in.
 *
 * @returns The card-id → wire value record.
 */
export function shapeCards(
  cardRows: readonly CatalogCardRowInput[],
  errataByCard: ReadonlyMap<string, CardErrata>,
  bansByCard: ReadonlyMap<string, CardBan[]>,
): Record<string, CatalogResponseCardValue> {
  const cards: Record<string, CatalogResponseCardValue> = {};
  for (const row of cardRows) {
    cards[row.id] = {
      slug: row.slug,
      name: row.name,
      type: row.type,
      superTypes: row.superTypes,
      domains: row.domains,
      might: row.might,
      energy: row.energy,
      power: row.power,
      keywords: row.keywords,
      tags: row.tags,
      mightBonus: row.mightBonus,
      errata: errataByCard.get(row.id) ?? null,
      bans: bansByCard.get(row.id) ?? [],
    };
  }
  return cards;
}

/**
 * Build the printings map (keyed by printing id) with markers, distribution
 * channels and images resolved from the lookup inputs.
 *
 * @returns The printing-id → wire value record.
 */
export function shapePrintings(
  printingRows: readonly CatalogPrintingRowInput[],
  markerBySlug: ReadonlyMap<string, Marker>,
  channelsByPrinting: ReadonlyMap<string, PrintingDistributionChannel[]>,
  imagesByPrinting: ReadonlyMap<string, PrintingImage[]>,
): Record<string, CatalogResponsePrintingValue> {
  const printings: Record<string, CatalogResponsePrintingValue> = {};
  for (const row of printingRows) {
    printings[row.id] = {
      shortCode: row.shortCode,
      setId: row.setId,
      rarity: row.rarity,
      artVariant: row.artVariant,
      isSigned: row.isSigned,
      markers: resolveMarkers(row.markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(row.id) ?? [],
      finish: row.finish,
      images: imagesByPrinting.get(row.id) ?? [],
      artist: row.artist,
      publicCode: row.publicCode,
      printedRulesText: row.printedRulesText,
      printedEffectText: row.printedEffectText,
      flavorText: row.flavorText,
      printedName: row.printedName,
      printedYear: row.printedYear,
      language: row.language,
      comment: row.comment,
      cardId: row.cardId,
      canonicalRank: row.canonicalRank,
    };
  }
  return printings;
}

/** All raw row inputs needed to assemble the static catalog parts. */
export interface CatalogAssemblyInput {
  setRows: readonly CatalogSetRowInput[];
  cardRows: readonly CatalogCardRowInput[];
  printingRows: readonly CatalogPrintingRowInput[];
  imageRows: readonly CatalogImageRowInput[];
  banRows: readonly CatalogBanRowInput[];
  errataRows: readonly CatalogErrataRowInput[];
  markerRows: readonly CatalogMarkerRowInput[];
  allChannels: readonly CatalogChannelRowInput[];
  channelLinkRows: readonly CatalogChannelLinkRowInput[];
  customTagAssignmentRows: readonly CatalogCustomTagAssignmentRowInput[];
}

/**
 * Group images by printing into the `PrintingImage` wire shape.
 *
 * @returns A printing id → images map.
 */
function buildImagesByPrinting(
  imageRows: readonly CatalogImageRowInput[],
): Map<string, PrintingImage[]> {
  const byPrinting = new Map<string, PrintingImage[]>();
  for (const row of imageRows) {
    const image: PrintingImage = { face: row.face, imageId: row.imageId };
    const existing = byPrinting.get(row.printingId);
    if (existing) {
      existing.push(image);
    } else {
      byPrinting.set(row.printingId, [image]);
    }
  }
  return byPrinting;
}

/**
 * Assemble the full static (syncable) catalog response from raw row inputs.
 * The route wraps this and merges the dynamic `totalCopies` scalar; prices
 * come from the separate `/prices` resource and are never assembled here.
 *
 * @returns The static catalog parts (sets, cards, printings, custom-tag map).
 */
export function assembleCatalogStaticParts(input: CatalogAssemblyInput): CatalogStaticParts {
  const markerBySlug = indexMarkersBySlug(input.markerRows);
  const channelsByPrinting = buildChannelsByPrinting(input.channelLinkRows, input.allChannels);
  const imagesByPrinting = buildImagesByPrinting(input.imageRows);
  const errataByCard = buildErrataByCard(input.errataRows);
  const bansByCard = buildBansByCard(input.banRows);
  const customTagAssignments = buildCustomTagAssignments(input.customTagAssignmentRows);

  return {
    sets: shapeSets(input.setRows),
    cards: shapeCards(input.cardRows, errataByCard, bansByCard),
    printings: shapePrintings(
      input.printingRows,
      markerBySlug,
      channelsByPrinting,
      imagesByPrinting,
    ),
    customTagAssignments: Object.fromEntries(customTagAssignments),
  };
}
