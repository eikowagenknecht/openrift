import type { MetaIngestEventPlayer } from "@openrift/shared";
import { inferZone, WellKnown } from "@openrift/shared";

import type { CandidateMetaEventRaw } from "../../db/index.js";
import {
  PLAYLOLTCG_PROVIDER,
  playloltcgEventUrl,
  projectDeckCard,
  normalizeCardNo,
  referencedDeckIds,
  storedDecks,
} from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { ingestMetaCandidates } from "../ingest-meta-candidates.js";
import { autoAcceptPlayloltcgPlayers } from "./playloltcg-accept.js";
import { PlayloltcgBlockedError } from "./playloltcg-client.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";

/**
 * One accepted playloltcg event's results: the detail (for the exact shop id
 * and the results-published flag), the whole standings table, and one deck body
 * per player who submitted a list.
 * Staged through the shared ingest, so review, linking and accept are shared.
 *
 * The card bridge is what makes this cleaner than uvsgames: each `cardNo`
 * resolves deterministically to our SC card, so the canonical name we hand the
 * ingest matches its alias index exactly rather than hoping a transcription does.
 */

/** The ceiling on deck-body requests for one event; the ladder picks up the rest. */
const MAX_DECK_FETCHES = 400;
const STANDINGS_PAGE_SIZE = 1000;
const MAX_STANDINGS_PAGES = 50;

/** Chinese all-players placement is a real ranking, not a cut tier. */
const RANK_IS_TIER = false;

export interface PlayloltcgDeepFetchResult {
  activityShopId: number;
  requests: number;
  players: number;
  decks: number;
  acceptedPlayers: number;
  skippedPlayers: number;
  /** The shop id the detail exposed, so the run can report the link it made. */
  shopId: number | null;
  /** The source's definitive results-published flag. */
  publishedResults: boolean;
  /**
   * False when the standings could not be read whole, so nothing was staged.
   * The caller holds the recheck ladder where it is rather than treating a
   * failed pass as a completed one.
   */
  complete: boolean;
  errors: string[];
}

export interface PlayloltcgDetailFacts {
  shopId: number | null;
  shopName: string | null;
  isPublishResult: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A refusal is not this event's problem: it holds for the whole run, so it has
 * to reach the job that stands the source down rather than being collected as
 * one more per-event error.
 */
function rethrowIfBlocked(error: unknown): void {
  if (error instanceof PlayloltcgBlockedError) {
    throw error;
  }
}

/**
 * One cheap detail read: the exact shop id, the shop name, and the definitive
 * results-published flag. The recheck reads this first to decide whether the
 * event is worth the full standings-and-decks fetch.
 *
 * @returns The facts, or null when the source could not be read. A failed read
 *   is never a "not published yet" answer: reporting one would walk a finished
 *   event's ladder back to the event-day poll.
 */
export async function readPlayloltcgDetail(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  errors: string[],
): Promise<PlayloltcgDetailFacts | null> {
  try {
    const result = await deps.client.get<unknown>("/xcx/activityShop/info", {
      activityShopId,
      type: 1,
    });
    const row = record(result);
    const shop = record(row?.shopInfoResponse);
    const shopId = typeof shop?.id === "number" && Number.isInteger(shop.id) ? shop.id : null;
    const shopName = typeof shop?.name === "string" ? shop.name : null;
    return { shopId, shopName, isPublishResult: row?.isPublishResult === true };
  } catch (error) {
    rethrowIfBlocked(error);
    errors.push(`Event ${activityShopId} detail: ${failure(error)}`);
    return null;
  }
}

/**
 * The whole standings table.
 *
 * @returns Every row, or null when any page failed. A partial table must never
 *   reach the ingest: it replaces the event's staged players wholesale, so the
 *   pages that did not load would be deleted along with their accepts.
 */
async function readStandings(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  errors: string[],
): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  for (let guard = 0; guard < MAX_STANDINGS_PAGES; guard++) {
    let body;
    try {
      body = await deps.client.postList<Record<string, unknown>>(
        "/xcx/activityUser/pageForActivityDetail",
        { pageNum: page, pageSize: STANDINGS_PAGE_SIZE, activityShopId, startFinalRanking: null },
      );
    } catch (error) {
      rethrowIfBlocked(error);
      errors.push(`Event ${activityShopId} standings page ${page}: ${failure(error)}`);
      return null;
    }
    rows.push(...body.items);
    if (body.items.length < STANDINGS_PAGE_SIZE || rows.length >= body.total) {
      return rows;
    }
    page++;
  }
  errors.push(`Event ${activityShopId} standings exceeded ${MAX_STANDINGS_PAGES} pages.`);
  return null;
}

/** One deck body, or null when it failed so the id stays fetchable next pass. */
async function readDeck(
  deps: PlayloltcgSyncDeps,
  cardGroupId: string,
  errors: string[],
): Promise<Record<string, unknown>[] | null> {
  try {
    const body = await deps.client.postList<Record<string, unknown>>(
      "/xcx/cardGroup/getActivityCardGroupCardListImage",
      { id: Number(cardGroupId) },
    );
    return body.items;
  } catch (error) {
    rethrowIfBlocked(error);
    errors.push(`Deck ${cardGroupId}: ${failure(error)}`);
    return null;
  }
}

/**
 * The deck bodies for one event, the stored ones reused. Decks are locked once
 * an event runs, so a body already held is never requested again and each pass
 * only closes the gap, capped. A field wider than the cap leaves the rest for
 * the next ladder visit, which is what the error line announces.
 */
async function fetchDecks(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  standings: readonly Record<string, unknown>[],
  known: Record<string, unknown>,
  errors: string[],
): Promise<Record<string, unknown>> {
  const decks: Record<string, unknown> = { ...known };
  const missing = referencedDeckIds(standings).filter((id) => !Object.hasOwn(decks, id));
  if (missing.length > MAX_DECK_FETCHES) {
    errors.push(
      `Event ${activityShopId} is missing ${missing.length} decks; read the first ${MAX_DECK_FETCHES}, the rest follow on the next recheck.`,
    );
  }
  for (const id of missing.slice(0, MAX_DECK_FETCHES)) {
    const body = await readDeck(deps, id, errors);
    if (body !== null) {
      decks[id] = body;
    }
  }
  return decks;
}

function deckCards(decks: Record<string, unknown>, cardGroupId: number): unknown[] {
  const body = decks[String(cardGroupId)];
  return Array.isArray(body) ? body : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The staged key for one standings row.
 *
 * Placement cannot be it. The source re-ranks provisional standings into final
 * ones, and an ingested event replaces its staged players wholesale, so a
 * rank-keyed row is deleted and re-staged under a new key on every re-fetch,
 * losing the accept and the live link it carried. The source's own user id is
 * the key where the payload carries one; otherwise the player's name, numbered
 * among same-name rows so a shared name still yields one key per seat.
 */
function playerKey(
  row: Record<string, unknown>,
  playerName: string,
  seenNames: Map<string, number>,
): string {
  const userId = num(row.userId);
  if (userId !== null && Number.isInteger(userId) && userId > 0) {
    return `u${userId}`;
  }
  const occurrence = (seenNames.get(playerName) ?? 0) + 1;
  seenNames.set(playerName, occurrence);
  return `n${playerName}#${occurrence}`;
}

/**
 * Turns one deck body into ingest card lines plus the legend and champion names,
 * every card resolved through the bridge to its canonical name and its zone
 * inferred from our catalog type rather than the source's category vocabulary.
 */
function buildDeck(
  cards: readonly unknown[],
  bridge: Map<string, { cardId: string; name: string; type: string }>,
): {
  cards: NonNullable<MetaIngestEventPlayer["cards"]>;
  legendName: string | null;
  championName: string | null;
} {
  const lines: NonNullable<MetaIngestEventPlayer["cards"]> = [];
  let legendName: string | null = null;
  let championName: string | null = null;
  for (const raw of cards) {
    const card = projectDeckCard(raw);
    if (card === null) {
      continue;
    }
    const resolved = card.shortCode === null ? undefined : bridge.get(card.shortCode);
    const name = resolved?.name ?? card.cardName ?? card.cardNo;
    const zone = card.isMainHero
      ? WellKnown.deckZone.CHAMPION
      : resolved
        ? inferZone([resolved.type], [], "mainDeck")
        : card.isLegend
          ? WellKnown.deckZone.LEGEND
          : WellKnown.deckZone.MAIN;
    lines.push({ name, zone, quantity: card.cardCount });
    if (zone === WellKnown.deckZone.LEGEND && legendName === null) {
      legendName = name;
    }
    if (card.isMainHero && championName === null) {
      championName = name;
    }
  }
  return { cards: lines, legendName, championName };
}

/**
 * Pulls one event and stages it as a candidate. Individual failures are
 * collected, not thrown: a deck body that 404s still leaves a full standings
 * table worth archiving.
 */
export async function playloltcgDeepFetch(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
  detail: PlayloltcgDetailFacts,
): Promise<PlayloltcgDeepFetchResult> {
  const before = deps.client.requests;
  const errors: string[] = [];
  const activityShopId = row.activityShopId;
  const externalId = String(activityShopId);

  if (detail.shopId !== null) {
    await deps.repos.playloltcgEvents.linkShopFromDetail(activityShopId, {
      id: detail.shopId,
      name: detail.shopName ?? row.shopName ?? String(detail.shopId),
    });
  }

  // Read before the deck crawl: the stored raw says which bodies are already
  // held, and the ingest below may create the candidate this reads.
  const [staged] = await deps.repos.metaCandidates.eventsBySourceKeys(PLAYLOLTCG_PROVIDER, [
    externalId,
  ]);
  const standings = await readStandings(deps, activityShopId, errors);
  if (standings === null) {
    return {
      activityShopId,
      requests: deps.client.requests - before,
      players: 0,
      decks: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: detail.shopId,
      publishedResults: detail.isPublishResult,
      complete: false,
      errors,
    };
  }

  const deckBodies = await fetchDecks(
    deps,
    activityShopId,
    standings,
    storedDecks(staged?.raw),
    errors,
  );
  // Every card the held bodies name, resolved through the bridge in one lookup
  // so the per-deck loop below is pure.
  const shortCodes = Object.values(deckBodies)
    .flatMap((body) => (Array.isArray(body) ? body : []))
    .map((card) => normalizeCardNo((record(card) ?? {}).cardNo))
    .filter((code): code is string => code !== null);
  const bridge = await deps.repos.playloltcgEvents.cardsByShortCode(shortCodes);

  let decks = 0;
  const seenNames = new Map<string, number>();
  const players: MetaIngestEventPlayer[] = [];
  for (const s of standings) {
    const rank = num(s.finalRanking);
    const rawName = typeof s.name === "string" ? s.name.trim() : "";
    if (rank === null || rawName === "") {
      continue;
    }
    const playerName = rawName.slice(0, 80);
    const cardGroupId = num(s.cardGroupId) ?? 0;
    const body = cardGroupId > 0 ? deckCards(deckBodies, cardGroupId) : [];
    const deck = body.length > 0 ? buildDeck(body, bridge) : null;
    if (deck !== null) {
      decks++;
    }
    const base = {
      externalId: playerKey(s, playerName, seenNames),
      playerName,
      rank,
      rankIsTier: RANK_IS_TIER,
      wins: num(s.winCount),
      losses: null,
      draws: null,
      // The feed publishes a placement and a win count, nothing the standings
      // were sorted by and no status.
      matchPoints: null,
      opponentMatchWinPct: null,
      gameWinPct: null,
      opponentGameWinPct: null,
      entryStatus: null,
      legendName: deck?.legendName ?? null,
      championName: deck?.championName ?? null,
    };
    players.push(
      deck === null
        ? { ...base, cards: null, listStatus: "none" }
        : { ...base, cards: deck.cards, listStatus: "full" },
    );
  }

  const eventDate = row.startAt ?? day(clock(deps));
  const ingest = await ingestMetaCandidates(deps.transact, PLAYLOLTCG_PROVIDER, [
    {
      externalId,
      name: row.name.slice(0, 120),
      eventDate,
      format: WellKnown.deckFormat.CONSTRUCTED,
      playerCount: row.playerCount === null || row.playerCount === 0 ? null : row.playerCount,
      organizer: (detail.shopName ?? row.shopDisplayName)?.slice(0, 120) ?? null,
      sourceUrl: playloltcgEventUrl(activityShopId),
      notes: null,
      // playloltcg is the Chinese line, so every event is CN; the venue city is
      // the location, and tier is left for a human (activityType is too blunt).
      tier: null,
      country: "CN",
      location: (row.city ?? row.address)?.slice(0, 120) ?? null,
      extraData: null,
      players,
    },
  ]);
  errors.push(...ingest.errors);

  const result: PlayloltcgDeepFetchResult = {
    activityShopId,
    requests: deps.client.requests - before,
    players: players.length,
    decks,
    acceptedPlayers: 0,
    skippedPlayers: 0,
    shopId: detail.shopId,
    publishedResults: detail.isPublishResult,
    complete: true,
    errors,
  };

  const [candidate] = await deps.repos.metaCandidates.eventsBySourceKeys(PLAYLOLTCG_PROVIDER, [
    externalId,
  ]);
  if (candidate === undefined) {
    return result;
  }
  const raw: CandidateMetaEventRaw = { standings, decks: deckBodies };
  await deps.repos.metaCandidates.updateEvent(candidate.id, { raw, fetchedAt: clock(deps) });

  if (candidate.metaEventId !== null) {
    const accepted = await autoAcceptPlayloltcgPlayers(deps, candidate.id, candidate.metaEventId);
    result.acceptedPlayers = accepted.accepted;
    result.skippedPlayers = accepted.skipped;
    errors.push(...accepted.errors);
    if (accepted.skipped > 0) {
      await deps.repos.metaCandidates.setEventCheckedAt(candidate.id, null);
    }
  }

  return result;
}
