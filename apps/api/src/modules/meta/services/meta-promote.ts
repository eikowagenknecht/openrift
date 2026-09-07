import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  DeckZone,
  MetaEntryStatus,
  MetaEventOverlayField,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";
import type { Selectable } from "kysely";

import type { MetaEventPlayersTable } from "../../../db/index.js";
import type { Repos } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { CardNameIndex } from "../../candidates/services/candidate-links.js";
import {
  loadCardNameIndex,
  resolveCardIdByName,
} from "../../candidates/services/candidate-links.js";
import { classifyMetaEventTier, countryFromAddress } from "../lib/meta-event-classify.js";
import {
  defaultMetaDeckName,
  metaEventSlugCandidates,
  resolvedStandingName,
} from "../lib/meta-event-naming.js";
import type { MetaEventOverlayPatch, MetaPlayerOverlayPatch } from "../lib/meta-overlay-apply.js";
import { applyOverlays } from "../lib/meta-overlay-apply.js";
import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { TOPDECK_PROVIDER, topdeckFormat, topdeckLocalDay } from "../lib/topdeck-catalog.js";
import { mapSourceFormat, UVSGAMES_PROVIDER, venueLocalDay } from "../lib/uvsgames-catalog.js";
import { listStatusFor, withSingleChampion } from "../lib/uvsgames-transform.js";
import type {
  MetaArchivedDeckInput,
  MetaDeckCardInput,
  MetaStoredPlayerDeck,
} from "../repositories/meta-decks.js";
import { deckCardMergeKey, mergeDeckCards, sameDeckCards } from "../repositories/meta-decks.js";
import type {
  MetaEventMatchRow,
  MetaEventPhaseRow,
  NewMetaEventMatch,
  NewMetaEventPhase,
} from "../repositories/meta-events.js";
import type { MetaPlayerOverlayRow } from "../repositories/meta-overlays.js";
import type { MetaPlayerLinkRow } from "../repositories/meta-player-links.js";
import type { MetaEventPlayerPatch, MetaEventPlayerUpdate } from "../repositories/meta-players.js";
import type { MetaEventSourceRow } from "../repositories/meta-sources.js";
import { createMetaEventPlayer, setMetaPlayerList } from "./meta-event-players.js";

/**
 * `live = promote(sources) + accepted overlays`; there is no staging tier
 * in between. `decks`, `meta_event_matches`, and public share tokens hang
 * off `meta_event_players.id`, so a re-promote matches existing rows by
 * their stored source identity and updates in place, never deleting and re-inserting a published field.
 */

/**
 * The rule tables a promote reads and never writes. A bulk pass builds this
 * once and hands it to every event it promotes.
 */
export interface MetaSourceContext {
  formatMappings: ReadonlyMap<string, string>;
  templateTiers: ReadonlyMap<string, MetaEventTier | null>;
  competitivePlayerFloor: number;
}

/** {@link MetaSourceContext} plus what resolving decklist card names needs. */
export interface MetaPromoteContext extends MetaSourceContext {
  cardIndex: CardNameIndex;
}

/** The mapping tables one pass reuses across every event it promotes. */
async function createMetaSourceContext(repos: Repos): Promise<MetaSourceContext> {
  const [formatMappings, templateTiers, settings] = await Promise.all([
    repos.uvsgamesEvents.formatMappings(),
    repos.uvsgamesEvents.templateTiers(),
    repos.uvsgamesEvents.settings(),
  ]);
  return { formatMappings, templateTiers, competitivePlayerFloor: settings.competitivePlayerFloor };
}

/** Everything {@link promoteMetaEvent} would otherwise load per event. */
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
export interface StandingFacts extends Record<string, unknown> {
  identity: string;
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
  provider: string;
}

/** The source's raw value for fields the projection rewrote; empty where nothing changed. */
export type MetaSourceRawTerms = Partial<Record<MetaEventOverlayField, string>>;

interface SourceFacts {
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
  unresolvedNames: string[];
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

async function uvsgamesFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const listing = await repos.uvsgamesEvents.byKey(externalId);
  if (listing === undefined) {
    return null;
  }

  const { formatMappings, templateTiers, competitivePlayerFloor } = context;
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
      tier: classifyMetaEventTier(
        {
          templateTier:
            listing.eventConfigurationTemplate === null
              ? null
              : (templateTiers.get(listing.eventConfigurationTemplate) ?? null),
          playerCount,
        },
        competitivePlayerFloor,
      ),
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

async function playloltcgFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
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
      // This source publishes no format vocabulary; geography is always CN.
      tier: `${playerCount ?? 0} players`,
    },
    event: {
      name: listing.name.slice(0, 120),
      // The source publishes day granularity only; startAt is already the venue-local day.
      eventDate: listing.startAt ?? new Date().toISOString().slice(0, 10),
      // activityType conflates city qualifiers and play nights; not mapped, filed as constructed.
      format: WellKnown.deckFormat.CONSTRUCTED,
      playerCount,
      organizer: listing.shopName === null ? null : listing.shopName.slice(0, 120),
      notes: null,
      tier: classifyMetaEventTier(
        { templateTier: null, playerCount },
        context.competitivePlayerFloor,
      ),
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

async function topdeckFacts(
  repos: Repos,
  externalId: string,
  context: MetaSourceContext,
): Promise<SourceFacts | null> {
  const listing = await repos.topdeckEvents.byKey(externalId);
  if (listing === undefined) {
    return null;
  }
  const standings = await repos.topdeckResults.standings(externalId);
  const location = listing.address === null ? null : listing.address.trim().slice(0, 500) || null;
  const playerCount = countOrNull(listing.playerCount);

  return {
    raw: {
      format: listing.format,
      eventDate: listing.startAt.toISOString(),
      // No template vocabulary here either, so field size is the whole rule.
      tier: `${playerCount ?? 0} players`,
      country: location ?? undefined,
    },
    event: {
      name: listing.name.slice(0, 120),
      eventDate: topdeckLocalDay(listing.startAt, listing.longitude),
      format: topdeckFormat(listing.format),
      playerCount,
      notes: null,
      // The source names no organizer, only where the event was held.
      organizer: null,
      tier: classifyMetaEventTier(
        { templateTier: null, playerCount },
        context.competitivePlayerFloor,
      ),
      country: listing.country,
      location,
    },
    standings: standings
      .filter((row) => row.rank !== null)
      .map((row) => ({
        identity: `t${row.playerKey}`,
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
        provider: TOPDECK_PROVIDER,
      })),
  };
}

/** Never throws: an unreadable mirror row returns null. */
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

/**
 * One mirror's standings as promotion would read them, identities included.
 * Never throws, for the same reason {@link sourceEventFacts} does not.
 */
export async function sourceStandings(
  repos: Repos,
  provider: string,
  externalId: string,
): Promise<StandingFacts[]> {
  try {
    const facts = await factsFor(repos, provider, externalId, await createMetaSourceContext(repos));
    return facts?.standings ?? [];
  } catch {
    return [];
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
    return playloltcgFacts(repos, externalId, context);
  }
  if (provider === TOPDECK_PROVIDER) {
    return topdeckFacts(repos, externalId, context);
  }
  // A push provider writes overlays, not a mirror, so there is nothing here to
  // promote and its citation still stands.
  return Promise.resolve(null);
}

/**
 * Rebuilds one live event from its linked mirrors and accepted overlays.
 * Idempotent, safe to run at any time and as often as needed.
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
    // A citation with `contributes` off is printed and never read; see
    // `insertEventSource`.
    .filter(
      (source) => source.provider !== null && source.externalId !== null && source.contributes,
    )
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
  // Only the four NOT NULL columns fall back to the live row; every other field
  // starts unset so it goes empty when unclaimed. Sources apply in priority order.
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
        // applyOverlays copies any key the object owns: NOT NULL columns must
        // be omitted here, not set to undefined, when an overlay claims them empty.
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

/** One standings row after folding, with the live row it already resolves to. */
interface MergedStanding {
  standing: StandingFacts;
  existing: Selectable<MetaEventPlayersTable> | null;
}

/**
 * Folds two mirrors' standings for one player; the later source wins each
 * field it publishes, but identity, legacyIdentity, and the deck stay pinned.
 */
function foldStanding(under: StandingFacts, over: StandingFacts): StandingFacts {
  const uvsgamesPlayerId = over.uvsgamesPlayerId ?? under.uvsgamesPlayerId;
  const withDeck = over.sourceDeckId === null ? under : over;
  return {
    identity: under.identity,
    legacyIdentity: under.legacyIdentity,
    uvsgamesPlayerId,
    playerName: uvsgamesPlayerId === null ? (over.playerName ?? under.playerName) : null,
    rank: over.rank,
    rankIsTier: over.rankIsTier,
    wins: over.wins ?? under.wins,
    losses: over.losses ?? under.losses,
    draws: over.draws ?? under.draws,
    matchPoints: over.matchPoints ?? under.matchPoints,
    opponentMatchWinPct: over.opponentMatchWinPct ?? under.opponentMatchWinPct,
    gameWinPct: over.gameWinPct ?? under.gameWinPct,
    opponentGameWinPct: over.opponentGameWinPct ?? under.opponentGameWinPct,
    entryStatus: over.entryStatus ?? under.entryStatus,
    legendName: over.legendName ?? under.legendName,
    sourceDeckId: withDeck.sourceDeckId,
    provider: withDeck.provider,
  };
}

/**
 * Every source's standings, collapsed to one entry per player: a standing's
 * own identity and a confirmed cross-mirror link both key to the same live row.
 */
function foldStandings(
  collected: readonly SourceFacts[],
  existing: readonly Selectable<MetaEventPlayersTable>[],
  links: readonly MetaPlayerLinkRow[],
): Map<string, MergedStanding> {
  const linkedRows = new Map(
    links
      .filter((link) => link.metaEventPlayerId !== null)
      .map((link) => [`${link.provider}:${link.sourceIdentity}`, link.metaEventPlayerId as string]),
  );
  // Both maps read every live row, not only the ones a source identity is
  // stored on: a link may name a hand-entered row, which has none.
  const byIdentity = new Map(
    existing
      .filter((row) => row.sourceIdentity !== null)
      .map((row) => [row.sourceIdentity as string, row]),
  );
  const byRowId = new Map(existing.map((row) => [row.id, row]));

  const merged = new Map<string, MergedStanding>();
  for (const source of collected) {
    for (const standing of source.standings) {
      const rowId =
        linkedRows.get(`${standing.provider}:${standing.identity}`) ??
        byIdentity.get(standing.identity)?.id;
      const liveRow = rowId === undefined ? null : (byRowId.get(rowId) ?? null);
      const key = rowId === undefined ? `s:${standing.identity}` : `p:${rowId}`;
      const held = merged.get(key);
      merged.set(key, {
        // A linked standing takes the live row's own identity: the key a later
        // promote resolves it by.
        standing:
          held === undefined
            ? { ...standing, identity: liveRow?.sourceIdentity ?? standing.identity }
            : foldStanding(held.standing, standing),
        existing: liveRow,
      });
    }
  }
  return merged;
}

/**
 * Matches existing rows by stored source identity and updates them; new
 * standings insert. Nothing is deleted, since that would drop an attached deck's permalink.
 */
async function promoteStandings(
  repos: Repos,
  metaEventId: string,
  live: MetaPromotedEventFacts,
  sources: readonly MetaEventSourceRow[],
  collected: readonly SourceFacts[],
  result: MetaPromoteResult,
  cardIndex: CardNameIndex,
): Promise<void> {
  const existing = await repos.meta.rawStandingsForEvent(metaEventId);
  const byLegacy = new Map(
    existing
      .filter((row) => row.sourceIdentity === null)
      .map((row) => [legacyIdentityOf(row.uvsgamesPlayerId, row.playerName), row]),
  );
  const links = await repos.metaPlayerLinks.forEvent(metaEventId);
  const merged = foldStandings(collected, existing, links);
  if (merged.size === 0) {
    return;
  }

  const standings = [...merged.values()];
  const providers = new Set(standings.map((entry) => entry.standing.provider));
  const deckLines = await loadDeckLines(repos, sources, providers);
  // A row the source keys by user id stores no name of its own, so the deck's
  // default name has to reach for the same display name the read surfaces join.
  const displayNames = await repos.uvsgamesEvents.playerDisplayNames(
    standings.flatMap((entry) =>
      entry.standing.uvsgamesPlayerId === null ? [] : [entry.standing.uvsgamesPlayerId],
    ),
  );
  const deckStates = await repos.meta.deckStatesForEvent(metaEventId);
  const unresolved = new Set<string>();
  const mergedLines = new Set<string>();
  const updates: MetaEventPlayerUpdate[] = [];
  const deckWrites: { playerId: string; deck: MetaArchivedDeckInput }[] = [];

  for (const { standing, existing: resolved } of standings) {
    const legendCardId =
      standing.legendName === null ? null : resolveCardIdByName(cardIndex, standing.legendName);
    if (standing.legendName !== null && legendCardId === null) {
      unresolved.add(standing.legendName);
    }

    // A legacy row can be claimed by one standing per pass; two providers sharing
    // a legacy identity must not both stamp it, or the loser duplicates next promote.
    let existingRow = resolved;
    if (existingRow === null) {
      existingRow = byLegacy.get(standing.legacyIdentity) ?? null;
      if (existingRow !== null) {
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

    if (existingRow === null) {
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

/**
 * Deck ids are only unique within a provider, so the map that holds every
 * linked mirror's lists is keyed by both.
 */
function deckLineKey(provider: string, sourceDeckId: string): string {
  return `${provider}:${sourceDeckId}`;
}

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
        lines.set(deckLineKey(UVSGAMES_PROVIDER, deckId), rows);
      }
    }
    if (source.provider === PLAYLOLTCG_PROVIDER && providers.has(PLAYLOLTCG_PROVIDER)) {
      const activityShopId = Number(source.externalId);
      if (Number.isInteger(activityShopId)) {
        for (const [deckId, rows] of await repos.playloltcgResults.decklistCards(activityShopId)) {
          lines.set(deckLineKey(PLAYLOLTCG_PROVIDER, deckId), rows);
        }
      }
    }
    if (source.provider === TOPDECK_PROVIDER && providers.has(TOPDECK_PROVIDER)) {
      for (const [deckId, rows] of await repos.topdeckResults.decklistCards(source.externalId)) {
        lines.set(deckLineKey(TOPDECK_PROVIDER, deckId), rows);
      }
    }
  }
  return lines;
}

/** An unresolved decklist line yields no deck, never a partial one. */
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
  const lines = withSingleChampion(
    deckLines.get(deckLineKey(standing.provider, standing.sourceDeckId)) ?? [],
  );
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
 * Overlays apply after sources so a correction survives a re-fetch; one
 * anchored to the event resolves onto a matched row (or mints one) and self-records that resolution.
 */
async function applyPlayerOverlays(
  repos: Repos,
  metaEventId: string,
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
          // A name-keyed row must keep a name, so a claimed-empty name falls
          // through to the base; rank and its flag are NOT NULL and do the same.
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
 * Matches an event-anchored overlay onto the row whose rendered name it names
 * (rank breaks a tie), or mints a new row; an unplaceable overlay is reported, not silently dropped.
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
 * A submitted list becomes the live deck only once every line resolves; a
 * `cards` claim with no lines detaches the deck instead, since it claims there is none.
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
 * A mirror match promotes only once both participants resolve to a live row;
 * one that doesn't is left for the next promote to pick up naturally.
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

/** The pairings whose stored row would actually move. */
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
 * Mints a live event for a source key that has none. The citation writes
 * first, since promotion reads `meta_event_sources` to know what to promote from.
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
