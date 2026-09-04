import {
  TOPDECK_PROVIDER,
  topdeckEventUrl,
  topdeckFormat,
  topdeckLocalDay,
} from "../../lib/topdeck-catalog.js";
import type { TopdeckListRow } from "../../repositories/topdeck-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import { errorText } from "./deps.js";
import type { TopdeckSyncDeps } from "./topdeck-deps.js";

/**
 * Turning a topdeck catalogue row into a live event. Field size is the whole
 * rule: the source publishes no template vocabulary. Nothing is armed
 * afterwards, since the catalogue pass already wrote the standings and lists.
 * Team events never auto-accept, because the archive has one row per player and
 * a trios field would read as individual results.
 */

export interface TopdeckAcceptSummary {
  /** Rows the threshold was run against. */
  considered: number;
  accepted: number;
  /** Rows over the threshold that could not be accepted. */
  failed: number;
  /** One line per failure, up to {@link MAX_SWEEP_ERRORS}. */
  errors: string[];
}

/** How many keys one page of a sweep reads rows for; see the uvsgames note. */
const SWEEP_PAGE = 1000;

/** The most failures one sweep spells out. Past this only the count grows. */
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

/**
 * The rule-gated accept over the keys a crawl just touched. Player count only:
 * an event at or above the admin's threshold is accepted, everything else waits
 * for a human. Already-accepted or dismissed rows never reach here.
 */
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

/**
 * The threshold over every row still awaiting triage, rather than over one
 * crawl's own keys. A crawl only judges what it wrote, so a threshold lowered
 * today never reaches the events already in the list; this is how those are
 * caught up.
 */
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
