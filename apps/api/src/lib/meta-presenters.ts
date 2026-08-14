import type {
  AdminMetaDeck,
  AdminMetaEvent,
  MetaDeckDetailResponse,
  MetaDeckSummary,
  MetaEventDetail,
  MetaEventSummary,
  MetaStatsResponse,
} from "@openrift/shared";

import type {
  AdminMetaDeckRow,
  MetaCardStatRow,
  MetaDeckContextRow,
  MetaDeckSummaryRow,
  MetaEventWithCount,
} from "../repositories/meta.js";

/**
 * Canonical front image per card id, as resolved by the canonical-printings
 * repo. A card absent from the map, or present with `null`, has no usable
 * artwork and renders as a placeholder.
 */
type ImageIds = ReadonlyMap<string, string | null>;

/**
 * `event_date` is a `date` column, which the driver already hands back as
 * `"2026-08-14"` (see the OID 1082 override in `db/connect.ts`), so nothing
 * here re-formats it. The timestamptz columns never reach the wire — the
 * archive's public shapes carry no `createdAt` / `updatedAt`.
 *
 * @returns The event as a list row.
 */
export function toMetaEventSummary(row: MetaEventWithCount): MetaEventSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    playerCount: row.playerCount,
    organizer: row.organizer,
    deckCount: row.deckCount,
  };
}

/** @returns The event with the long-form fields only its own page renders. */
export function toMetaEventDetail(row: MetaEventWithCount): MetaEventDetail {
  return {
    ...toMetaEventSummary(row),
    sourceUrl: row.sourceUrl,
    notes: row.notes,
  };
}

/**
 * Composes one archived-deck tile. Legend and champion artwork is looked up
 * rather than joined, so the caller resolves every card's canonical printing
 * in a single batch instead of once per deck.
 *
 * @param row The joined deck / placement / event row.
 * @param images Canonical front image ids keyed by card id.
 * @returns The serialized deck summary.
 */
export function toMetaDeckSummary(row: MetaDeckSummaryRow, images: ImageIds): MetaDeckSummary {
  return {
    deckId: row.deckId,
    shareToken: row.shareToken,
    listStatus: row.listStatus,
    name: row.deckName,
    format: row.deckFormat,
    legendCardId: row.legendCardId,
    legendName: row.legendName,
    legendImageId: row.legendCardId === null ? null : (images.get(row.legendCardId) ?? null),
    championCardId: row.championCardId,
    championName: row.championName,
    championImageId: row.championCardId === null ? null : (images.get(row.championCardId) ?? null),
    playerName: row.playerName,
    finishTier: row.finishTier,
    record: row.record,
    event: {
      slug: row.eventSlug,
      name: row.eventName,
      eventDate: row.eventDate,
      format: row.eventFormat,
    },
  };
}

/**
 * The archive panel appended to the public share-deck payload on an archived
 * deck's page.
 * @returns The `meta` block of the deck-detail response.
 */
export function toMetaDeckContext(row: MetaDeckContextRow): MetaDeckDetailResponse["meta"] {
  return {
    event: {
      slug: row.eventSlug,
      name: row.eventName,
      eventDate: row.eventDate,
      format: row.eventFormat,
    },
    listStatus: row.listStatus,
    playerName: row.playerName,
    finishTier: row.finishTier,
    record: row.record,
  };
}

/**
 * @param row A card's inclusion count.
 * @param images Canonical front image ids keyed by card id.
 * @returns One row of a stats table.
 */
export function toMetaStatRow(
  row: MetaCardStatRow,
  images: ImageIds,
): MetaStatsResponse["cards"][number] {
  return {
    cardId: row.cardId,
    name: row.name,
    slug: row.slug,
    imageId: images.get(row.cardId) ?? null,
    deckCount: row.deckCount,
    landscape: row.landscape,
  };
}

/** @returns The event as the admin table shows it — every stored field plus the count. */
export function toAdminMetaEvent(row: MetaEventWithCount): AdminMetaEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    playerCount: row.playerCount,
    organizer: row.organizer,
    sourceUrl: row.sourceUrl,
    notes: row.notes,
    deckCount: row.deckCount,
  };
}

/** @returns One row of an event's admin deck table. */
export function toAdminMetaDeck(row: AdminMetaDeckRow): AdminMetaDeck {
  return {
    deckId: row.deckId,
    shareToken: row.shareToken,
    listStatus: row.listStatus,
    name: row.name,
    format: row.format,
    playerName: row.playerName,
    finishTier: row.finishTier,
    record: row.record,
    cardCount: row.cardCount,
  };
}
