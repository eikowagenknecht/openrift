import { WellKnown } from "@openrift/shared/well-known";
import { inferZone } from "@openrift/shared/zone-inference";
import type { Insertable } from "kysely";

import type { PlayloltcgEventStandingsTable } from "../../../../db/tables/meta-sources.js";
import {
  PLAYLOLTCG_PROVIDER,
  projectDeckCard,
  normalizeCardNo,
  referencedDeckIds,
} from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { promoteMetaEvent } from "../meta-promote.js";
import { PlayloltcgBlockedError, PlayloltcgRefusedError } from "./playloltcg-client.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";

const STANDINGS_PAGE_SIZE = 1000;

const MAX_STANDINGS_PAGES = 200;

export interface PlayloltcgDeepFetchResult {
  activityShopId: number;
  requests: number;
  players: number;
  decks: number;
  deckRequests: number;
  decksRemaining: number;
  acceptedPlayers: number;
  skippedPlayers: number;
  shopId: number | null;
  publishedResults: boolean;
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

/** PlayloltcgBlockedError blocks the whole run and must propagate past the caller's per-event error collection. */
function rethrowIfBlocked(error: unknown): void {
  if (error instanceof PlayloltcgBlockedError) {
    throw error;
  }
}

/** Returns null only on a failed read, never to mean "not published yet" (that would reset a finished event's ladder). */
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
 * The source never reports a row total. A full page means keep paging
 * until the cursor stops advancing, not the last page.
 */
async function readStandings(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  errors: string[],
): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  let cursor: number | null = null;
  for (let guard = 0; guard < MAX_STANDINGS_PAGES; guard++) {
    let body;
    try {
      body = await deps.client.postList<Record<string, unknown>>(
        "/xcx/activityUser/pageForActivityDetail",
        { pageNum: 1, pageSize: STANDINGS_PAGE_SIZE, activityShopId, startFinalRanking: cursor },
      );
    } catch (error) {
      rethrowIfBlocked(error);
      errors.push(`Event ${activityShopId} standings after rank ${cursor ?? 0}: ${failure(error)}`);
      return null;
    }
    rows.push(...body.items);
    if (body.items.length < STANDINGS_PAGE_SIZE) {
      return rows;
    }
    const last = num(body.items.at(-1)?.finalRanking);
    if (last === null || (cursor !== null && last <= cursor)) {
      errors.push(`Event ${activityShopId} standings stopped advancing at rank ${cursor ?? 0}.`);
      return null;
    }
    cursor = last;
  }
  errors.push(`Event ${activityShopId} standings exceeded ${MAX_STANDINGS_PAGES} pages.`);
  return null;
}

const SKIPPED = Symbol("deck skipped");

/** A refusal is recorded as `refused` so the id is never retried; any other failure records nothing and retries next pass. */
async function readDeck(
  deps: PlayloltcgSyncDeps,
  cardGroupId: string,
  errors: string[],
): Promise<Record<string, unknown>[] | null | typeof SKIPPED> {
  try {
    const body = await deps.client.postList<Record<string, unknown>>(
      "/xcx/cardGroup/getActivityCardGroupCardListImage",
      { id: Number(cardGroupId) },
    );
    return body.items;
  } catch (error) {
    rethrowIfBlocked(error);
    errors.push(`Deck ${cardGroupId}: ${failure(error)}`);
    return error instanceof PlayloltcgRefusedError ? null : SKIPPED;
  }
}

interface PlayloltcgDeckFetch {
  bodies: Map<string, Record<string, unknown>[]>;
  refused: string[];
  requests: number;
  remaining: number;
}

/** Missing decks are diffed against the standings just read, not the mirror's prior fetch, which holds nothing on a first visit. */
async function fetchDecks(
  deps: PlayloltcgSyncDeps,
  activityShopId: number,
  standings: readonly Record<string, unknown>[],
  held: ReadonlySet<string>,
  budget: number,
  errors: string[],
): Promise<PlayloltcgDeckFetch> {
  const missing = referencedDeckIds(standings).filter((id) => !held.has(id));
  const wanted = missing.slice(0, Math.max(budget, 0));
  if (wanted.length < missing.length) {
    errors.push(
      `Event ${activityShopId} is missing ${missing.length} decks; read ${wanted.length} within this run's budget, the rest follow shortly.`,
    );
  }
  const bodies = new Map<string, Record<string, unknown>[]>();
  const refused: string[] = [];
  for (const id of wanted) {
    const body = await readDeck(deps, id, errors);
    if (body === SKIPPED) {
      continue;
    }
    if (body === null || body.length === 0) {
      refused.push(id);
      continue;
    }
    bodies.set(id, body);
  }
  return {
    bodies,
    refused,
    requests: wanted.length,
    remaining: missing.length - wanted.length,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Keyed by source user id, or name+occurrence as fallback, never rank:
 * the source re-ranks standings on finalization.
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

/** The bridge is consulted only for zone placement, never to rewrite the source's published card name. */
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

function legendFromLines(lines: readonly { zone: string; cardName: string }[]): string | null {
  return lines.find((line) => line.zone === WellKnown.deckZone.LEGEND)?.cardName ?? null;
}

/** Failures are collected, not thrown; a bad deck body doesn't block the rest of the standings table. */
export async function playloltcgDeepFetch(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
  detail: PlayloltcgDetailFacts,
  deckBudget: number,
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
      deckRequests: 0,
      decksRemaining: 0,
      acceptedPlayers: 0,
      skippedPlayers: 0,
      shopId: detail.shopId,
      publishedResults: detail.isPublishResult,
      complete: false,
      errors,
    };
  }

  const fetched = await fetchDecks(deps, activityShopId, standings, held, deckBudget, errors);
  const heldLines = await deps.repos.playloltcgResults.decklistCards(activityShopId);
  const shortCodes = [...fetched.bodies.values()]
    .flat()
    .map((card) => normalizeCardNo((record(card) ?? {}).cardNo))
    .filter((code): code is string => code !== null);
  const bridge = await deps.repos.playloltcgEvents.cardsByShortCode(shortCodes);

  const freshLines = new Map<string, PlayloltcgDeckLine[]>();
  for (const [sourceDeckId, body] of fetched.bodies) {
    const lines = projectPlayloltcgDeckLines(body, bridge);
    freshLines.set(sourceDeckId, lines);
    await deps.repos.playloltcgResults.putDecklist(
      { sourceDeckId, activityShopId, fetchStatus: "fetched", fetchedAt: clock(deps) },
      lines,
    );
  }
  // Refused decks are still recorded (with no lines) so the next pass doesn't re-request them.
  for (const sourceDeckId of fetched.refused) {
    await deps.repos.playloltcgResults.putDecklist(
      { sourceDeckId, activityShopId, fetchStatus: "refused", fetchedAt: clock(deps) },
      [],
    );
  }

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
    const lines: readonly { zone: string; cardName: string }[] =
      sourceDeckId === null
        ? []
        : (freshLines.get(sourceDeckId) ?? heldLines.get(sourceDeckId) ?? []);
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
    decks: fetched.bodies.size,
    deckRequests: fetched.requests,
    decksRemaining: fetched.remaining,
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
