import type {
  AdminMetaEvent,
  AdminMetaPlayer,
  MetaDeckDetailResponse,
  MetaDeckSummary,
  MetaEventDetail,
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
  MetaEventSummary,
  MetaEventWinner,
} from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import type { AdminMetaSubmission } from "@openrift/shared/contracts/admin/meta-submissions";
import type { CardType } from "@openrift/shared/types";

import type { MetaEventSourceLinkRow } from "../repositories/meta-candidates.js";
import type { MetaSubmissionRow } from "../repositories/meta-submissions.js";
import type {
  AdminMetaPlayerRow,
  MetaContributorRow,
  MetaDeckContextRow,
  MetaDeckSummaryRow,
  MetaEventMatchRow,
  MetaEventPhaseRow,
  MetaEventPlayerRow,
  MetaEventSourceRow,
  MetaEventWithCounts,
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
export interface MetaSubmissionResponse {
  id: string;
  eventName: string;
  playerName: string;
  note: string | null;
  status: MetaSubmissionRow["status"];
  resolutionReason: MetaSubmissionRow["resolutionReason"];
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

function toCardRef(
  card: {
    cardId: string | null;
    name: string | null;
    slug: string | null;
    domains: string[] | null;
  },
  images: ImageIds,
): MetaEventPlayer["legend"] {
  if (card.cardId === null) {
    return null;
  }
  return {
    cardId: card.cardId,
    name: card.name ?? "",
    slug: card.slug ?? "",
    imageId: images.get(card.cardId) ?? null,
    domains: card.domains ?? [],
  };
}

/**
 * The champion-led label a player reads ("Azir, Emperor of the Sands") for a
 * row that stores the bare epithet. Null legends stay null, and a card that is
 * not a tagged Legend keeps its own name.
 */
function legendLabel(row: {
  legendName: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
}): string | null {
  return row.legendName === null
    ? null
    : legendDisplayName({
        name: row.legendName,
        types: row.legendTypes ?? [],
        tags: row.legendTags ?? [],
      });
}

/**
 * `event_date` is a `date` column, which the driver already hands back as
 * `"2026-08-14"` (see the OID 1082 override in `db/connect.ts`), so nothing
 * here re-formats it. The timestamptz columns never reach the wire — the
 * archive's public shapes carry no `createdAt` / `updatedAt`.
 */
export function toMetaEventSummary(
  row: MetaEventWithCounts,
  winners: readonly MetaEventWinner[] = [],
): MetaEventSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    tier: row.tier,
    country: row.country,
    location: row.location,
    playerCount: row.playerCount,
    organizer: row.organizer,
    playerRowCount: row.playerRowCount,
    deckCount: row.deckCount,
    winners: [...winners],
  };
}

/**
 * One rank-1 standings row as a list row names it. The champion is left out: an
 * inline winner is one thumbnail wide, and the legend is what names a deck
 * across the archive.
 */
export function toMetaEventWinner(row: MetaEventPlayerRow, images: ImageIds): MetaEventWinner {
  return {
    playerName: row.playerName,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    legend: toCardRef(
      {
        cardId: row.legendCardId,
        name: legendLabel(row),
        slug: row.legendSlug,
        domains: row.legendDomains,
      },
      images,
    ),
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
  row: MetaEventWithCounts,
  options: {
    sources: readonly MetaEventSourceRow[];
    contributors: readonly MetaContributorRow[];
    winners?: readonly MetaEventWinner[];
  },
): MetaEventDetail {
  return {
    ...toMetaEventSummary(row, options.winners ?? []),
    notes: row.notes,
    sources: options.sources.map((source) => toMetaEventSource(source)),
    contributors: options.contributors.map((contributor) => contributor.displayName),
  };
}

/**
 * One row of an event's standings table. Legend and champion artwork is looked
 * up rather than joined, so the caller resolves every card's canonical printing
 * in a single batch instead of once per row. The legend is named the way
 * players say it; the champion's own name already is.
 */
export function toMetaEventPlayer(row: MetaEventPlayerRow, images: ImageIds): MetaEventPlayer {
  return {
    id: row.id,
    rank: row.rank,
    rankIsTier: row.rankIsTier,
    playerName: row.playerName,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    legend: toCardRef(
      {
        cardId: row.legendCardId,
        name: legendLabel(row),
        slug: row.legendSlug,
        domains: row.legendDomains,
      },
      images,
    ),
    champion: toCardRef(
      {
        cardId: row.championCardId,
        name: row.championName,
        slug: row.championSlug,
        domains: row.championDomains,
      },
      images,
    ),
    deckId: row.deckId,
    deckName: row.deckName,
    shareToken: row.shareToken,
    listStatus: row.listStatus,
  };
}

/**
 * One stage of an event. `roundType` travels as the source wrote it: the client
 * needs to tell a cut from the Swiss rounds, and normalizing the vocabulary here
 * would mean guessing at values no source has published yet.
 */
export function toMetaEventPhase(row: MetaEventPhaseRow): MetaEventPhase {
  return {
    phaseOrder: row.phaseOrder,
    name: row.name,
    roundType: row.roundType,
    roundCount: row.roundCount,
    rankRequired: row.rankRequired,
  };
}

/** One match as the event page's round-by-round results render it. */
export function toMetaEventMatch(row: MetaEventMatchRow): MetaEventMatch {
  return {
    phaseOrder: row.phaseOrder,
    roundNumber: row.roundNumber,
    tableNumber: row.tableNumber,
    isBye: row.isBye,
    isDraw: row.isDraw,
    player1Id: row.player1Id,
    player2Id: row.player2Id,
    winnerId: row.winnerId,
    gamesWonP1: row.gamesWonP1,
    gamesWonP2: row.gamesWonP2,
  };
}

/** Composes one archived-deck tile for the cross-event browser. */
export function toMetaDeckSummary(row: MetaDeckSummaryRow, images: ImageIds): MetaDeckSummary {
  return {
    playerId: row.playerId,
    deckId: row.deckId,
    shareToken: row.shareToken,
    listStatus: row.listStatus,
    name: row.deckName,
    format: row.deckFormat,
    legendCardId: row.legendCardId,
    legendName: legendLabel(row),
    legendSlug: row.legendSlug,
    legendImageId: row.legendCardId === null ? null : (images.get(row.legendCardId) ?? null),
    championCardId: row.championCardId,
    championName: row.championName,
    championImageId: row.championCardId === null ? null : (images.get(row.championCardId) ?? null),
    playerName: row.playerName,
    rank: row.rank,
    rankIsTier: row.rankIsTier,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
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
 * the entry's own credit line rather than its event's — one names whoever typed
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
    rank: row.rank,
    rankIsTier: row.rankIsTier,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    contributors: contributors.map((contributor) => contributor.displayName),
  };
}

export function toAdminMetaEvent(
  row: MetaEventWithCounts,
  sources: readonly MetaEventSourceLinkRow[],
): AdminMetaEvent {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    eventDate: row.eventDate,
    format: row.format,
    playerCount: row.playerCount,
    organizer: row.organizer,
    notes: row.notes,
    tier: row.tier,
    country: row.country,
    location: row.location,
    playerRowCount: row.playerRowCount,
    deckCount: row.deckCount,
    sources: sources.map((source) => ({
      candidateEventId: source.candidateEventId,
      provider: source.provider,
    })),
  };
}

export function toAdminMetaPlayer(row: AdminMetaPlayerRow): AdminMetaPlayer {
  return {
    id: row.id,
    rank: row.rank,
    rankIsTier: row.rankIsTier,
    playerName: row.playerName,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    legendCardId: row.legendCardId,
    legendName: row.legendName,
    championCardId: row.championCardId,
    championName: row.championName,
    listStatus: row.listStatus,
    deckId: row.deckId,
    shareToken: row.shareToken,
    deckName: row.deckName,
    deckFormat: row.deckFormat,
    cardCount: row.cardCount,
  };
}

/**
 * The submission as its contributor's own list shows it. The candidate id and
 * the provider key stay off the wire: they are staging details a contributor
 * has no use for, and staging is disposable.
 */
export function toMetaSubmission(row: MetaSubmissionRow): MetaSubmissionResponse {
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
 * candidate row beside it carries that.
 */
export function toAdminMetaSubmission(row: MetaSubmissionRow): AdminMetaSubmission {
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
