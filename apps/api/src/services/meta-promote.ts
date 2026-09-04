import { ERROR_CODES, WellKnown } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared";
import type {
  MetaEntryStatus,
  MetaEventOverlayField,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import { classifyMetaEventTier, countryFromAddress } from "../lib/meta-event-classify.js";
import {
  defaultMetaDeckName,
  metaEventSlugCandidates,
  resolvedStandingName,
} from "../lib/meta-event-naming.js";
import type { MetaEventOverlayPatch, MetaPlayerOverlayPatch } from "../lib/meta-overlay-apply.js";
import { applyOverlays } from "../lib/meta-overlay-apply.js";
import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { mapSourceFormat, UVSGAMES_PROVIDER, venueLocalDay } from "../lib/uvsgames-catalog.js";
import { listStatusFor, withSingleChampion } from "../lib/uvsgames-transform.js";
import type { MetaPlayerOverlayRow } from "../repositories/meta-overlays.js";
import type {
  MetaArchivedDeckInput,
  MetaDeckCardInput,
  MetaEventMatchRow,
  MetaEventPhaseRow,
  MetaEventPlayerPatch,
  MetaEventPlayerUpdate,
  MetaEventSourceRow,
  MetaStoredPlayerDeck,
  NewMetaEventMatch,
  NewMetaEventPhase,
} from "../repositories/meta.js";
import { deckCardMergeKey, mergeDeckCards, sameDeckCards } from "../repositories/meta.js";
import type { CardNameIndex } from "./candidate-links.js";
import { loadCardNameIndex, resolveCardIdByName } from "./candidate-links.js";
import { createMetaEventPlayer, setMetaPlayerList } from "./meta-event-players.js";

/**
 * Promotion: source mirrors to live rows (ADR-014 revision 3).
 *
 * `live = promote(sources) + accepted overlays`, and this is the whole of it.
 * There is no staging tier in between, and nothing anywhere has to guess
 * whether a live value was set by a human: an overridden field is one an
 * accepted overlay claims, which is a fact rather than an inference.
 *
 * That makes this idempotent and re-runnable, which is the point. A mapping
 * fix, a classification rule change, a late decklist and a corrected standing
 * are all "promote again", not four different repair paths.
 *
 * **Live identity is load-bearing.** `decks`, `meta_event_matches` and the
 * public share tokens all hang off `meta_event_players.id`, so a re-promote
 * matches existing rows on their stored source identity and updates in place.
 * It never deletes and re-inserts a field it has already published.
 */

/**
 * The rule tables a promote reads and never writes. A bulk pass builds this
 * once and hands it to every event it promotes.
 */
export interface MetaSourceContext {
  formatMappings: ReadonlyMap<string, string>;
  templateTiers: ReadonlyMap<string, MetaEventTier | null>;
}

/** {@link MetaSourceContext} plus what resolving decklist card names needs. */
export interface MetaPromoteContext extends MetaSourceContext {
  cardIndex: CardNameIndex;
}

/** @returns The mapping tables one pass reuses across every event it promotes. */
async function createMetaSourceContext(repos: Repos): Promise<MetaSourceContext> {
  const [formatMappings, templateTiers] = await Promise.all([
    repos.uvsgamesEvents.formatMappings(),
    repos.uvsgamesEvents.templateTiers(),
  ]);
  return { formatMappings, templateTiers };
}

/** @returns Everything {@link promoteMetaEvent} would otherwise load per event. */
export async function createMetaPromoteContext(repos: Repos): Promise<MetaPromoteContext> {
  const [source, cardIndex] = await Promise.all([
    createMetaSourceContext(repos),
    loadCardNameIndex(repos.ingest),
  ]);
  return { ...source, cardIndex };
}

/** The event columns promotion computes, before overlays. */
export interface MetaPromotedEventFacts extends Record<string, unknown> {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  tier: MetaEventTier;
  country: string | null;
  location: string | null;
}

/** One standings row as a source published it, plus the identity promotion files it under. */
interface StandingFacts extends Record<string, unknown> {
  /** Stable within the event, across re-fetches and renames. */
  identity: string;
  /**
   * The identity a pre-repair promote derived from the row's columns, so live
   * rows written before `source_identity` existed still match instead of
   * duplicating. Matching stamps the stored identity, retiring this key.
   */
  legacyIdentity: string;
  uvsgamesPlayerId: number | null;
  playerName: string | null;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  matchPoints: number | null;
  opponentMatchWinPct: number | null;
  gameWinPct: number | null;
  opponentGameWinPct: number | null;
  entryStatus: MetaEntryStatus | null;
  legendName: string | null;
  sourceDeckId: string | null;
  /** Which mirror produced this row, so the deck lines can be found again. */
  provider: string;
}

/**
 * The source's own words for the fields the projection rewrote.
 *
 * Only where a transformation actually happened: a pass-through field has
 * nothing to show twice. The drift view prints these under the mapped value, so
 * a reviewer can see that "constructed" came from the source saying
 * "Constructed" rather than from a mapping nobody meant.
 */
export type MetaSourceRawTerms = Partial<Record<MetaEventOverlayField, string>>;

interface SourceFacts {
  /** See {@link MetaSourceRawTerms}. */
  raw: MetaSourceRawTerms;
  event: MetaPromotedEventFacts;
  standings: StandingFacts[];
}

export interface MetaPromoteResult {
  metaEventId: string;
  players: number;
  removedPlayers: number;
  decks: number;
  matches: number;
  phases: number;
  /** Card names no catalog entry matched, deduplicated. Reviewer-facing. */
  unresolvedNames: string[];
  /**
   * Decklist lines the archive folded into one row, as
   * `"Card (zone): N lines -> quantity"`, deduplicated. Reviewer-facing: a
   * source splitting a playset across lines is routine, two different names
   * collapsing onto one card is worth a look.
   */
  mergedLines: string[];
  errors: string[];
}

/** A source with no usable format never reaches live; the reviewer maps it first. */
class UnmappableFormatError extends Error {
  override readonly name = "UnmappableFormatError";
}

function emptyResult(metaEventId: string): MetaPromoteResult {
  return {
    metaEventId,
    players: 0,
    removedPlayers: 0,
    decks: 0,
    matches: 0,
    phases: 0,
    unresolvedNames: [],
    mergedLines: [],
    errors: [],
  };
}

function normalizedName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** The identity promotes before `source_identity` existed derived from live columns. */
function legacyIdentityOf(uvsgamesPlayerId: number | null, playerName: string | null): string {
  if (uvsgamesPlayerId !== null) {
    return `u${uvsgamesPlayerId}`;
  }
  return `n${normalizedName(playerName)}`;
}

// ── Source adapters ───────────────────────────────────────────────────────────

async function uvsgamesFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const listing = await repos.uvsgamesEvents.byKey(externalId);
  if (listing === undefined) {
    return null;
  }

  const { formatMappings, templateTiers } = context;
  const standings = await repos.uvsgamesResults.standings(externalId);

  const format = mapSourceFormat(formatMappings, listing.eventFormat);
  if (format === null) {
    throw new UnmappableFormatError(
      `The source filed "${listing.name}" as a format the archive has no mapping for. Map it, then promote again.`,
    );
  }

  const playerCount = countOrNull(listing.playerCount);
  const location = listing.location === null ? null : listing.location.trim().slice(0, 500) || null;

  return {
    raw: {
      format: listing.eventFormat ?? undefined,
      eventDate: listing.startAt.toISOString(),
      // The tier is a rule's output, so its input is the template the organizer
      // picked, or the field size when no template is mapped.
      tier:
        listing.eventConfigurationTemplate === null
          ? `${playerCount ?? 0} players`
          : `template ${listing.eventConfigurationTemplate}`,
      country: location ?? undefined,
    },
    event: {
      name: listing.name.slice(0, 120),
      eventDate: venueLocalDay(listing.startAt, listing.timezone),
      format,
      playerCount,
      organizer: listing.storeName === null ? null : listing.storeName.slice(0, 120),
      notes: null,
      tier: classifyMetaEventTier({
        templateTier:
          listing.eventConfigurationTemplate === null
            ? null
            : (templateTiers.get(listing.eventConfigurationTemplate) ?? null),
        playerCount,
      }),
      country: countryFromAddress(location),
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity:
          row.uvsgamesPlayerId === null ? `r${row.registrationId}` : `u${row.uvsgamesPlayerId}`,
        legacyIdentity: legacyIdentityOf(row.uvsgamesPlayerId, row.playerName),
        uvsgamesPlayerId: row.uvsgamesPlayerId,
        // A row the source keys by user id is rendered under that player's
        // current name, so the archive stores no snapshot of it.
        playerName: row.uvsgamesPlayerId === null ? row.playerName : null,
        rank: row.rank as number,
        rankIsTier: false,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matchPoints: row.matchPoints,
        opponentMatchWinPct: row.opponentMatchWinPct,
        gameWinPct: row.gameWinPct,
        opponentGameWinPct: row.opponentGameWinPct,
        entryStatus: row.entryStatus,
        legendName: row.legendName,
        sourceDeckId: row.sourceDeckId,
        provider: UVSGAMES_PROVIDER,
      })),
  };
}

async function playloltcgFacts(repos: Repos, externalId: string): Promise<SourceFacts | null> {
  const activityShopId = Number(externalId);
  if (!Number.isInteger(activityShopId)) {
    return null;
  }
  const listing = await repos.playloltcgEvents.byKey(activityShopId);
  if (listing === undefined) {
    return null;
  }
  const standings = await repos.playloltcgResults.standings(activityShopId);
  const location = listing.address === null ? null : listing.address.trim().slice(0, 500) || null;
  const playerCount = countOrNull(listing.playerCount);

  return {
    raw: {
      // This source maps nothing: it publishes no format vocabulary worth
      // mapping and its geography is always CN, so only the tier rule has an
      // input worth showing.
      tier: `${playerCount ?? 0} players`,
    },
    event: {
      name: listing.name.slice(0, 120),
      // The source publishes day granularity only, so the listing's own start
      // date is already the venue-local day.
      eventDate: listing.startAt ?? new Date().toISOString().slice(0, 10),
      // `activityType` is too blunt to map (city qualifiers and play nights
      // share a bucket), so everything here is filed as constructed.
      format: WellKnown.deckFormat.CONSTRUCTED,
      playerCount,
      organizer: listing.shopName === null ? null : listing.shopName.slice(0, 120),
      notes: null,
      tier: classifyMetaEventTier({ templateTier: null, playerCount }),
      country: "CN",
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity: `p${row.playerKey}`,
        legacyIdentity: legacyIdentityOf(null, row.playerName),
        uvsgamesPlayerId: null,
        playerName: row.playerName,
        rank: row.rank as number,
        rankIsTier: false,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        matchPoints: null,
        opponentMatchWinPct: null,
        gameWinPct: null,
        opponentGameWinPct: null,
        entryStatus: null,
        legendName: row.legendName,
        sourceDeckId: row.sourceDeckId,
        provider: PLAYLOLTCG_PROVIDER,
      })),
  };
}

/**
 * What one source would contribute to an event's live row, without writing it.
 *
 * The drift view reads this rather than the mirror directly, so what a reviewer
 * is shown is exactly what promotion would use: the same format mapping, the
 * same tier classification, the same trimming. A drift table built from raw
 * mirror columns would disagree with the promote that follows it.
 *
 * Never throws. Drift is a diagnostic read, and one source whose mirror row is
 * odd (an unmappable format, a listing the crawl half-wrote) must blank its own
 * column rather than take the page down with it. Promotion itself still
 * surfaces those failures, through `MetaPromoteResult.errors`.
 *
 * @returns Null for a provider with no mirror to read (a push provider), a key
 *   its mirror no longer holds, or a row this cannot make sense of.
 */
export async function sourceEventFacts(
  repos: Repos,
  provider: string,
  externalId: string,
  context?: MetaSourceContext,
): Promise<{ values: MetaPromotedEventFacts; raw: MetaSourceRawTerms } | null> {
  try {
    const facts = await factsFor(
      repos,
      provider,
      externalId,
      context ?? (await createMetaSourceContext(repos)),
    );
    return facts === null ? null : { values: facts.event, raw: facts.raw };
  } catch {
    return null;
  }
}

/** The listing's player count, with the source's zero-means-unreported quirk applied. */
export function countOrNull(value: number | null): number | null {
  return value === null || value === 0 ? null : value;
}

function factsFor(
  repos: Repos,
  provider: string,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  if (provider === UVSGAMES_PROVIDER) {
    return uvsgamesFacts(repos, externalId, context);
  }
  if (provider === PLAYLOLTCG_PROVIDER) {
    return playloltcgFacts(repos, externalId);
  }
  // A push provider writes overlays, not a mirror, so there is nothing here to
  // promote and its citation still stands.
  return Promise.resolve(null);
}

// ── Promotion ─────────────────────────────────────────────────────────────────

/**
 * Rebuilds one live event from its linked mirrors and its accepted overlays.
 *
 * Safe to run at any time and as often as you like. It is what the deep fetch
 * calls when results land, what accepting an overlay calls, and what a
 * classification rule change calls over the affected events.
 */
export async function promoteMetaEvent(
  repos: Repos,
  metaEventId: string,
  context?: MetaPromoteContext,
): Promise<MetaPromoteResult> {
  const live = await repos.meta.eventRowById(metaEventId);
  if (live === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "That archived event no longer exists.");
  }
  const ctx = context ?? (await createMetaPromoteContext(repos));

  const result = emptyResult(metaEventId);
  const sources = await repos.meta.sourcesForEvent(metaEventId);
  const ordered = sources
    .filter((source) => source.provider !== null && source.externalId !== null)
    .toSorted((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());

  const collected: SourceFacts[] = [];
  for (const source of ordered) {
    try {
      const facts = await factsFor(
        repos,
        source.provider as string,
        source.externalId as string,
        ctx,
      );
      if (facts !== null) {
        collected.push(facts);
      }
    } catch (error) {
      if (error instanceof UnmappableFormatError) {
        result.errors.push(error.message);
        continue;
      }
      throw error;
    }
  }

  const final = await promoteEventRow(repos, metaEventId, live, collected);
  await promoteStandings(repos, metaEventId, final, ordered, collected, result, ctx.cardIndex);
  await applyPlayerOverlays(repos, metaEventId, final.format, result, ctx.cardIndex);
  await dropOrphanMintedPlayers(repos, metaEventId, result);
  await promotePhasesAndMatches(repos, metaEventId, ordered, result);
  return result;
}

async function promoteEventRow(
  repos: Repos,
  metaEventId: string,
  live: MetaPromotedEventFacts,
  collected: readonly SourceFacts[],
): Promise<MetaPromotedEventFacts> {
  // Only the four columns the live row cannot hold as NULL fall back to it,
  // because they have no empty value to start from. Every other field starts
  // unset, so one that no source describes and no overlay claims ends up empty
  // rather than keeping whatever the last promote wrote. That is what makes
  // releasing a claim give the value up: a hand-entered value is re-supplied
  // by the creating admin's own overlay, not by the row it was written to.
  // Later sources win whole, which is what `priority` orders.
  let facts: MetaPromotedEventFacts = {
    name: live.name,
    eventDate: live.eventDate,
    format: live.format,
    playerCount: null,
    organizer: null,
    notes: null,
    tier: live.tier,
    country: null,
    location: null,
  };
  for (const source of collected) {
    facts = { ...facts, ...source.event };
  }

  const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
  const patches: MetaEventOverlayPatch<Partial<MetaPromotedEventFacts>>[] = overlays.map(
    (overlay) => ({
      claimedFields: overlay.claimedFields,
      values: {
        // The four the live row cannot hold as NULL are omitted, not set to
        // undefined, when an overlay claims them empty: `applyOverlays` copies
        // any key the values object owns, and an undefined here would reach
        // the NOT NULL column.
        ...(overlay.name === null ? {} : { name: overlay.name }),
        ...(overlay.eventDate === null ? {} : { eventDate: overlay.eventDate }),
        ...(overlay.format === null ? {} : { format: overlay.format }),
        ...(overlay.tier === null ? {} : { tier: overlay.tier }),
        playerCount: overlay.playerCount,
        organizer: overlay.organizer,
        notes: overlay.notes,
        country: overlay.country,
        location: overlay.location,
      } as Partial<MetaPromotedEventFacts>,
    }),
  );
  const final = applyOverlays(facts, patches);

  if (!sameEventFacts(live, final)) {
    await repos.meta.updateEvent(metaEventId, {
      name: final.name,
      eventDate: final.eventDate,
      format: final.format,
      playerCount: final.playerCount,
      organizer: final.organizer,
      notes: final.notes,
      tier: final.tier,
      country: final.country,
      location: final.location,
    });
  }
  return final;
}

function sameEventFacts(live: MetaPromotedEventFacts, next: MetaPromotedEventFacts): boolean {
  return (
    live.name === next.name &&
    live.eventDate === next.eventDate &&
    live.format === next.format &&
    live.playerCount === next.playerCount &&
    live.organizer === next.organizer &&
    live.notes === next.notes &&
    live.tier === next.tier &&
    live.country === next.country &&
    live.location === next.location
  );
}

/**
 * Reconciles the field.
 *
 * Existing rows are matched on their stored source identity and updated; new
 * ones are inserted. Nothing is deleted: a player the source stopped listing is
 * more likely a source hiccup than a retraction, and deleting would take an
 * attached deck's permalink with it.
 */
async function promoteStandings(
  repos: Repos,
  metaEventId: string,
  /** The event row as {@link promoteEventRow} just left it. */
  live: MetaPromotedEventFacts,
  sources: readonly MetaEventSourceRow[],
  collected: readonly SourceFacts[],
  result: MetaPromoteResult,
  cardIndex: CardNameIndex,
): Promise<void> {
  const merged = new Map<string, StandingFacts>();
  for (const source of collected) {
    for (const standing of source.standings) {
      merged.set(standing.identity, standing);
    }
  }
  if (merged.size === 0) {
    return;
  }

  const existing = await repos.meta.rawStandingsForEvent(metaEventId);
  const byIdentity = new Map(
    existing
      .filter((row) => row.sourceIdentity !== null)
      .map((row) => [row.sourceIdentity as string, row]),
  );
  const byLegacy = new Map(
    existing
      .filter((row) => row.sourceIdentity === null)
      .map((row) => [legacyIdentityOf(row.uvsgamesPlayerId, row.playerName), row]),
  );

  const providers = new Set([...merged.values()].map((standing) => standing.provider));
  const deckLines = await loadDeckLines(repos, sources, providers);
  // A row the source keys by user id stores no name of its own, so the deck's
  // default name has to reach for the same display name the read surfaces join.
  const displayNames = await repos.uvsgamesEvents.playerDisplayNames(
    [...merged.values()].flatMap((standing) =>
      standing.uvsgamesPlayerId === null ? [] : [standing.uvsgamesPlayerId],
    ),
  );
  const deckStates = await repos.meta.deckStatesForEvent(metaEventId);
  const unresolved = new Set<string>();
  const mergedLines = new Set<string>();
  const updates: MetaEventPlayerUpdate[] = [];
  const deckWrites: { playerId: string; deck: MetaArchivedDeckInput }[] = [];

  for (const standing of merged.values()) {
    const legendCardId =
      standing.legendName === null ? null : resolveCardIdByName(cardIndex, standing.legendName);
    if (standing.legendName !== null && legendCardId === null) {
      unresolved.add(standing.legendName);
    }

    // A legacy row can be claimed by one standing per pass. Two providers
    // naming the same player share a legacy identity, and letting both stamp
    // the row would leave it keyed by whichever ran last — the loser would
    // then insert a duplicate on the next promote.
    let existingRow = byIdentity.get(standing.identity);
    if (existingRow === undefined) {
      existingRow = byLegacy.get(standing.legacyIdentity);
      if (existingRow !== undefined) {
        byLegacy.delete(standing.legacyIdentity);
      }
    }
    const deck = buildDeck(
      standing,
      resolvedStandingName(standing, displayNames),
      legendCardId,
      live.format,
      live.name,
      deckLines,
      cardIndex,
      unresolved,
      mergedLines,
    );

    if (existingRow === undefined) {
      const created = await createMetaEventPlayer(repos.meta, {
        eventId: metaEventId,
        rank: standing.rank,
        rankIsTier: standing.rankIsTier,
        playerName: standing.playerName,
        uvsgamesPlayerId: standing.uvsgamesPlayerId,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        opponentMatchWinPct: standing.opponentMatchWinPct,
        gameWinPct: standing.gameWinPct,
        opponentGameWinPct: standing.opponentGameWinPct,
        entryStatus: standing.entryStatus,
        legendCardId,
        championCardId: null,
        sourceIdentity: standing.identity,
        deck,
      });
      if (created !== undefined) {
        result.players++;
        if (created.deckId !== null) {
          result.decks++;
        }
      }
      continue;
    }

    const patch = {
      rank: standing.rank,
      rankIsTier: standing.rankIsTier,
      playerName: standing.playerName,
      uvsgamesPlayerId: standing.uvsgamesPlayerId,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      matchPoints: standing.matchPoints,
      opponentMatchWinPct: standing.opponentMatchWinPct,
      gameWinPct: standing.gameWinPct,
      opponentGameWinPct: standing.opponentGameWinPct,
      entryStatus: standing.entryStatus,
      legendCardId,
      sourceIdentity: standing.identity,
    } satisfies MetaEventPlayerPatch;
    if (!samePlayerColumns(existingRow, patch)) {
      updates.push({ id: existingRow.id, ...patch });
    }
    result.players++;
    if (deck !== null) {
      // The maintainer may have renamed the archived deck; a re-promote of the
      // same list must not take that back.
      if (!sameStoredDeck(deckStates.get(existingRow.id), deck)) {
        deckWrites.push({ playerId: existingRow.id, deck });
      }
      result.decks++;
    }
  }

  await repos.meta.updatePlayers(updates);
  for (const write of deckWrites) {
    await setMetaPlayerList(repos.meta, write.playerId, write.deck, { preserveName: true });
  }

  result.unresolvedNames = [...unresolved];
  result.mergedLines = [...mergedLines];
}

function samePlayerColumns(row: MetaEventPlayerPatch, patch: MetaEventPlayerPatch): boolean {
  for (const key of Object.keys(patch) as (keyof MetaEventPlayerPatch)[]) {
    if (row[key] !== patch[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Whether `setPlayerDeck` would write nothing for this list. Mirrors that
 * method's own comparison under `preserveName`, and has to keep mirroring it.
 */
function sameStoredDeck(
  stored: MetaStoredPlayerDeck | undefined,
  deck: MetaArchivedDeckInput,
): boolean {
  return (
    stored !== undefined &&
    stored.format === deck.format &&
    stored.listStatus === deck.listStatus &&
    sameDeckCards(stored.cards, mergeDeckCards(deck.cards))
  );
}

type SourceDeckLines = Map<string, { zone: string; quantity: number; cardName: string }[]>;

/** Every held decklist for the event's linked mirrors, one query per provider. */
async function loadDeckLines(
  repos: Repos,
  sources: readonly MetaEventSourceRow[],
  providers: ReadonlySet<string>,
): Promise<SourceDeckLines> {
  const lines: SourceDeckLines = new Map();
  for (const source of sources) {
    if (source.externalId === null) {
      continue;
    }
    if (source.provider === UVSGAMES_PROVIDER && providers.has(UVSGAMES_PROVIDER)) {
      for (const [deckId, rows] of await repos.uvsgamesResults.decklistCards(source.externalId)) {
        lines.set(deckId, rows);
      }
    }
    if (source.provider === PLAYLOLTCG_PROVIDER && providers.has(PLAYLOLTCG_PROVIDER)) {
      const activityShopId = Number(source.externalId);
      if (Number.isInteger(activityShopId)) {
        for (const [deckId, rows] of await repos.playloltcgResults.decklistCards(activityShopId)) {
          lines.set(deckId, rows);
        }
      }
    }
  }
  return lines;
}

/**
 * Builds the archived deck for one standing, when its source served a list and
 * every line resolves.
 *
 * An unresolved line means no deck rather than a partial one: a decklist with a
 * hole in it reads as the player's list and is not. The standings row still
 * promotes, which is the pyramid working as intended.
 *
 * The standings legend counts as held: a list whose Legend zone the source left
 * empty gets the resolved standings legend filed into it, and `listStatus` is
 * computed from what the list actually covers rather than assumed full.
 */
function buildDeck(
  standing: StandingFacts,
  playerName: string,
  legendCardId: string | null,
  format: string,
  eventName: string,
  deckLines: SourceDeckLines,
  cardIndex: CardNameIndex,
  unresolved: Set<string>,
  mergedLines: Set<string>,
): MetaArchivedDeckInput | null {
  if (standing.sourceDeckId === null) {
    return null;
  }
  const lines = withSingleChampion(deckLines.get(standing.sourceDeckId) ?? []);
  if (lines.length === 0) {
    return null;
  }

  const cards: MetaDeckCardInput[] = [];
  const sourceNames = new Map<string, Set<string>>();
  for (const line of lines) {
    const cardId = resolveCardIdByName(cardIndex, line.cardName);
    if (cardId === null) {
      unresolved.add(line.cardName);
      return null;
    }
    const card = {
      cardId,
      zone: line.zone as DeckZone,
      quantity: line.quantity,
      preferredPrintingId: null,
    };
    cards.push(card);
    const key = deckCardMergeKey(card);
    const names = sourceNames.get(key);
    if (names === undefined) {
      sourceNames.set(key, new Set([line.cardName]));
    } else {
      names.add(line.cardName);
    }
  }

  const hasLegend = cards.some((card) => card.zone === WellKnown.deckZone.LEGEND);
  if (!hasLegend && legendCardId !== null) {
    cards.push({
      cardId: legendCardId,
      zone: WellKnown.deckZone.LEGEND as DeckZone,
      quantity: 1,
      preferredPrintingId: null,
    });
  }

  const lineCounts = new Map<string, number>();
  for (const card of cards) {
    const key = deckCardMergeKey(card);
    lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
  }
  const folded = mergeDeckCards(cards);
  for (const card of folded) {
    const key = deckCardMergeKey(card);
    const count = lineCounts.get(key) ?? 1;
    if (count > 1) {
      const names = [...(sourceNames.get(key) ?? new Set([card.cardId]))].sort();
      mergedLines.add(`${names.join(" / ")} (${card.zone}): ${count} lines -> ${card.quantity}`);
    }
  }

  return {
    name: defaultMetaDeckName(standing.legendName, playerName, eventName),
    format,
    formatConfig: null,
    cards: folded,
    listStatus: listStatusFor(
      lines.map((line) => ({ name: line.cardName, zone: line.zone, quantity: line.quantity })),
      standing.legendName,
    ),
  };
}

/**
 * Overlays land after the source, so a correction is never undone by a
 * re-fetch. This runs whether or not any source holds standings: a
 * hand-entered or push-only event's corrections apply the same way.
 *
 * An overlay anchored to the event rather than a row (a submission for an
 * entry the archive may or may not list) is resolved here: matched onto the
 * row whose rendered name it names, or minted as a new row when it names
 * nobody and claims enough to stand alone. Either way the resolution is
 * written back onto the overlay, so the next promote applies it directly.
 */
async function applyPlayerOverlays(
  repos: Repos,
  metaEventId: string,
  /** The event's format as the row now holds it, for a list an overlay supplies. */
  format: string,
  result: MetaPromoteResult,
  cardIndex: CardNameIndex,
): Promise<void> {
  const overlays = await repos.metaOverlays.acceptedPlayerOverlays(metaEventId);
  if (overlays.length === 0) {
    return;
  }

  const hasLooseOverlays = overlays.some((overlay) => overlay.metaEventPlayerId === null);
  const names = hasLooseOverlays ? await repos.meta.standingsNamesForEvent(metaEventId) : [];

  const byPlayer = new Map<string, MetaPlayerOverlayRow[]>();
  for (const overlay of overlays) {
    const playerId =
      overlay.metaEventPlayerId ??
      (await resolveOverlayTarget(repos, metaEventId, overlay, names, result));
    if (playerId === null) {
      continue;
    }
    const bucket = byPlayer.get(playerId);
    if (bucket === undefined) {
      byPlayer.set(playerId, [overlay]);
    } else {
      bucket.push(overlay);
    }
  }

  const players = await repos.meta.rawStandingsForEvent(metaEventId);
  for (const player of players) {
    const patches = byPlayer.get(player.id);
    if (patches === undefined || patches.length === 0) {
      continue;
    }
    const base = {
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
      entryStatus: player.entryStatus,
      legendCardId: player.legendCardId,
      championCardId: player.championCardId,
    } satisfies Record<string, unknown>;

    const applied = applyOverlays(
      base,
      patches.map((overlay): MetaPlayerOverlayPatch<Partial<typeof base>> => ({
        claimedFields: overlay.claimedFields,
        values: {
          // A name-keyed live row must keep a name, so a claimed-empty name
          // falls through to the base there; rank and its flag are NOT NULL
          // and fall through the same way.
          playerName:
            player.uvsgamesPlayerId === null
              ? (overlay.playerName ?? undefined)
              : overlay.playerName,
          rank: overlay.rank ?? undefined,
          rankIsTier: overlay.rankIsTier ?? undefined,
          wins: overlay.wins,
          losses: overlay.losses,
          draws: overlay.draws,
          matchPoints: overlay.matchPoints,
          opponentMatchWinPct: overlay.opponentMatchWinPct,
          gameWinPct: overlay.gameWinPct,
          opponentGameWinPct: overlay.opponentGameWinPct,
          entryStatus: overlay.entryStatus,
          legendCardId: overlay.legendCardId,
          championCardId: overlay.championCardId,
        } as Partial<typeof base>,
      })),
    );
    await repos.meta.updatePlayer(player.id, applied);

    const withList = patches.filter((overlay) => overlay.claimedFields.includes("cards"));
    const latest = withList.at(-1);
    if (latest !== undefined) {
      await applyOverlayList(repos, player.id, latest.id, format, cardIndex);
    }
  }
}

/**
 * Where an event-anchored overlay lands: the row whose rendered name it names
 * (rank breaks a shared name), or a new row when it names nobody the event
 * lists and claims the two columns a row cannot exist without.
 *
 * @returns The live row's id, with the link written back onto the overlay, or
 *   null when the overlay cannot be placed — which is reported, because an
 *   accepted overlay that silently never lands would read as data loss.
 */
async function resolveOverlayTarget(
  repos: Repos,
  metaEventId: string,
  overlay: MetaPlayerOverlayRow,
  names: { id: string; name: string; rank: number }[],
  result: MetaPromoteResult,
): Promise<string | null> {
  const overlayName = normalizedName(overlay.playerName);
  if (overlayName !== "") {
    const named = names.filter((row) => normalizedName(row.name) === overlayName);
    const matched =
      named.length === 1
        ? named[0]
        : named.find((row) => overlay.rank !== null && row.rank === overlay.rank);
    if (matched !== undefined) {
      await repos.metaOverlays.linkPlayerOverlay(overlay.id, matched.id);
      return matched.id;
    }
  }

  if (overlay.playerName === null || overlay.rank === null) {
    result.errors.push(
      `An accepted standings overlay could not be placed: it names ${
        overlay.playerName ?? "no player"
      } and matches no row. Link it to an entry from the review queue.`,
    );
    return null;
  }

  const created = await createMetaEventPlayer(repos.meta, {
    eventId: metaEventId,
    rank: overlay.rank,
    rankIsTier: overlay.rankIsTier ?? false,
    playerName: overlay.playerName,
    wins: overlay.wins,
    losses: overlay.losses,
    draws: overlay.draws,
    entryStatus: overlay.entryStatus,
    legendCardId: overlay.legendCardId,
    championCardId: overlay.championCardId,
    mintedByOverlayId: overlay.id,
    deck: null,
  });
  if (created === undefined) {
    return null;
  }
  await repos.metaOverlays.linkPlayerOverlay(overlay.id, created.metaEventPlayerId);
  names.push({ id: created.metaEventPlayerId, name: overlay.playerName, rank: overlay.rank });
  result.players++;
  return created.metaEventPlayerId;
}

/** Deletes only rows carrying `mintedByOverlayId`; hand-entered and source-backed rows never qualify. */
async function dropOrphanMintedPlayers(
  repos: Repos,
  metaEventId: string,
  result: MetaPromoteResult,
): Promise<void> {
  const orphans = await repos.meta.orphanMintedPlayerIds(metaEventId);
  for (const playerId of orphans) {
    await repos.metaOverlays.unanchorPlayerOverlays(playerId, metaEventId);
    await repos.meta.deletePlayer(playerId);
    result.removedPlayers++;
  }
}

/**
 * A submitted list becomes the live deck only once every line resolves. A
 * `cards` claim with no lines is the opposite statement — there is no list —
 * and detaches the deck the sources would otherwise re-attach.
 */
async function applyOverlayList(
  repos: Repos,
  metaEventPlayerId: string,
  overlayId: string,
  format: string,
  cardIndex: CardNameIndex,
): Promise<void> {
  const overlay = await repos.metaOverlays.playerOverlayById(overlayId);
  if (overlay === undefined) {
    return;
  }
  if (overlay.cards.length === 0) {
    await repos.meta.clearPlayerDeck(metaEventPlayerId);
    return;
  }
  const cards: MetaDeckCardInput[] = [];
  for (const line of overlay.cards) {
    const cardId = line.cardId ?? resolveCardIdByName(cardIndex, line.cardName);
    if (cardId === null) {
      return;
    }
    cards.push({
      cardId,
      zone: line.zone as DeckZone,
      quantity: line.quantity,
      preferredPrintingId: line.preferredPrintingId,
    });
  }
  const player = await repos.meta.playerById(metaEventPlayerId);
  if (player === undefined) {
    return;
  }
  await setMetaPlayerList(repos.meta, metaEventPlayerId, {
    name: player.deckName ?? defaultMetaDeckName(player.legendName, player.playerName, ""),
    format,
    formatConfig: null,
    cards,
    listStatus: (overlay.listStatus ?? "full") as Exclude<MetaListStatus, "none">,
  });
}

/**
 * Phases and pairings, both uvsgames-only today.
 *
 * A mirror match promotes when both its participants resolve to live player
 * rows. One that does not is simply left; the next promote picks it up once its
 * players exist, with no stamped-back link and no retry queue to maintain.
 */
async function promotePhasesAndMatches(
  repos: Repos,
  metaEventId: string,
  sources: readonly { provider: string | null; externalId: string | null }[],
  result: MetaPromoteResult,
): Promise<void> {
  const uvs = sources.find((source) => source.provider === UVSGAMES_PROVIDER);
  if (uvs === undefined || uvs.externalId === null) {
    return;
  }

  const phases = await repos.uvsgamesResults.phases(uvs.externalId);
  if (phases.length > 0) {
    const rows = phases.map((phase) => ({
      metaEventId,
      phaseOrder: phase.phaseOrder,
      name: phase.name,
      roundType: phase.roundType,
      roundCount: phase.roundCount,
      rankRequired: phase.rankRequired,
      maxGameWins: phase.maxGameWins,
    }));
    if (!samePhases(await repos.meta.phasesForEvent(metaEventId), rows)) {
      await repos.meta.replaceEventPhases(metaEventId, rows);
    }
    result.phases = phases.length;
  }

  const matches = await repos.uvsgamesResults.matches(uvs.externalId);
  if (matches.length === 0) {
    return;
  }
  const players = await repos.meta.rawStandingsForEvent(metaEventId);
  const liveByUvsId = new Map(
    players
      .filter((player) => player.uvsgamesPlayerId !== null)
      .map((player) => [player.uvsgamesPlayerId as number, player.id]),
  );

  const rows = [];
  for (const match of matches) {
    const player1Id = liveByUvsId.get(match.player1UvsgamesId);
    const player2Id =
      match.player2UvsgamesId === null ? null : liveByUvsId.get(match.player2UvsgamesId);
    if (player1Id === undefined || (match.player2UvsgamesId !== null && player2Id === undefined)) {
      continue;
    }
    rows.push({
      metaEventId,
      phaseOrder: match.phaseOrder,
      roundNumber: match.roundNumber,
      tableNumber: match.tableNumber,
      isBye: match.isBye,
      isDraw: match.isDraw,
      player1Id,
      player2Id: player2Id ?? null,
      winnerId:
        match.winnerUvsgamesId === null ? null : (liveByUvsId.get(match.winnerUvsgamesId) ?? null),
      gamesWonP1: match.gamesWonP1,
      gamesWonP2: match.gamesWonP2,
      sourceRoundId: match.roundId,
      sourceMatchId: match.sourceMatchId,
    });
  }
  result.matches = rows.length;
  if (rows.length === 0) {
    return;
  }
  const changed = changedMatches(await repos.meta.matchesForEvent(metaEventId), rows);
  if (changed.length > 0) {
    await repos.meta.upsertEventMatches(changed);
  }
}

function samePhases(
  stored: readonly MetaEventPhaseRow[],
  next: readonly NewMetaEventPhase[],
): boolean {
  if (stored.length !== next.length) {
    return false;
  }
  return next.every((row, index) => {
    const was = stored[index];
    return (
      was !== undefined &&
      was.phaseOrder === row.phaseOrder &&
      was.name === row.name &&
      was.roundType === row.roundType &&
      was.roundCount === row.roundCount &&
      was.rankRequired === row.rankRequired &&
      was.maxGameWins === row.maxGameWins
    );
  });
}

/** @returns The pairings whose stored row would actually move. */
function changedMatches(
  stored: readonly MetaEventMatchRow[],
  next: readonly NewMetaEventMatch[],
): NewMetaEventMatch[] {
  const byKey = new Map(
    stored.flatMap((row) =>
      row.sourceMatchId === null ? [] : [[row.sourceMatchId, row] as const],
    ),
  );
  return next.filter((row) => {
    // A row the source gave no id to cannot be matched up, so it is always
    // written and left to the seat index to converge.
    if (row.sourceMatchId === null || row.sourceMatchId === undefined) {
      return true;
    }
    const was = byKey.get(row.sourceMatchId);
    return (
      was === undefined ||
      was.phaseOrder !== row.phaseOrder ||
      was.roundNumber !== row.roundNumber ||
      was.sourceRoundId !== row.sourceRoundId ||
      was.tableNumber !== row.tableNumber ||
      was.isBye !== row.isBye ||
      was.isDraw !== row.isDraw ||
      was.player1Id !== row.player1Id ||
      was.player2Id !== row.player2Id ||
      was.winnerId !== row.winnerId ||
      was.gamesWonP1 !== row.gamesWonP1 ||
      was.gamesWonP2 !== row.gamesWonP2
    );
  });
}

/**
 * Mints the live event for a source key that has none, then promotes it.
 *
 * This is what catalogue accept calls. The citation is written first because
 * promotion reads `meta_event_sources` to know what to promote from. A null
 * key is a hand submission: it gets a keyless citation and can never be
 * deduplicated, which is why accept offers linking to an existing event first.
 */
export async function promoteNewEvent(
  repos: Repos,
  provider: string | null,
  externalId: string | null,
  seed: { name: string; eventDate: string; format: string; sourceUrl: string | null },
): Promise<{ metaEventId: string; slug: string; created: boolean }> {
  if (provider !== null && externalId !== null) {
    const existing = await repos.meta.sourceByKey(provider, externalId);
    if (existing !== undefined) {
      await promoteMetaEvent(repos, existing.metaEventId);
      const live = await repos.meta.eventById(existing.metaEventId);
      return {
        metaEventId: existing.metaEventId,
        slug: live?.slug ?? "",
        created: false,
      };
    }
  }

  const slug = await resolveEventSlug(repos, seed.name, seed.eventDate);
  const created = await repos.meta.createEvent({
    slug,
    name: seed.name,
    eventDate: seed.eventDate,
    format: seed.format,
    playerCount: null,
    organizer: null,
    notes: null,
    tier: "local",
    country: null,
    location: null,
  });

  await repos.meta.insertEventSource({
    metaEventId: created.id,
    provider,
    externalId,
    label: provider ?? "Submission",
    sourceUrl: seed.sourceUrl,
  });
  await promoteMetaEvent(repos, created.id);
  return { metaEventId: created.id, slug, created: true };
}

async function resolveEventSlug(repos: Repos, name: string, eventDate: string): Promise<string> {
  for (const slug of metaEventSlugCandidates(name, eventDate)) {
    const taken = await repos.meta.eventBySlug(slug);
    if (taken === undefined) {
      return slug;
    }
  }
  throw new AppError(
    409,
    ERROR_CODES.CONFLICT,
    `Could not find a free slug for "${name}". Rename the event, or add it by hand.`,
  );
}
