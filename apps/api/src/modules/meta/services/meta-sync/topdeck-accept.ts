import { TOPDECK_PROVIDER } from "../../../../lib/meta-providers.js";
import { topdeckEventUrl, topdeckFormat, topdeckLocalDay } from "../../lib/topdeck-catalog.js";
import type { TopdeckListRow } from "../../repositories/topdeck-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import { errorText } from "./deps.js";
import type { TopdeckSyncDeps } from "./topdeck-deps.js";

export interface TopdeckAcceptSummary {
  considered: number;
  accepted: number;
  failed: number;
  errors: string[];
}

const SWEEP_PAGE = 1000;

const MAX_SWEEP_ERRORS = 50;

const MAX_EVENT_NAME = 120;

function emptySummary(): TopdeckAcceptSummary {
  return { considered: 0, accepted: 0, failed: 0, errors: [] };
}

export interface AcceptedTopdeckEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

/** The results are already mirrored, so `promoteNewEvent` fills the live event in the same call. */
export async function acceptTopdeckEvent(
  deps: TopdeckSyncDeps,
  row: TopdeckListRow,
): Promise<AcceptedTopdeckEvent> {
  return await promoteNewEvent(deps.repos, TOPDECK_PROVIDER, row.tid, {
    name: row.name.slice(0, MAX_EVENT_NAME),
    eventDate: topdeckLocalDay(row.startAt, row.longitude),
    format: topdeckFormat(row.format),
    sourceUrl: topdeckEventUrl(row.tid),
  });
}

async function sweep(
  deps: TopdeckSyncDeps,
  threshold: number,
  tids: readonly string[],
): Promise<TopdeckAcceptSummary> {
  const summary = emptySummary();
  for (let index = 0; index < tids.length; index += SWEEP_PAGE) {
    const page = tids.slice(index, index + SWEEP_PAGE);
    const rows = await deps.repos.topdeckEvents.unacceptedByKeys(page);
    summary.considered += rows.length;
    for (const row of rows) {
      // Team events have one archive row per player; a trios field would
      // read as an individual result if auto-accepted.
      if (row.isTeamEvent || row.playerCount === null || row.playerCount < threshold) {
        continue;
      }
      try {
        await acceptTopdeckEvent(deps, row);
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

export async function autoAcceptTopdeckEvents(
  deps: TopdeckSyncDeps,
  tids: readonly string[],
): Promise<TopdeckAcceptSummary> {
  if (tids.length === 0) {
    return emptySummary();
  }
  const settings = await deps.repos.uvsgamesEvents.settings();
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold === null) {
    return emptySummary();
  }
  return await sweep(deps, threshold, tids);
}

// Sweeps every row still awaiting triage, not just one crawl's own keys, so
// a threshold lowered today also catches up events already in the list.
export async function autoAcceptTopdeckBacklog(
  deps: TopdeckSyncDeps,
): Promise<TopdeckAcceptSummary> {
  const settings = await deps.repos.uvsgamesEvents.settings();
  const threshold = settings.autoAcceptMinPlayers;
  if (threshold === null) {
    return emptySummary();
  }
  return await sweep(deps, threshold, await deps.repos.topdeckEvents.newKeys());
}
