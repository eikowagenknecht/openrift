import { ERROR_CODES } from "@openrift/shared";

import { AppError } from "../../errors.js";
import type { MetaAutoAcceptRule } from "../../lib/meta-auto-accept.js";
import { autoAcceptRule } from "../../lib/meta-auto-accept.js";
import { classifyMetaEventTier, countryFromAddress } from "../../lib/meta-event-classify.js";
import {
  mapSourceFormat,
  UVSGAMES_PROVIDER,
  uvsgamesEventUrl,
  venueLocalDay,
} from "../../lib/uvsgames-catalog.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { acceptCandidateEvent, acceptCandidatePlayer } from "../meta-candidate-accept.js";
import type { MetaSyncDeps } from "./deps.js";
import { clock, errorText } from "./deps.js";

/**
 * Turning a catalogue row into a live event, by hand from the triage list or by
 * rule during a sync run.
 *
 * Both paths go through the existing accept: the catalogue row only supplies the
 * candidate that accept needs, so linking, citations, and the per-field review
 * downstream all behave exactly as they do for a pushed candidate.
 */

export interface AcceptedCatalogEvent {
  metaEventId: string;
  slug: string;
  candidateEventId: string;
  created: boolean;
}

export interface MetaAutoAcceptSummary {
  accepted: number;
  /** One line per rule match that could not be accepted, with the reason. */
  errors: string[];
}

/**
 * The candidate the accept path operates on. An event the archive has never
 * seen gets a shell built from the catalogue projection; one a deep fetch
 * already staged is used as it stands, because that row carries the full
 * standings and this must not replace them with a header.
 */
async function ensureCandidate(
  deps: MetaSyncDeps,
  row: UvsgamesListRow,
  format: string,
): Promise<string> {
  const [existing] = await deps.repos.metaCandidates.eventsBySourceKeys(UVSGAMES_PROVIDER, [
    row.externalId,
  ]);
  if (existing !== undefined) {
    if (existing.format !== format) {
      await deps.repos.metaCandidates.updateEvent(existing.id, { format });
    }
    return existing.id;
  }
  const templateTiers = await deps.repos.uvsgamesEvents.templateTiers();
  const playerCount = row.playerCount === null || row.playerCount === 0 ? null : row.playerCount;
  const location = row.location === null ? null : row.location.trim().slice(0, 500) || null;
  return await deps.repos.metaCandidates.insertEvent({
    provider: UVSGAMES_PROVIDER,
    externalId: row.externalId,
    name: row.name.slice(0, 120),
    eventDate: venueLocalDay(row.startAt, row.timezone),
    format,
    playerCount,
    organizer: row.storeDisplayName === null ? null : row.storeDisplayName.slice(0, 120),
    sourceUrl: uvsgamesEventUrl(row.externalId),
    notes: null,
    tier: classifyMetaEventTier({
      templateTier:
        row.eventConfigurationTemplate === null
          ? null
          : (templateTiers.get(row.eventConfigurationTemplate) ?? null),
      playerCount,
    }),
    country: countryFromAddress(location),
    location,
    metaEventId: null,
    extraData: null,
  });
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
  // fail the archive's format check deep inside accept, with a worse message.
  const format = options?.format ?? mapSourceFormat(mappings, row.eventFormat) ?? "";
  if (format === "") {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      `No archive format matches what the source published for "${row.name}". Pick one to accept it.`,
    );
  }

  const candidateEventId = await ensureCandidate(deps, row, format);
  const accepted = await acceptCandidateEvent(deps.repos, candidateEventId);
  await deps.repos.uvsgamesEvents.setRecheck(row.externalId, {
    nextCheckAt: clock(deps),
    checkStage: 0,
  });
  return { ...accepted, candidateEventId };
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

export interface MetaPlayerAcceptSummary {
  accepted: number;
  skipped: number;
  errors: string[];
}

/**
 * Files the standings a deep fetch just staged, for an event whose data the
 * archive takes wholesale.
 *
 * Two guards. An event fed by a second source is left to the human queue, since
 * taking everything from one source there silently reverts the other's curated
 * values. And a player whose list carries a name that matched no card is skipped:
 * standings are the source's own published result and safe to file unreviewed,
 * but a decklist with a hole in it is not.
 */
export async function autoAcceptFetchedPlayers(
  deps: MetaSyncDeps,
  candidateEventId: string,
  metaEventId: string,
): Promise<MetaPlayerAcceptSummary> {
  const linked = await deps.repos.metaCandidates.eventsByMetaEventId(metaEventId);
  if (linked.some((row) => row.id !== candidateEventId)) {
    return { accepted: 0, skipped: 0, errors: [] };
  }

  const players = await deps.repos.metaCandidates.playersByCandidateEventIds([candidateEventId]);
  const summary: MetaPlayerAcceptSummary = { accepted: 0, skipped: 0, errors: [] };

  for (const player of players) {
    const unresolved = (player.cards ?? []).some((card) => card.cardId === null);
    if (unresolved) {
      summary.skipped++;
      continue;
    }
    const outcome = await tryAcceptPlayer(deps, player.id, player.playerName);
    if (outcome === null) {
      summary.accepted++;
    } else {
      summary.skipped++;
      summary.errors.push(outcome);
    }
  }

  return summary;
}

async function tryAcceptPlayer(
  deps: MetaSyncDeps,
  candidatePlayerId: string,
  playerName: string,
): Promise<string | null> {
  try {
    // A legend the matcher does not know still leaves a real standings row —
    // who played and how they finished — which is the whole point of the
    // pyramid. The gap shows up as a legend-less row, not as a missing player.
    await acceptCandidatePlayer(deps.repos, candidatePlayerId, {
      allowUnresolvedLegend: true,
      // The deep fetch materializes matches once after the whole field.
      skipMatchMaterialization: true,
    });
    return null;
  } catch (error) {
    return errorText(error, `Accept "${playerName}"`);
  }
}
