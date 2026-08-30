/**
 * External tooling pushes `{ provider, events: [...] }`; each uploaded event
 * wholly replaces its own candidate — fields and standings alike — and events
 * the payload does not name are left alone. There is deliberately no
 * provider-wide replace: a full dump could be huge, and a partial push must
 * stay safe.
 *
 * The shape follows the card pipeline (`ingest-candidates.ts`): dedup the
 * payload first, validate per item and skip the bad ones rather than failing the
 * batch, bulk-read everything before the write loop, and reset `checked_at`
 * whenever an upload disagrees with what a human already reviewed.
 *
 * Three things this pipeline adds. Names — card lines, legends, champions —
 * resolve through the *shared* matcher in `candidate-links.ts`, so an alias fix
 * made for the card pipeline applies here too. A candidate that is already
 * linked to a live row and has nothing to change against it settles itself
 * (`checked_at = now`) at ingest, so a re-upload of an event the admin already
 * accepted never re-enters the review queue. And an ignored key is skipped
 * without its stored row being touched: the ignore keeps the row and its live
 * link, so re-uploading an ignored player updates nothing rather than staging a
 * duplicate.
 */
import { WellKnown } from "@openrift/shared";
import type { MetaIngestEvent, MetaIngestEventPlayer } from "@openrift/shared";
import { META_ENTRY_STATUSES, META_EVENT_TIERS } from "@openrift/shared/types";
import type { MetaEntryStatus, MetaEventTier, MetaListStatus } from "@openrift/shared/types";

import type { CandidateMetaDeckCard } from "../db/index.js";
import type { Transact } from "../deps.js";
import { isValidIsoDate } from "../lib/iso-date.js";
import type { MetaDeckCardEntry } from "../lib/meta-candidate-diff.js";
import {
  collapseCardEntries,
  diffMetaEvent,
  diffMetaPlayer,
  hasPlayerDiff,
  normalize,
  resolveMetaPlayerCards,
} from "../lib/meta-candidate-diff.js";
import type { LiveMetaPlayerRow } from "../repositories/meta.js";
import type { CardNameIndex } from "./candidate-links.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";

interface MetaIngestEventDetail {
  externalId: string;
  name: string;
}

/** A candidate standings row the upload dropped because its event no longer lists it. */
interface MetaIngestPlayerDetail {
  eventExternalId: string;
  externalId: string;
  playerName: string;
}

/** Card names in one list that matched no live card, so it cannot be accepted yet. */
interface MetaIngestUnresolvedCards {
  eventExternalId: string;
  playerExternalId: string;
  names: string[];
}

/** What one upload did. Counts for the summary line, arrays for the detail panel. */
export interface MetaIngestResult {
  provider: string;
  newEvents: number;
  updatedEvents: number;
  unchangedEvents: number;
  newPlayers: number;
  updatedPlayers: number;
  removedPlayers: number;
  unchangedPlayers: number;
  /** Events and players skipped because their key is on an ignore list. */
  ignoredSkipped: number;
  /** One line per dropped duplicate and per item that failed validation. */
  errors: string[];
  newEventDetails: MetaIngestEventDetail[];
  updatedEventDetails: MetaIngestEventDetail[];
  removedPlayerDetails: MetaIngestPlayerDetail[];
  unresolvedCards: MetaIngestUnresolvedCards[];
}

const DECK_ZONES = new Set<string>(Object.values(WellKnown.deckZone));

/**
 * External player ids are only unique within an event, so anything that spans
 * events — the ignore list above all — has to pair the two. The separator is a
 * newline, which no source id contains.
 */
function playerKey(eventExternalId: string, externalId: string): string {
  return `${eventExternalId}\n${externalId}`;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isCount(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function inBounds(value: string | null, min: number, max: number): boolean {
  return value === null || (value.length >= min && value.length <= max);
}

/** A tiebreaker percentage, against the same 0..1 the column CHECKs. */
function isFraction(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 1);
}

/**
 * The wire's free-text status narrowed to the column's vocabulary. Anything else
 * is null here and a reported problem in {@link validatePlayer}, so a producer's
 * unknown status skips the row instead of tripping the CHECK.
 */
function asEntryStatus(value: string | null): MetaEntryStatus | null {
  return value !== null && (META_ENTRY_STATUSES as readonly string[]).includes(value)
    ? (value as MetaEntryStatus)
    : null;
}

/**
 * Checked against the same bounds the table's CHECK constraints enforce.
 *
 * `format` is deliberately not checked against `deck_formats`: a candidate
 * carries whatever the source called it, and an unknown format is something the
 * review screen reports, not a reason to drop the event.
 */
function validateEvent(event: MetaIngestEvent): string[] {
  const problems: string[] = [];
  if (event.externalId.trim() === "") {
    problems.push("externalId must not be empty");
  }
  if (!inBounds(event.name, 1, 120)) {
    problems.push("name must be 1-120 characters");
  }
  if (!isValidIsoDate(event.eventDate)) {
    problems.push(`eventDate "${event.eventDate}" is not a YYYY-MM-DD date`);
  }
  if (event.format.trim() === "") {
    problems.push("format must not be empty");
  }
  if (event.playerCount !== null && !isPositiveInt(event.playerCount)) {
    problems.push("playerCount must be a positive integer");
  }
  if (!inBounds(event.organizer, 1, 120)) {
    problems.push("organizer must be 1-120 characters");
  }
  if (!inBounds(event.sourceUrl, 1, 2000)) {
    problems.push("sourceUrl must be 1-2000 characters");
  }
  if (!inBounds(event.notes, 0, 4000)) {
    problems.push("notes must be at most 4000 characters");
  }
  if (event.tier !== null && !isMetaEventTier(event.tier)) {
    problems.push(`tier "${event.tier}" is not one of ${META_EVENT_TIERS.join(", ")}`);
  }
  if (event.country !== null && !/^[A-Z]{2}$/u.test(event.country)) {
    problems.push(`country "${event.country}" is not a two-letter ISO 3166-1 code`);
  }
  if (!inBounds(event.location, 1, 500)) {
    problems.push("location must be 1-500 characters");
  }
  return problems;
}

/**
 * A list of zero cards is not a standings-only row: the schema folds an empty
 * `cards` array to null before this runs, so anything that arrives here as an
 * array is a real list and must have lines in it.
 */
function validatePlayer(player: MetaIngestEventPlayer): string[] {
  const problems: string[] = [];
  if (player.externalId.trim() === "") {
    problems.push("externalId must not be empty");
  }
  if (!inBounds(player.playerName, 1, 80)) {
    problems.push("playerName must be 1-80 characters");
  }
  if (!isPositiveInt(player.rank)) {
    problems.push("rank must be a positive integer");
  }
  for (const [field, value] of [
    ["wins", player.wins],
    ["losses", player.losses],
    ["draws", player.draws],
    ["matchPoints", player.matchPoints],
  ] as const) {
    if (!isCount(value)) {
      problems.push(`${field} must be a non-negative integer`);
    }
  }
  for (const [field, value] of [
    ["opponentMatchWinPct", player.opponentMatchWinPct],
    ["gameWinPct", player.gameWinPct],
    ["opponentGameWinPct", player.opponentGameWinPct],
  ] as const) {
    if (!isFraction(value)) {
      problems.push(`${field} must be between 0 and 1`);
    }
  }
  if (player.entryStatus !== null && asEntryStatus(player.entryStatus) === null) {
    problems.push(`entryStatus must be one of ${META_ENTRY_STATUSES.join(", ")}`);
  }
  if (!inBounds(player.legendName, 1, 200)) {
    problems.push("legendName must be 1-200 characters");
  }
  if (!inBounds(player.championName, 1, 200)) {
    problems.push("championName must be 1-200 characters");
  }
  for (const card of player.cards ?? []) {
    if (card.name.trim() === "") {
      problems.push("a card name is empty");
    }
    if (!DECK_ZONES.has(card.zone)) {
      problems.push(`card "${card.name}" has unknown zone "${card.zone}"`);
    }
    if (!isPositiveInt(card.quantity)) {
      problems.push(`card "${card.name}" has a non-positive quantity`);
    }
  }
  return problems;
}

function isMetaEventTier(value: string): value is MetaEventTier {
  return (META_EVENT_TIERS as readonly string[]).includes(value);
}

/**
 * The candidate event columns an upload owns, for change detection and writes.
 * Structural rather than `MetaIngestEvent`, so change detection can hand it the
 * stored row directly.
 */
function eventFields(event: {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  sourceUrl: string | null;
  notes: string | null;
  tier: MetaEventTier | null;
  country: string | null;
  location: string | null;
  extraData: unknown;
}) {
  return {
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerCount: event.playerCount,
    organizer: event.organizer,
    sourceUrl: event.sourceUrl,
    notes: event.notes,
    tier: event.tier,
    country: event.country,
    location: event.location,
    extraData: event.extraData,
  };
}

/** The candidate standings columns an upload owns, excluding the card list. */
function playerFields(player: {
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: string | null;
  legendName: string | null;
  championName: string | null;
  listStatus: MetaListStatus;
}) {
  return {
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
    legendName: player.legendName,
    championName: player.championName,
    // A source that fills in what it published before — standings gaining a
    // list, a partial one gaining its battlefields — changes this and the cards
    // and nothing else, so it has to be part of change detection or the upgrade
    // never reaches the queue.
    listStatus: player.listStatus,
  };
}

/**
 * The field values change detection compares, with `""` and whitespace-only
 * strings read as absent — the same rule the diff module applies, so a stored
 * `""` never reads as a change against an incoming null. Non-scalars (only
 * `extra_data`, arbitrary JSON) pass through for `Bun.deepEquals` to handle.
 */
function comparable(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const scalar =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    out[key] = scalar || value === null || value === undefined ? normalize(value) : value;
  }
  return out;
}

/**
 * `extra_data` is arbitrary JSON, so a shallow compare would report a change on
 * every upload. Everything else here is a scalar.
 */
function sameFields(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return Bun.deepEquals(comparable(a), comparable(b));
}

/**
 * A list's cards in a stable order, so a source that reshuffles it between
 * pushes does not read as a change and reset a completed review. The stored
 * column keeps the source's own order; only the comparison is sorted.
 */
function sortedCards(cards: readonly CandidateMetaDeckCard[] | null): CandidateMetaDeckCard[] {
  return (cards ?? []).toSorted((a, b) => {
    const byCard = (a.cardId ?? a.name).localeCompare(b.cardId ?? b.name);
    if (byCard !== 0) {
      return byCard;
    }
    const byZone = a.zone.localeCompare(b.zone);
    return byZone === 0 ? a.quantity - b.quantity : byZone;
  });
}

/**
 * What a list says *before* name resolution. Change detection runs on this
 * rather than on the resolved rows, so that a rematch turning a null `cardId`
 * into a real one does not kick an already-reviewed row back into the queue —
 * the source said the same thing, we just understand it better now.
 */
function sourceCards(cards: readonly CandidateMetaDeckCard[] | null) {
  return sortedCards(cards).map((card) => ({
    name: card.name,
    zone: card.zone,
    quantity: card.quantity,
  }));
}

/**
 * The resolved rows a diff against a live deck compares, dropping unresolved
 * ones and summing rows that landed on the same card and zone — the same
 * collapse the accept path applies before writing `deck_cards`, so an accepted
 * list reads as in sync afterwards.
 */
function resolvedCardEntries(cards: readonly CandidateMetaDeckCard[] | null): MetaDeckCardEntry[] {
  const entries: MetaDeckCardEntry[] = [];
  for (const card of cards ?? []) {
    if (card.cardId !== null) {
      entries.push({ cardId: card.cardId, zone: card.zone, quantity: card.quantity });
    }
  }
  return collapseCardEntries(entries);
}

function resolveCards(
  index: CardNameIndex,
  player: MetaIngestEventPlayer,
): CandidateMetaDeckCard[] | null {
  if (player.cards === null) {
    return null;
  }
  return player.cards.map((card) => ({
    name: card.name,
    zone: card.zone,
    quantity: card.quantity,
    cardId: resolveCardIdByName(index, card.name),
  }));
}

function resolveName(index: CardNameIndex, name: string | null): string | null {
  return name === null ? null : resolveCardIdByName(index, name);
}

/**
 * Decides the `checked_at` an upload should leave on a candidate row.
 *
 * Three cases, in order: a row that now matches its live counterpart settles
 * itself so it never reaches the queue; a row the upload changed (in its fields
 * or in what it links to) goes back into the queue; anything else keeps the
 * review state it had. Returns `undefined` to leave the column alone.
 */
function nextCheckedAt(options: {
  previous: Date | null | undefined;
  changed: boolean;
  inSync: boolean;
  now: Date;
}): Date | null | undefined {
  if (options.inSync) {
    // Re-stamping an already-settled row would only churn `updated_at`.
    return options.previous === null || options.previous === undefined || options.changed
      ? options.now
      : undefined;
  }
  if (options.changed) {
    return null;
  }
  return undefined;
}

/**
 * Stage one provider's uploaded events, replacing each named event's candidate
 * wholesale and leaving every other candidate untouched.
 *
 * The whole batch runs in one transaction: a payload either lands or it does
 * not, so a mid-batch failure can never leave an event's standings
 * half-replaced. Per-item validation failures are not batch failures — they are
 * reported and skipped.
 */
export async function ingestMetaCandidates(
  transact: Transact,
  provider: string,
  events: MetaIngestEvent[],
): Promise<MetaIngestResult> {
  if (!provider.trim()) {
    throw new Error("provider name must not be empty");
  }

  const result: MetaIngestResult = {
    provider,
    newEvents: 0,
    updatedEvents: 0,
    unchangedEvents: 0,
    newPlayers: 0,
    updatedPlayers: 0,
    removedPlayers: 0,
    unchangedPlayers: 0,
    ignoredSkipped: 0,
    errors: [],
    newEventDetails: [],
    updatedEventDetails: [],
    removedPlayerDetails: [],
    unresolvedCards: [],
  };

  // Two events sharing an external id would resolve to the same candidate row
  // twice, and which values survived would depend on payload order — a silent
  // flip on every re-upload. Keep the first occurrence and report the rest.
  //
  // Player ids dedup within their event, matching the table's UNIQUE
  // (candidate_event_id, external_id). They are only event-scoped — sources
  // number their entries per event — so every key that reaches past this loop
  // pairs the player id with its event's.
  const seenEventIds = new Set<string>();
  const deduped: MetaIngestEvent[] = [];
  for (const event of events) {
    if (seenEventIds.has(event.externalId)) {
      result.errors.push(
        `Duplicate event externalId "${event.externalId}" ("${event.name}") — dropped duplicate, keeping first occurrence`,
      );
      continue;
    }
    seenEventIds.add(event.externalId);

    const seenPlayerIds = new Set<string>();
    const players: MetaIngestEventPlayer[] = [];
    for (const player of event.players) {
      if (seenPlayerIds.has(player.externalId)) {
        result.errors.push(
          `Duplicate player externalId "${player.externalId}" in event "${event.externalId}" — dropped duplicate, keeping first occurrence`,
        );
        continue;
      }
      seenPlayerIds.add(player.externalId);
      players.push(player);
    }
    deduped.push({ ...event, players });
  }

  await transact(async (repos) => {
    const repo = repos.metaCandidates;
    const now = new Date();

    const eventKeys = deduped.map((event) => event.externalId);

    const [existingEvents, ignoredEventIds, ignoredPlayerKeys, nameIndex] = await Promise.all([
      repo.eventsBySourceKeys(provider, eventKeys),
      repo.ignoredEventIds(provider),
      repo.ignoredPlayerKeys(provider),
      loadCardNameIndex(repos.ingest),
    ]);

    const existingEventByKey = new Map(existingEvents.map((row) => [row.externalId, row]));
    const ignoredEvents = new Set(ignoredEventIds);
    const ignoredPlayers = new Set(
      ignoredPlayerKeys.map((key) => playerKey(key.eventExternalId, key.externalId)),
    );

    // Ignored rows included: the replace pass below must not delete one, and an
    // upload naming an ignored key must find it and leave it alone.
    const existingPlayers = await repo.allPlayersByCandidateEventIds(
      existingEvents.map((row) => row.id),
    );
    const existingPlayersByEvent = Map.groupBy(existingPlayers, (row) => row.candidateEventId);

    // The candidate row's own link is the source key now: it survives an
    // ignore, so nothing has to read the live side by the provider's vocabulary.
    const [liveEvents, livePlayers] = await Promise.all([
      repo.liveEventsByIds(
        existingEvents.map((row) => row.metaEventId).filter((id): id is string => id !== null),
      ),
      repos.meta.livePlayersByIds(
        existingPlayers
          .map((row) => row.metaEventPlayerId)
          .filter((id): id is string => id !== null),
      ),
    ]);
    const liveEventById = new Map(liveEvents.map((row) => [row.id, row]));
    const livePlayerById = new Map(livePlayers.map((row) => [row.id, row]));

    const liveDeckCardRows = await repo.liveDeckCards(
      livePlayers.map((row) => row.deckId).filter((id): id is string => id !== null),
    );
    const liveCardsByDeck = Map.groupBy(liveDeckCardRows, (row) => row.deckId);

    for (const event of deduped) {
      if (ignoredEvents.has(event.externalId)) {
        result.ignoredSkipped++;
        continue;
      }

      const problems = validateEvent(event);
      if (problems.length > 0) {
        result.errors.push(`Event "${event.externalId}": ${problems.join(", ")}`);
        continue;
      }

      const existing = existingEventByKey.get(event.externalId);
      const live =
        existing?.metaEventId === null || existing?.metaEventId === undefined
          ? undefined
          : liveEventById.get(existing.metaEventId);
      const metaEventId = live?.id ?? null;
      const tier = event.tier !== null && isMetaEventTier(event.tier) ? event.tier : null;
      const fields = eventFields({ ...event, tier });
      const inSync = live !== undefined && diffMetaEvent(live, event).length === 0;

      let candidateEventId: string;
      if (existing === undefined) {
        candidateEventId = await repo.insertEvent({
          provider,
          externalId: event.externalId,
          ...fields,
          extraData: fields.extraData,
          metaEventId,
          checkedAt: inSync ? now : null,
        });
        result.newEvents++;
        result.newEventDetails.push({ externalId: event.externalId, name: event.name });
      } else {
        candidateEventId = existing.id;
        const changed = !sameFields(fields, eventFields(existing));
        const checkedAt = nextCheckedAt({
          previous: existing.checkedAt,
          changed,
          inSync,
          now,
        });

        if (changed || checkedAt !== undefined) {
          await repo.updateEvent(candidateEventId, {
            ...fields,
            extraData: fields.extraData,
            ...(checkedAt === undefined ? {} : { checkedAt }),
          });
        }

        if (changed) {
          result.updatedEvents++;
          result.updatedEventDetails.push({ externalId: event.externalId, name: event.name });
        } else {
          result.unchangedEvents++;
        }
      }

      const existingPlayerRows = existingPlayersByEvent.get(candidateEventId) ?? [];
      const existingPlayerByKey = new Map(existingPlayerRows.map((row) => [row.externalId, row]));
      const keptPlayerIds = new Set<string>();

      for (const player of event.players) {
        if (ignoredPlayers.has(playerKey(event.externalId, player.externalId))) {
          // The stored row stays exactly as it is, link included. Keeping it out
          // of the replace below is what stops an un-ignore from staging a
          // second copy of a player the archive already holds.
          const ignored = existingPlayerByKey.get(player.externalId);
          if (ignored !== undefined) {
            keptPlayerIds.add(ignored.id);
          }
          result.ignoredSkipped++;
          continue;
        }

        const playerProblems = validatePlayer(player);
        if (playerProblems.length > 0) {
          result.errors.push(
            `Player "${player.externalId}" in event "${event.externalId}": ${playerProblems.join(", ")}`,
          );
          continue;
        }

        const cards = resolveCards(nameIndex, player);
        const unresolved = (cards ?? [])
          .filter((card) => card.cardId === null)
          .map((card) => card.name);
        if (unresolved.length > 0) {
          result.unresolvedCards.push({
            eventExternalId: event.externalId,
            playerExternalId: player.externalId,
            names: [...new Set(unresolved)],
          });
        }

        const resolvedNames = {
          legendCardId: resolveName(nameIndex, player.legendName),
          championCardId: resolveName(nameIndex, player.championName),
        };
        const values = { ...playerFields(player), ...resolvedNames };

        const existingPlayer = existingPlayerByKey.get(player.externalId);
        const livePlayer =
          existingPlayer?.metaEventPlayerId === null ||
          existingPlayer?.metaEventPlayerId === undefined
            ? undefined
            : livePlayerById.get(existingPlayer.metaEventPlayerId);
        const playerInSync =
          livePlayer !== undefined &&
          unresolved.length === 0 &&
          !hasAnyPlayerChange(
            livePlayer,
            livePlayer.deckId === null ? [] : (liveCardsByDeck.get(livePlayer.deckId) ?? []),
            player,
            cards,
            resolvedNames,
            metaEventId,
          );

        if (existingPlayer === undefined) {
          await repo.insertPlayer({
            candidateEventId,
            externalId: player.externalId,
            ...values,
            cards,
            checkedAt: playerInSync ? now : null,
          });
          result.newPlayers++;
          continue;
        }

        keptPlayerIds.add(existingPlayer.id);
        const fieldsChanged = !sameFields(values, {
          ...playerFields(existingPlayer),
          legendCardId: existingPlayer.legendCardId,
          championCardId: existingPlayer.championCardId,
        });
        const listPresenceChanged = (cards === null) !== (existingPlayer.cards === null);
        const sourceChanged =
          fieldsChanged ||
          listPresenceChanged ||
          !Bun.deepEquals(sourceCards(cards), sourceCards(existingPlayer.cards));
        const cardsChanged =
          listPresenceChanged ||
          !Bun.deepEquals(sortedCards(cards), sortedCards(existingPlayer.cards));
        const checkedAt = nextCheckedAt({
          previous: existingPlayer.checkedAt,
          changed: sourceChanged,
          inSync: playerInSync,
          now,
        });

        if (sourceChanged || cardsChanged || checkedAt !== undefined) {
          await repo.updatePlayer(existingPlayer.id, {
            ...values,
            ...(cardsChanged ? { cards } : {}),
            ...(checkedAt === undefined ? {} : { checkedAt }),
          });
        }

        if (sourceChanged) {
          result.updatedPlayers++;
        } else {
          result.unchangedPlayers++;
        }
      }

      // Per-event replace: a player the upload no longer lists is gone from that
      // event. This also removes one that failed validation this time round,
      // which is the point — the payload is the event's current truth.
      const removed = existingPlayerRows.filter((row) => !keptPlayerIds.has(row.id));
      if (removed.length > 0) {
        await repo.deletePlayers(removed.map((row) => row.id));
        result.removedPlayers += removed.length;
        for (const row of removed) {
          result.removedPlayerDetails.push({
            eventExternalId: event.externalId,
            externalId: row.externalId,
            playerName: row.playerName,
          });
        }
      }
    }
  });

  return result;
}

/**
 * Whether accepting this candidate would change the live standings row it links
 * to, in its placement, its metadata, its legend, or its card list.
 *
 * The event comparison is what stops a re-parented row settling itself: the
 * candidate's parent points at one live event, the row it links to still sits
 * under another, and accepting would move it.
 */
function hasAnyPlayerChange(
  livePlayer: LiveMetaPlayerRow,
  liveCards: readonly MetaDeckCardEntry[],
  player: MetaIngestEventPlayer,
  cards: readonly CandidateMetaDeckCard[] | null,
  resolvedNames: { legendCardId: string | null; championCardId: string | null },
  candidateEventId: string | null,
): boolean {
  const candidateCards = resolveMetaPlayerCards({ cards, ...resolvedNames });
  return hasPlayerDiff(
    diffMetaPlayer(
      {
        event: livePlayer.metaEventId,
        playerName: livePlayer.playerName,
        rank: livePlayer.rank,
        rankIsTier: livePlayer.rankIsTier,
        wins: livePlayer.wins,
        losses: livePlayer.losses,
        draws: livePlayer.draws,
        legendCardId: livePlayer.legendCardId,
        championCardId: livePlayer.championCardId,
        listStatus: livePlayer.listStatus,
        cards: liveCards,
      },
      {
        event: candidateEventId,
        playerName: player.playerName,
        rank: player.rank,
        rankIsTier: player.rankIsTier,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        legendCardId: candidateCards.legendCardId,
        championCardId: candidateCards.championCardId,
        // A source that publishes standings only is not proposing to strip a
        // list another source already contributed, so the live status stands in.
        listStatus: cards === null ? livePlayer.listStatus : player.listStatus,
        cards: cards === null ? liveCards : resolvedCardEntries(cards),
      },
    ),
  );
}
