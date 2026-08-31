import { WellKnown } from "@openrift/shared";

import { PLAYLOLTCG_PROVIDER, playloltcgEventUrl } from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import { errorText } from "./deps.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";

/**
 * Turning a playloltcg catalogue row into a live event, by hand or by the
 * player-count rule.
 *
 * Both paths mint the live row and its citation, then promote from this
 * source's mirror, exactly as the uvsgames path does. The only per-source
 * difference is the accept rule: there is no template or notable-name signal
 * here, because `activityType` is too blunt to say whether an event is worth
 * archiving, so the registered player count is all there is.
 */

export interface PlayloltcgAcceptSummary {
  accepted: number;
  errors: string[];
}

export interface AcceptedPlayloltcgEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

function eventDate(row: PlayloltcgListRow, now: Date): string {
  return row.startAt ?? now.toISOString().slice(0, 10);
}

/**
 * Accepts one catalogue row and arms its recheck queue at `now`, so the next
 * fetch pass picks it up. For a finished event that is when its standings
 * arrive; for a future one the ladder reschedules to its start.
 */
export async function acceptPlayloltcgEvent(
  deps: PlayloltcgSyncDeps,
  row: PlayloltcgListRow,
): Promise<AcceptedPlayloltcgEvent> {
  const promoted = await promoteNewEvent(
    deps.repos,
    PLAYLOLTCG_PROVIDER,
    String(row.activityShopId),
    {
      name: row.name.slice(0, 120),
      eventDate: eventDate(row, clock(deps)),
      // Everything on this source is filed as constructed; see the module note.
      format: WellKnown.deckFormat.CONSTRUCTED,
      sourceUrl: playloltcgEventUrl(row.activityShopId),
    },
  );
  await deps.repos.playloltcgEvents.setRecheck(row.activityShopId, {
    nextCheckAt: clock(deps),
    checkStage: 0,
  });
  return promoted;
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
