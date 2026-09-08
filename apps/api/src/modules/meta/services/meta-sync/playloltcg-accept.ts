import { WellKnown } from "@openrift/shared/well-known";

import { PLAYLOLTCG_PROVIDER } from "../../../../lib/meta-providers.js";
import { playloltcgEventUrl } from "../../lib/playloltcg-catalog.js";
import type { PlayloltcgListRow } from "../../repositories/playloltcg-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import { errorText } from "./deps.js";
import type { PlayloltcgSyncDeps } from "./playloltcg-deps.js";
import { clock } from "./playloltcg-deps.js";

/** This source has no template or notable-name signal; `activityType` doesn't distinguish events, so player count is the only accept rule. */
export interface PlayloltcgAcceptSummary {
  considered: number;
  accepted: number;
  failed: number;
  errors: string[];
}

const SWEEP_PAGE = 1000;
const MAX_SWEEP_ERRORS = 50;

function emptySummary(): PlayloltcgAcceptSummary {
  return { considered: 0, accepted: 0, failed: 0, errors: [] };
}

export interface AcceptedPlayloltcgEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

function eventDate(row: PlayloltcgListRow, now: Date): string {
  return row.startAt ?? now.toISOString().slice(0, 10);
}

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
      // This source carries no other format.
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

async function sweep(
  deps: PlayloltcgSyncDeps,
  threshold: number,
  activityShopIds: readonly number[],
): Promise<PlayloltcgAcceptSummary> {
  const summary = emptySummary();
  for (let index = 0; index < activityShopIds.length; index += SWEEP_PAGE) {
    const page = activityShopIds.slice(index, index + SWEEP_PAGE);
    const rows = await deps.repos.playloltcgEvents.unacceptedByKeys(page);
    summary.considered += rows.length;
    for (const row of rows) {
      if (row.playerCount === null || row.playerCount < threshold) {
        continue;
      }
      try {
        await acceptPlayloltcgEvent(deps, row);
        summary.accepted++;
      } catch (error) {
        summary.failed++;
        if (summary.errors.length < MAX_SWEEP_ERRORS) {
          summary.errors.push(errorText(error, `Auto-accept "${row.name}"`));
        }
      }
    }
  }
  return summary;
}

/** Already-accepted or dismissed rows never reach here. */
export async function autoAcceptPlayloltcgEvents(
  deps: PlayloltcgSyncDeps,
  activityShopIds: readonly number[],
): Promise<PlayloltcgAcceptSummary> {
  if (activityShopIds.length === 0) {
    return emptySummary();
  }
  const settings = await deps.repos.uvsgamesEvents.settings();
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold === null) {
    return emptySummary();
  }
  return await sweep(deps, threshold, activityShopIds);
}

/**
 * Runs the threshold over every row still awaiting triage, not just what a
 * crawl just wrote, so a threshold lowered today reaches events already listed.
 */
export async function autoAcceptPlayloltcgBacklog(
  deps: PlayloltcgSyncDeps,
): Promise<PlayloltcgAcceptSummary> {
  const settings = await deps.repos.uvsgamesEvents.settings();
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold === null) {
    return emptySummary();
  }
  return await sweep(deps, threshold, await deps.repos.playloltcgEvents.newKeys());
}
