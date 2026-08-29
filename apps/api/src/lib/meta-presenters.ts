import type {
  AdminMetaDeck,
  AdminMetaEvent,
  MetaDeckDetailResponse,
  MetaDeckSummary,
  MetaEventDetail,
  MetaEventSummary,
  MetaStatsResponse,
} from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import type { AdminMetaSubmission } from "@openrift/shared/contracts/admin/meta-submissions";

import type { MetaDeckSubmissionRow } from "../repositories/meta-submissions.js";
import type {
  AdminMetaDeckRow,
  MetaCardStatRow,
  MetaContributorRow,
  MetaDeckContextRow,
  MetaDeckSummaryRow,
  MetaEventSourceRow,
  MetaEventWithCount,
} from "../repositories/meta.js";

/**
 * One citation as a page prints it. `provider` and `externalId` are null
 * together for a hand-entered row; they travel because the admin review screen
 * keys its source columns on them, and neither is a secret.
 */
export interface MetaEventSourceResponse {
  id: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
}

/** One user submission as the contributor's own list shows it. */
export interface MetaDeckSubmissionResponse {
  id: string;
  eventName: string;
  playerName: string;
  note: string | null;
  status: MetaDeckSubmissionRow["status"];
  resolutionReason: MetaDeckSubmissionRow["resolutionReason"];
  resolutionNote: string | null;
  acceptedDeckId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

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

export function toMetaEventSource(row: MetaEventSourceRow): MetaEventSourceResponse {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    label: row.label,
    sourceUrl: row.sourceUrl,
  };
}

/**
 * The event with the long-form fields only its own page renders, plus its
 * citations and contributors.
 *
 * Contributors arrive as resolved display strings and never as user ids: the
 * repo has already dropped anyone on `hidden` and anyone whose chosen profile
 * field is blank, and a credit is deliberately plain text with no profile link
 * behind it.
 */
export function toMetaEventDetail(
  row: MetaEventWithCount,
  options: {
    sources: readonly MetaEventSourceRow[];
    contributors: readonly MetaContributorRow[];
  },
): MetaEventDetail {
  return {
    ...toMetaEventSummary(row),
    notes: row.notes,
    sources: options.sources.map((source) => toMetaEventSource(source)),
    contributors: options.contributors.map((contributor) => contributor.displayName),
  };
}

/**
 * Composes one archived-deck tile. Legend and champion artwork is looked up
 * rather than joined, so the caller resolves every card's canonical printing
 * in a single batch instead of once per deck.
 */
export function toMetaDeckSummary(row: MetaDeckSummaryRow, images: ImageIds): MetaDeckSummary {
  return {
    deckId: row.deckId,
    shareToken: row.shareToken,
    listStatus: row.listStatus,
    name: row.deckName,
    format: row.deckFormat,
    legendCardId: row.legendCardId,
    legendName:
      row.legendName === null
        ? null
        : legendDisplayName({
            name: row.legendName,
            types: row.legendTypes ?? [],
            tags: row.legendTags ?? [],
          }),
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
 *
 * Contributors arrive resolved and pre-filtered, exactly as they do on the
 * event page: the repo has already dropped anyone on `hidden` and anyone whose
 * chosen profile field is blank, so a user id never reaches the wire. This is
 * the deck's own credit line rather than its event's — one names whoever typed
 * in this list, the other everyone who fed the tournament.
 */
export function toMetaDeckContext(
  row: MetaDeckContextRow,
  contributors: readonly MetaContributorRow[],
): MetaDeckDetailResponse["meta"] {
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
    contributors: contributors.map((contributor) => contributor.displayName),
  };
}

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

export function toAdminMetaEvent(row: MetaEventWithCount): AdminMetaEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    playerCount: row.playerCount,
    organizer: row.organizer,
    notes: row.notes,
    deckCount: row.deckCount,
  };
}

/**
 * The submission as its contributor's own list shows it. The candidate id and
 * the provider key stay off the wire: they are staging details a contributor
 * has no use for, and staging is disposable.
 */
export function toMetaDeckSubmission(row: MetaDeckSubmissionRow): MetaDeckSubmissionResponse {
  return {
    id: row.id,
    eventName: row.eventName,
    playerName: row.playerName,
    note: row.note,
    status: row.status,
    resolutionReason: row.resolutionReason,
    resolutionNote: row.resolutionNote,
    acceptedDeckId: row.acceptedDeckId,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/**
 * The submission as the reviewing admin sees it: the contributor's claim plus
 * whatever outcome it carries. The submitter's identity is left out — the
 * candidate deck beside it carries that.
 */
export function toAdminMetaSubmission(row: MetaDeckSubmissionRow): AdminMetaSubmission {
  return {
    id: row.id,
    eventName: row.eventName,
    playerName: row.playerName,
    note: row.note,
    status: row.status,
    reason: row.resolutionReason,
    resolutionNote: row.resolutionNote,
    acceptedDeckId: row.acceptedDeckId,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

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
