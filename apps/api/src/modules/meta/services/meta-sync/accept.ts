import { ERROR_CODES } from "@openrift/shared/error-codes";

import { AppError } from "../../../../errors.js";
import { UVSGAMES_PROVIDER } from "../../../../lib/meta-providers.js";
import type { MetaAutoAcceptRule, MetaAutoAcceptSettings } from "../../lib/meta-auto-accept.js";
import { autoAcceptRule } from "../../lib/meta-auto-accept.js";
import { mapSourceFormat, uvsgamesEventUrl, venueLocalDay } from "../../lib/uvsgames-catalog.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { promoteNewEvent } from "../meta-promote.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";

export interface AcceptedCatalogEvent {
  metaEventId: string;
  slug: string;
  created: boolean;
}

export interface MetaAutoAcceptSummary {
  considered: number;
  accepted: number;
  failed: number;
  errors: string[];
}

const SWEEP_PAGE = 1000;

const MAX_SWEEP_ERRORS = 50;

function emptySummary(): MetaAutoAcceptSummary {
  return { considered: 0, accepted: 0, failed: 0, errors: [] };
}

// Recheck is armed at `now`, not the event's own schedule, so the next
// processor pass reschedules it correctly either way.
export async function acceptCatalogEvent(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  options?: { format?: string; formatMappings?: ReadonlyMap<string, string> },
): Promise<AcceptedCatalogEvent> {
  const mappings = options?.formatMappings ?? (await deps.repos.uvsgamesEvents.formatMappings());
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
  watched: ReadonlyMap<string, string | null>;
  formatMappings: ReadonlyMap<string, string>;
}

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

// The repo read already excludes accepted and dismissed rows, so a dismissed
// event stays dismissed however well it scores against the rules.
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

// A crawl only judges the keys it wrote, and the hash gate skips unchanged
// rows, so a rule turned on today never reaches events already in the list.
export async function autoAcceptCatalogBacklog(deps: MetaSyncDeps): Promise<MetaAutoAcceptSummary> {
  const vocabulary = await loadVocabulary(deps);
  if (vocabulary === null) {
    return emptySummary();
  }
  return await sweep(deps, vocabulary, await deps.repos.uvsgamesEvents.newKeys());
}

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
    // One row failing to accept must not stop the sweep over the rest of the page.
    return errorText(error, `Auto-accept "${row.name}" (${row.externalId})`);
  }
}
