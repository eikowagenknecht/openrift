import { inferZone, WellKnown } from "@openrift/shared";
import type { Insertable } from "kysely";

import type { PlayloltcgEventStandingsTable } from "../../db/index.js";
import {
  PLAYLOLTCG_PROVIDER,
  projectDeckCard,
  normalizeCardNo,
  referencedDeckIds,
} from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { promoteMetaEvent } from "../meta-promote.js";
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
 *
 * Missing is derived from the standings just read, not the mirror's previous
 * pass: on a first visit the mirror holds no standings yet, and reading the
 * gap from it would fetch nothing.
 */
async function fetchDecks(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  standings: readonly Record<string, unknown>[],
  held: ReadonlySet<string>,
  errors: string[],
): Promise<Record<string, unknown>> {
  const decks: Record<string, unknown> = {};
  const missing = referencedDeckIds(standings).filter((id) => !held.has(id));
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

interface PlayloltcgDeckLine {
  lineNumber: number;
  zone: string;
  quantity: number;
  cardName: string;
}

/**
 * One deck's lines for the mirror, with the name the source published.
 *
 * The catalog bridge is consulted only to place a card in its zone, never to
 * rewrite its name: the mirror stores what the source said, and promotion is
 * what matches it.
 */
function projectPlayloltcgDeckLines(
  cards: readonly unknown[],
  bridge: Map<string, { cardId: string; name: string; type: string }>,
): PlayloltcgDeckLine[] {
  const lines: PlayloltcgDeckLine[] = [];
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
    lines.push({ lineNumber: lines.length, zone, quantity: card.cardCount, cardName: name });
  }
  return lines;
}

/** The legend a deck's lines imply, for the standings row's own column. */
function legendFromLines(lines: readonly { zone: string; cardName: string }[]): string | null {
  return lines.find((line) => line.zone === WellKnown.deckZone.LEGEND)?.cardName ?? null;
}

/**
 * Pulls one event into this source's mirror, then promotes it. Individual
 * failures are collected, not thrown: a deck body that 404s still leaves a full
 * standings table worth archiving.
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

  const held = await deps.repos.playloltcgResults.heldDeckIds(activityShopId);
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

  const deckBodies = await fetchDecks(deps, activityShopId, standings, held, errors);
  // Lines the mirror already holds, so a row whose deck was fetched on an
  // earlier pass keeps its legend instead of losing it to an empty body.
  const heldLines = await deps.repos.playloltcgResults.decklistCards(activityShopId);
  // Every card the held bodies name, resolved through the bridge in one lookup
  // so the per-deck loop below is pure.
  const shortCodes = Object.values(deckBodies)
    .flatMap((body) => (Array.isArray(body) ? body : []))
    .map((card) => normalizeCardNo((record(card) ?? {}).cardNo))
    .filter((code): code is string => code !== null);
  const bridge = await deps.repos.playloltcgEvents.cardsByShortCode(shortCodes);

  let decks = 0;
  const seenNames = new Map<string, number>();
  const rows: Insertable<PlayloltcgEventStandingsTable>[] = [];
  for (const s of standings) {
    const rank = num(s.finalRanking);
    const rawName = typeof s.name === "string" ? s.name.trim() : "";
    if (rank === null || rawName === "") {
      continue;
    }
    const playerName = rawName.slice(0, 80);
    const cardGroupId = num(s.cardGroupId) ?? 0;
    const sourceDeckId = cardGroupId > 0 ? String(cardGroupId) : null;
    const body = sourceDeckId === null ? [] : deckCards(deckBodies, cardGroupId);
    let lines: PlayloltcgDeckLine[] = [];
    if (body.length > 0) {
      decks++;
      lines = projectPlayloltcgDeckLines(body, bridge);
      await deps.repos.playloltcgResults.putDecklist(
        {
          sourceDeckId: sourceDeckId as string,
          activityShopId,
          fetchStatus: "fetched",
          fetchedAt: clock(deps),
        },
        lines,
      );
    } else if (sourceDeckId !== null) {
      lines = heldLines.get(sourceDeckId) ?? [];
    }
    const userId = num(s.userId);
    rows.push({
      activityShopId,
      playerKey: playerKey(s, playerName, seenNames),
      sourceUserId: userId !== null && Number.isInteger(userId) && userId > 0 ? userId : null,
      playerName,
      rank,
      wins: num(s.winCount),
      losses: null,
      draws: null,
      legendName: legendFromLines(lines),
      sourceDeckId,
      fetchedAt: clock(deps),
    });
  }

  await deps.repos.playloltcgResults.replaceStandings(activityShopId, rows);

  const source = await deps.repos.meta.sourceByKey(PLAYLOLTCG_PROVIDER, externalId);

  const result: PlayloltcgDeepFetchResult = {
    activityShopId,
    requests: deps.client.requests - before,
    players: rows.length,
    decks,
    acceptedPlayers: 0,
    skippedPlayers: 0,
    shopId: detail.shopId,
    publishedResults: detail.isPublishResult,
    complete: true,
    errors,
  };

  if (source !== undefined) {
    const promoted = await promoteMetaEvent(deps.repos, source.metaEventId);
    result.acceptedPlayers = promoted.players;
    result.skippedPlayers = promoted.unresolvedNames.length;
    errors.push(...promoted.errors);
  }

  return result;
}
