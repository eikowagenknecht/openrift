import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "../../errors.js";
import type { MetaAutoAcceptRule, MetaAutoAcceptSettings } from "../../lib/meta-auto-accept.js";
import { autoAcceptRule } from "../../lib/meta-auto-accept.js";
import {
  mapSourceFormat,
  UVSGAMES_PROVIDER,
  uvsgamesEventUrl,
  venueLocalDay,
} from "../../lib/uvsgames-catalog.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";

/**
 * Turning a catalogue row into a live event, by hand from the triage list or by
 * rule during a sync run.
 *
 * Both paths mint the live row and its citation, then promote. Everything the
 * event will ever hold comes from promotion reading this source's mirror, so
 * accept carries only what a live row cannot be created without: a name, a
 * date, and a format the archive recognises.
 */

export interface AcceptedCatalogEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

export interface MetaAutoAcceptSummary {
  /** Rows the rules were run against. */
  considered: number;
  accepted: number;
  /** Rows a rule matched that could not be accepted. */
  failed: number;
  /** One line per failure, up to {@link MAX_SWEEP_ERRORS}. */
  errors: string[];
}

/**
 * How many keys one page of a sweep reads rows for. The crawl path hands over a
 * page's worth of keys, but the backlog sweep hands over the whole triage list,
 * which is six figures of wide rows on the live catalogue.
 */
const SWEEP_PAGE = 1000;

/** The most failures one sweep spells out. Past this only the count grows. */
const MAX_SWEEP_ERRORS = 50;

function emptySummary(): MetaAutoAcceptSummary {
  return { considered: 0, accepted: 0, failed: 0, errors: [] };
}

/**
 * Accepts one catalogue row and arms its recheck queue.
 *
 * The queue is armed at `now` rather than at the event's own schedule so the
 * next processor pass picks the event up: for a tournament that finished last
 * week that is when its standings arrive, and for one running tomorrow the
 * processor immediately reschedules to the start time.
 */
export async function acceptCatalogEvent(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  options?: { format?: string; formatMappings?: ReadonlyMap<string, string> },
): Promise<AcceptedCatalogEvent> {
  const mappings = options?.formatMappings ?? (await deps.repos.uvsgamesEvents.formatMappings());
  // The source's own vocabulary is never used raw: an unmapped value would only
  // fail the archive's format check deep inside promotion, with a worse message.
  const format = options?.format ?? mapSourceFormat(mappings, row.eventFormat) ?? "";
  if (format === "") {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `No archive format matches what the source published for "${row.name}". Pick one to accept it.`,
    );
  }

  const promoted = await promoteNewEvent(deps.repos, UVSGAMES_PROVIDER, row.externalId, {
    name: row.name.slice(0, 120),
    eventDate: venueLocalDay(row.startAt, row.timezone),
    format,
    sourceUrl: uvsgamesEventUrl(row.externalId),
  });

  await deps.repos.uvsgamesEvents.setRecheck(row.externalId, {
    nextCheckAt: clock(deps),
    checkStage: 0,
  });
  return promoted;
}

interface AutoAcceptVocabulary {
  settings: MetaAutoAcceptSettings;
  /** Template ids an admin watches, for the official rule. */
  watched: ReadonlyMap<string, string | null>;
  formatMappings: ReadonlyMap<string, string>;
}

/**
 * Everything the rules read, in one go. Neither vocabulary moves while a sweep
 * runs, and a sweep over the whole triage list would otherwise re-read both
 * once per page.
 *
 * @returns Null when no rule is on, which is the common case and worth one
 * query rather than a walk over the catalogue.
 */
async function loadVocabulary(deps: MetaSyncDeps): Promise<AutoAcceptVocabulary | null> {
  const settings = await deps.repos.uvsgamesEvents.settings();
  if (
    settings.autoAcceptMinPlayers === null &&
    !settings.autoAcceptNotable &&
    !settings.autoAcceptOfficial
  ) {
    return null;
  }
  const [watched, formatMappings] = await Promise.all([
    deps.repos.uvsgamesEvents.watchedTemplates(),
    deps.repos.uvsgamesEvents.formatMappings(),
  ]);
  return { settings, watched, formatMappings };
}

async function sweep(
  deps: MetaSyncDeps,
  vocabulary: AutoAcceptVocabulary,
  externalIds: readonly string[],
): Promise<MetaAutoAcceptSummary> {
  const summary = emptySummary();
  for (let index = 0; index < externalIds.length; index += SWEEP_PAGE) {
    const page = externalIds.slice(index, index + SWEEP_PAGE);
    const rows = await deps.repos.uvsgamesEvents.unacceptedByKeys(page);
    summary.considered += rows.length;
    for (const row of rows) {
      const rule = autoAcceptRule(vocabulary.settings, {
        name: row.name,
        playerCount: row.playerCount,
        isOfficial:
          row.eventConfigurationTemplate !== null &&
          vocabulary.watched.has(row.eventConfigurationTemplate),
        formatMapped: mapSourceFormat(vocabulary.formatMappings, row.eventFormat) !== null,
      });
      if (rule === null) {
        continue;
      }
      const outcome = await tryAutoAccept(deps, row, rule, vocabulary.formatMappings);
      if (outcome === null) {
        summary.accepted++;
        continue;
      }
      summary.failed++;
      if (summary.errors.length < MAX_SWEEP_ERRORS) {
        summary.errors.push(outcome);
      }
    }
  }
  return summary;
}

/**
 * The rule-gated accept, run over the keys a crawl just touched. Rows that are
 * already accepted or dismissed never reach this — the repo read excludes both —
 * so a dismissed event stays dismissed however well it scores.
 */
export async function autoAcceptCatalogEvents(
  deps: MetaSyncDeps,
  externalIds: readonly string[],
): Promise<MetaAutoAcceptSummary> {
  if (externalIds.length === 0) {
    return emptySummary();
  }
  const vocabulary = await loadVocabulary(deps);
  if (vocabulary === null) {
    return emptySummary();
  }
  return await sweep(deps, vocabulary, externalIds);
}

/**
 * The same rules over every row still awaiting triage, rather than over one
 * crawl's own keys.
 *
 * A crawl only ever judges what it wrote, and the hash gate means an unchanged
 * row is not written at all, so a rule turned on today never reaches the events
 * already sitting in the list. This is how those are caught up. It is a job
 * rather than a request: the catalogue holds six figures of rows.
 */
export async function autoAcceptCatalogBacklog(deps: MetaSyncDeps): Promise<MetaAutoAcceptSummary> {
  const vocabulary = await loadVocabulary(deps);
  if (vocabulary === null) {
    return emptySummary();
  }
  return await sweep(deps, vocabulary, await deps.repos.uvsgamesEvents.newKeys());
}

/** @returns Null when the event went live, or the reason it did not. */
async function tryAutoAccept(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  rule: MetaAutoAcceptRule,
  formatMappings: ReadonlyMap<string, string>,
): Promise<string | null> {
  try {
    const result = await acceptCatalogEvent(deps, row, { formatMappings });
    deps.log.info(
      { externalId: row.externalId, rule, metaEventId: result.metaEventId },
      "Auto-accepted catalogue event",
    );
    return null;
  } catch (error) {
    // One event failing to accept — a slug that cannot be freed, a format the
    // reference table lost — must not stop the sweep over the rest of the page.
    return errorText(error, `Auto-accept "${row.name}" (${row.externalId})`);
  }
}
