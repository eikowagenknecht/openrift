import { WellKnown } from "@openrift/shared";

import { PLAYLOLTCG_PROVIDER, playloltcgEventUrl } from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { acceptCandidateEvent, acceptCandidatePlayer } from "../meta-candidate-accept.js";
import { errorText } from "./deps.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";

/**
 * Turning a playloltcg catalogue row into a live event, by hand or by the
 * player-count rule. Both paths go through the shared
 * candidate accept, so linking, citations and per-field review behave exactly as
 * for uvsgames and pushed candidates.
 *
 * Unlike uvsgames there is no template or notable-name rule: `activityType` is
 * too blunt to signal archive-worth, so the only auto-accept signal is the
 * registered player count.
 */

export interface PlayloltcgAcceptSummary {
  accepted: number;
  errors: string[];
}

export interface PlayloltcgPlayerAcceptSummary {
  accepted: number;
  skipped: number;
  errors: string[];
}

export interface AcceptedPlayloltcgEvent {
  metaEventId: string;
  slug: string;
  candidateEventId: string;
  created: boolean;
}

function eventDate(row: PlayloltcgListRow, now: Date): string {
  return row.startAt ?? now.toISOString().slice(0, 10);
}

async function ensureCandidate(deps: PlayloltcgSyncDeps, row: PlayloltcgListRow): Promise<string> {
  const externalId = String(row.activityShopId);
  const [existing] = await deps.repos.metaCandidates.eventsBySourceKeys(PLAYLOLTCG_PROVIDER, [
    externalId,
  ]);
  if (existing !== undefined) {
    return existing.id;
  }
  return await deps.repos.metaCandidates.insertEvent({
    provider: PLAYLOLTCG_PROVIDER,
    externalId,
    name: row.name.slice(0, 120),
    eventDate: eventDate(row, clock(deps)),
    format: WellKnown.deckFormat.CONSTRUCTED,
    playerCount: row.playerCount === null || row.playerCount === 0 ? null : row.playerCount,
    organizer: row.shopDisplayName === null ? null : row.shopDisplayName.slice(0, 120),
    sourceUrl: playloltcgEventUrl(row.activityShopId),
    notes: null,
    // The same three the deep fetch stages, so a hand-accepted event and a
    // fetched one carry the same metadata. playloltcg is the Chinese line, so
    // every event is CN; tier is left for a human, as activityType is too blunt.
    tier: null,
    country: "CN",
    location: (row.city ?? row.address)?.slice(0, 120) ?? null,
    metaEventId: null,
    extraData: null,
  });
}

/**
 * Accepts one catalogue row and arms its recheck queue at `now`, so the next
 * fetch pass picks it up — for a finished event that is when its standings
 * arrive, for a future one the ladder reschedules to its start.
 */
export async function acceptPlayloltcgEvent(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
): Promise<AcceptedPlayloltcgEvent> {
  const candidateEventId = await ensureCandidate(deps, row);
  const accepted = await acceptCandidateEvent(deps.repos, candidateEventId);
  await deps.repos.playloltcgEvents.setRecheck(row.activityShopId, {
    nextCheckAt: clock(deps),
    checkStage: 0,
  });
  return { ...accepted, candidateEventId };
}

/**
 * The rule-gated accept over the keys a crawl just touched. Player count only:
 * an event at or above the admin's threshold is accepted, everything else waits
 * for a human. Already-accepted or dismissed rows never reach here.
 */
export async function autoAcceptPlayloltcgEvents(
  deps: PlayloltcgSyncDeps,
  activityShopIds: readonly number[],
): Promise<PlayloltcgAcceptSummary> {
  if (activityShopIds.length === 0) {
    return { accepted: 0, errors: [] };
  }
  const settings = await deps.repos.uvsgamesEvents.settings();
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold === null) {
    return { accepted: 0, errors: [] };
  }

  const rows = await deps.repos.playloltcgEvents.unacceptedByKeys([...activityShopIds]);
  const summary: PlayloltcgAcceptSummary = { accepted: 0, errors: [] };
  for (const row of rows) {
    if (row.playerCount === null || row.playerCount < threshold) {
      continue;
    }
    try {
      await acceptPlayloltcgEvent(deps, row);
      summary.accepted++;
    } catch (error) {
      summary.errors.push(errorText(error, `Auto-accept "${row.name}"`));
    }
  }
  return summary;
}

/**
 * Accepts the standings rows a fetch just staged under an already-live event. A
 * row whose deck carries an unresolved card is left for a human; the rest are
 * accepted with an unresolved legend allowed, so a standings row lands even when
 * its legend is a card the matcher does not know.
 */
export async function autoAcceptPlayloltcgPlayers(
  deps: PlayloltcgSyncDeps,
  candidateEventId: string,
  metaEventId: string,
): Promise<PlayloltcgPlayerAcceptSummary> {
  const linked = await deps.repos.metaCandidates.eventsByMetaEventId(metaEventId);
  if (linked.some((row) => row.id !== candidateEventId)) {
    return { accepted: 0, skipped: 0, errors: [] };
  }

  const players = await deps.repos.metaCandidates.playersByCandidateEventIds([candidateEventId]);
  const summary: PlayloltcgPlayerAcceptSummary = { accepted: 0, skipped: 0, errors: [] };
  for (const player of players) {
    if ((player.cards ?? []).some((card) => card.cardId === null)) {
      summary.skipped++;
      continue;
    }
    try {
      await acceptCandidatePlayer(deps.repos, player.id, { allowUnresolvedLegend: true });
      summary.accepted++;
    } catch (error) {
      summary.skipped++;
      summary.errors.push(errorText(error, `Accept "${player.playerName}"`));
    }
  }
  return summary;
}
