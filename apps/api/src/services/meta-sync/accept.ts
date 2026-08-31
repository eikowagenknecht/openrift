import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "../../errors.js";
import type { MetaAutoAcceptRule } from "../../lib/meta-auto-accept.js";
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
  accepted: number;
  /** One line per rule match that could not be accepted, with the reason. */
  errors: string[];
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
    return { accepted: 0, errors: [] };
  }
  const settings = await deps.repos.uvsgamesEvents.settings();
  if (
    settings.autoAcceptMinPlayers === null &&
    !settings.autoAcceptNotable &&
    !settings.autoAcceptOfficial
  ) {
    return { accepted: 0, errors: [] };
  }

  // Both vocabularies are read once for the whole sweep: a crawl touches
  // thousands of keys and neither table moves while it runs.
  const [rows, watched, formatMappings] = await Promise.all([
    deps.repos.uvsgamesEvents.unacceptedByKeys([...externalIds]),
    deps.repos.uvsgamesEvents.watchedTemplates(),
    deps.repos.uvsgamesEvents.formatMappings(),
  ]);
  const errors: string[] = [];
  let accepted = 0;

  for (const row of rows) {
    const rule = autoAcceptRule(settings, {
      name: row.name,
      playerCount: row.playerCount,
      isOfficial:
        row.eventConfigurationTemplate !== null && watched.has(row.eventConfigurationTemplate),
      formatMapped: mapSourceFormat(formatMappings, row.eventFormat) !== null,
    });
    if (rule === null) {
      continue;
    }
    const outcome = await tryAutoAccept(deps, row, rule, formatMappings);
    if (outcome === null) {
      accepted++;
    } else {
      errors.push(outcome);
    }
  }

  return { accepted, errors };
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
