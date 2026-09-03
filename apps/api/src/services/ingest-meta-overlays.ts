import type { MetaIngestEvent } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import type { MetaEntryStatus, MetaEventOverlayField, MetaEventTier } from "@openrift/shared/types";
import {
  META_ENTRY_STATUSES,
  META_EVENT_OVERLAY_FIELDS,
  META_EVENT_TIERS,
  META_PLAYER_OVERLAY_FIELDS,
} from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import type { MetaEventOverlayRow, MetaPlayerOverlayRow } from "../repositories/meta-overlays.js";
import { sourceEventKeyPrefix } from "../repositories/meta-overlays.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";

/**
 * The push endpoint's ingest (ADR-014 revision 3).
 *
 * A push provider has no crawler, so it has no mirror to promote from. Its
 * payload becomes overlays instead: one event overlay keyed `(provider,
 * externalId)` and one player overlay per standings row keyed
 * `(provider, sourcePlayerKey)`, so a re-upload updates both rather than
 * duplicating either.
 *
 * A re-upload that changes nothing is left entirely alone; one that does
 * re-opens review, because a producer that changed its mind must not have the
 * old decision stand. Everything else stays `pending`: these are proposals,
 * and the ADR's curation rule only exempts the official source's own published
 * standings under an admin-set auto-accept rule, which is a fetcher path and
 * not this one.
 *
 * Card names are resolved here so the reviewer sees what will and will not
 * match, but an unresolved name is recorded rather than rejected: the row still
 * carries the name the producer wrote, and promotion re-resolves it if an alias
 * lands later.
 */

interface MetaIngestUnresolved {
  eventExternalId: string;
  playerExternalId: string;
  names: string[];
}

interface MetaIngestEventDetail {
  externalId: string;
  name: string;
}

export interface MetaIngestResult {
  provider: string;
  newEvents: number;
  updatedEvents: number;
  unchangedEvents: number;
  newPlayers: number;
  updatedPlayers: number;
  unchangedPlayers: number;
  ignoredSkipped: number;
  errors: string[];
  newEventDetails: MetaIngestEventDetail[];
  updatedEventDetails: MetaIngestEventDetail[];
  unresolvedCards: MetaIngestUnresolved[];
}

function asTier(value: string | null): MetaEventTier | null {
  return value !== null && (META_EVENT_TIERS as readonly string[]).includes(value)
    ? (value as MetaEventTier)
    : null;
}

function asEntryStatus(value: string | null): MetaEntryStatus | null {
  return value !== null && (META_ENTRY_STATUSES as readonly string[]).includes(value)
    ? (value as MetaEntryStatus)
    : null;
}

/** An upload claims a field only when it carries a value for it; absent, null and empty say nothing. */
function claimedFrom<TField extends string>(
  fields: readonly TField[],
  values: Readonly<Record<string, unknown>>,
): TField[] {
  return fields.filter((field) => {
    const value = values[field];
    return value !== null && value !== undefined && value !== "";
  });
}

export async function ingestMetaOverlays(
  repos: Repos,
  provider: string,
  events: readonly MetaIngestEvent[],
  submittedByUserId: string,
): Promise<MetaIngestResult> {
  if (provider.trim() === "") {
    throw new Error("provider name must not be empty");
  }

  const result: MetaIngestResult = {
    provider,
    newEvents: 0,
    updatedEvents: 0,
    unchangedEvents: 0,
    newPlayers: 0,
    updatedPlayers: 0,
    unchangedPlayers: 0,
    ignoredSkipped: 0,
    errors: [],
    newEventDetails: [],
    updatedEventDetails: [],
    unresolvedCards: [],
  };

  const [ignoredEvents, ignoredPlayers, cardIndex] = await Promise.all([
    repos.metaOverlays.ignoredEventIds(provider),
    repos.metaOverlays.ignoredPlayerKeys(provider),
    loadCardNameIndex(repos.ingest),
  ]);
  const ignoredEventKeys = new Set(ignoredEvents);
  const ignoredPlayerKeys = new Set(
    ignoredPlayers.map((key) => playerSourceKey(key.eventExternalId, key.externalId)),
  );

  const existing = await repos.metaOverlays.eventOverlaysBySourceKeys(
    provider,
    events.map((event) => event.externalId),
  );
  const existingByKey = new Map(existing.map((row) => [row.externalId ?? "", row]));
  const priorPlayers = await repos.metaOverlays.playerOverlaysBySourceKeys(
    provider,
    events.flatMap((event) =>
      event.players.map((player) => playerSourceKey(event.externalId, player.externalId)),
    ),
  );
  const priorPlayersByKey = new Map(priorPlayers.map((row) => [row.sourcePlayerKey ?? "", row]));
  const priorCards = await repos.metaOverlays.cardsByOverlayIds(priorPlayers.map((row) => row.id));

  for (const event of events) {
    if (ignoredEventKeys.has(event.externalId)) {
      result.ignoredSkipped++;
      continue;
    }

    const facts = {
      name: event.name,
      eventDate: event.eventDate,
      format: event.format,
      playerCount: event.playerCount,
      organizer: event.organizer,
      notes: event.notes === "" ? null : event.notes,
      tier: asTier(event.tier),
      country: event.country,
      location: event.location,
    };
    const values = {
      provider,
      externalId: event.externalId,
      ...facts,
      claimedFields: claimedFrom(META_EVENT_OVERLAY_FIELDS, facts),
      submittedByUserId,
    };

    const prior = existingByKey.get(event.externalId);
    let eventOverlayId: string;
    if (prior === undefined) {
      eventOverlayId = await repos.metaOverlays.insertEventOverlay(values);
      result.newEvents++;
      result.newEventDetails.push({ externalId: event.externalId, name: event.name });
    } else if (sameEventPayload(prior, values)) {
      eventOverlayId = prior.id;
      result.unchangedEvents++;
    } else {
      // A re-upload that moved something restates the whole event, so it also
      // re-opens review: a producer that changed its mind must not have the
      // old decision stand.
      await repos.metaOverlays.updateEventOverlay(prior.id, {
        ...values,
        status: "pending",
        acceptedAt: null,
      });
      eventOverlayId = prior.id;
      result.updatedEvents++;
      result.updatedEventDetails.push({ externalId: event.externalId, name: event.name });
    }

    await ingestPlayers(repos, {
      event,
      eventOverlayId,
      metaEventId: prior?.metaEventId ?? null,
      provider,
      submittedByUserId,
      cardIndex,
      ignoredPlayerKeys,
      priorPlayersByKey,
      priorCards,
      result,
    });
  }

  return result;
}

/**
 * The composite key one pushed standings row is stored under.
 *
 * External ids may contain any character the producer likes, so the halves are
 * not joined on a separator: PostgreSQL text cannot hold a NUL, and every
 * character it can hold is one an id is allowed to contain. Length-prefixing
 * the event id keeps the pair recoverable whatever either half holds.
 */
export function playerSourceKey(eventExternalId: string, playerExternalId: string): string {
  return `${sourceEventKeyPrefix(eventExternalId)}${playerExternalId}`;
}

/** The two provider keys back out of a stored {@link playerSourceKey}. */
export function splitSourcePlayerKey(key: string | null): {
  eventExternalId: string | null;
  playerExternalId: string | null;
} {
  const unkeyed = { eventExternalId: null, playerExternalId: null };
  if (key === null) {
    return unkeyed;
  }
  const cut = key.indexOf(":");
  if (cut < 1 || !/^\d+$/u.test(key.slice(0, cut))) {
    return unkeyed;
  }
  const start = cut + 1;
  const end = start + Number(key.slice(0, cut));
  if (end > key.length) {
    return unkeyed;
  }
  return { eventExternalId: key.slice(start, end), playerExternalId: key.slice(end) };
}

const EVENT_COMPARE_COLUMNS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
  "tier",
  "country",
  "location",
] as const satisfies readonly MetaEventOverlayField[];

function sameEventPayload(prior: MetaEventOverlayRow, values: Record<string, unknown>): boolean {
  return EVENT_COMPARE_COLUMNS.every((column) => prior[column] === values[column]);
}

interface OverlayCardLine {
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
  cardId: string | null;
}

/** The card a list files in one singleton zone, resolved. */
function zoneCardId(cards: readonly OverlayCardLine[], zone: string): string | null {
  return cards.find((card) => card.zone === zone)?.cardId ?? null;
}

interface PlayerIngestContext {
  event: MetaIngestEvent;
  eventOverlayId: string;
  /** Set once the event overlay has been accepted, so players target live. */
  metaEventId: string | null;
  provider: string;
  submittedByUserId: string;
  cardIndex: Awaited<ReturnType<typeof loadCardNameIndex>>;
  ignoredPlayerKeys: ReadonlySet<string>;
  priorPlayersByKey: ReadonlyMap<string, MetaPlayerOverlayRow>;
  priorCards: ReadonlyMap<string, readonly OverlayCardLine[]>;
  result: MetaIngestResult;
}

const PLAYER_COMPARE_COLUMNS = [
  "playerName",
  "rank",
  "rankIsTier",
  "wins",
  "losses",
  "draws",
  "matchPoints",
  "opponentMatchWinPct",
  "gameWinPct",
  "opponentGameWinPct",
  "entryStatus",
  "legendCardId",
  "championCardId",
  "listStatus",
] as const;

function samePlayerPayload(
  prior: MetaPlayerOverlayRow,
  values: Record<string, unknown>,
  priorLines: readonly OverlayCardLine[],
  lines: readonly OverlayCardLine[],
): boolean {
  if (!PLAYER_COMPARE_COLUMNS.every((column) => prior[column] === values[column])) {
    return false;
  }
  if (priorLines.length !== lines.length) {
    return false;
  }
  return lines.every((line, index) => {
    const held = priorLines[index];
    return (
      held !== undefined &&
      held.zone === line.zone &&
      held.quantity === line.quantity &&
      held.cardName === line.cardName &&
      held.cardId === line.cardId
    );
  });
}

async function ingestPlayers(repos: Repos, ctx: PlayerIngestContext): Promise<void> {
  for (const player of ctx.event.players) {
    const key = playerSourceKey(ctx.event.externalId, player.externalId);
    if (ctx.ignoredPlayerKeys.has(key)) {
      ctx.result.ignoredSkipped++;
      continue;
    }

    const unresolved: string[] = [];
    const namedLegendCardId =
      player.legendName === null ? null : resolveCardIdByName(ctx.cardIndex, player.legendName);
    if (player.legendName !== null && namedLegendCardId === null) {
      unresolved.push(player.legendName);
    }
    const namedChampionCardId =
      player.championName === null ? null : resolveCardIdByName(ctx.cardIndex, player.championName);
    if (player.championName !== null && namedChampionCardId === null) {
      unresolved.push(player.championName);
    }

    const cards: OverlayCardLine[] = (player.cards ?? []).map((card, index) => {
      const cardId = resolveCardIdByName(ctx.cardIndex, card.name);
      if (cardId === null) {
        unresolved.push(card.name);
      }
      return {
        lineNumber: index,
        zone: card.zone,
        quantity: card.quantity,
        cardName: card.name,
        cardId,
      };
    });

    // The list's own zones stand in for the two fields a source rarely names
    // beside the standings: no adapter publishes a champion, and every archived
    // list carries one in its champion zone. Without this the deck tiles and
    // the legend pages read a null the list itself disproves.
    const legendCardId = namedLegendCardId ?? zoneCardId(cards, WellKnown.deckZone.LEGEND);
    const championCardId = namedChampionCardId ?? zoneCardId(cards, WellKnown.deckZone.CHAMPION);

    const facts = {
      playerName: player.playerName,
      rank: player.rank,
      rankIsTier: player.rankIsTier,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      matchPoints: player.matchPoints,
      opponentMatchWinPct: player.opponentMatchWinPct,
      gameWinPct: player.gameWinPct,
      opponentGameWinPct: player.opponentGameWinPct,
      entryStatus: asEntryStatus(player.entryStatus),
      legendCardId,
      championCardId,
      // The mask CHECK refuses an unclaimed value, and a standings-only row
      // claims no list, so its status column stays NULL rather than "none".
      listStatus: player.cards === null ? null : player.listStatus,
    };
    const values = {
      ...facts,
      claimedFields: claimedFrom(META_PLAYER_OVERLAY_FIELDS, { ...facts, cards: player.cards }),
      submittedByUserId: ctx.submittedByUserId,
    };

    const prior = ctx.priorPlayersByKey.get(key);
    if (prior === undefined) {
      await repos.metaOverlays.insertPlayerOverlay(
        {
          // A player hangs off the live event once one exists, and off the
          // proposal until then, so accepting the event carries its field along.
          metaEventId: ctx.metaEventId,
          eventOverlayId: ctx.metaEventId === null ? ctx.eventOverlayId : null,
          metaEventPlayerId: null,
          provider: ctx.provider,
          sourcePlayerKey: key,
          ...values,
        },
        cards,
      );
      ctx.result.newPlayers++;
    } else if (samePlayerPayload(prior, values, ctx.priorCards.get(prior.id) ?? [], cards)) {
      ctx.result.unchangedPlayers++;
    } else {
      // The anchor is left alone: a row already linked to a live entry keeps
      // its link, and re-opening review is what protects the live value.
      await repos.metaOverlays.updatePlayerOverlay(
        prior.id,
        { ...values, status: "pending", acceptedAt: null },
        cards,
      );
      ctx.result.updatedPlayers++;
    }

    if (unresolved.length > 0) {
      ctx.result.unresolvedCards.push({
        eventExternalId: ctx.event.externalId,
        playerExternalId: player.externalId,
        names: [...new Set(unresolved)],
      });
    }
  }
}
