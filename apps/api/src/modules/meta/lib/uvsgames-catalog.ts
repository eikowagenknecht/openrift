// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { normalizeFormatKey } from "../../../lib/meta-providers.js";

/**
 * Reads the official source's event listing into `uvsgames_events`. The
 * source publishes no schema and changes shape without notice; every field
 * is probed defensively. A row missing id, name, or start time is dropped.
 */

/** The source's own page for an event, which becomes the citation's URL. */
export function uvsgamesEventUrl(externalId: string): string {
  return `https://locator.riftbound.uvsgames.com/events/${externalId}`;
}

/**
 * The vocabulary the notable-name auto-accept rule matches on. Lowercase,
 * because the comparison is case-insensitive.
 */
const NOTABLE_EVENT_NAMES = [
  "regional",
  "qualifier",
  "championship",
  "invitational",
  "nationals",
  "worlds",
  "circuit",
] as const;

export function isNotableEventName(name: string): boolean {
  const haystack = name.toLowerCase();
  return NOTABLE_EVENT_NAMES.some((needle) => haystack.includes(needle));
}

/**
 * Resolves one of the source's format strings against the admin-curated
 * mappings, which the caller loads once per run or request. Returns null when
 * nothing maps it, an event the archive is never allowed to file automatically.
 */
export function mapSourceFormat(
  mappings: ReadonlyMap<string, string>,
  eventFormat: string | null,
): string | null {
  if (eventFormat === null || eventFormat.trim() === "") {
    return null;
  }
  return mappings.get(normalizeFormatKey(eventFormat)) ?? null;
}

/**
 * The columns `uvsgames_events` keeps, minus the crawl bookkeeping the repo
 * owns. {@link contentHash} covers exactly these fields, so an unchanged listing
 * row costs one `last_seen_at` write.
 */
export interface UvsgamesCatalogProjection {
  externalId: string;
  name: string;
  startAt: Date;
  endAtEstimate: Date | null;
  displayStatus: string;
  decklistStatus: string | null;
  playerCount: number | null;
  eventType: string | null;
  eventFormat: string | null;
  storeId: number | null;
  storeName: string | null;
  location: string | null;
  timezone: string | null;
  eventConfigurationTemplate: string | null;
  contentHash: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function sourceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return null;
}

function count(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

function instant(value: unknown): Date | null {
  const raw = text(value);
  if (raw === null) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The source has moved this between a nested object and a flat field; both
 * shapes are read, but only the nested one carries the id.
 */
function store(row: Record<string, unknown>): { id: number | null; name: string | null } {
  const nested = record(row.store);
  return {
    id: sourceId(nested?.id),
    name: text(nested?.name) ?? text(row.store_name) ?? text(row.organizer_name),
  };
}

export function catalogContentHash(fields: Omit<UvsgamesCatalogProjection, "contentHash">): string {
  const parts = [
    fields.name,
    fields.startAt.toISOString(),
    fields.endAtEstimate?.toISOString() ?? "",
    fields.displayStatus,
    fields.decklistStatus ?? "",
    fields.playerCount === null ? "" : String(fields.playerCount),
    fields.eventType ?? "",
    fields.eventFormat ?? "",
    fields.storeName ?? "",
    fields.location ?? "",
    fields.timezone ?? "",
    fields.eventConfigurationTemplate ?? "",
    fields.storeId === null ? "" : String(fields.storeId),
  ];
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

/**
 * One listing row as the slim projection, or null when the row carries no
 * usable identity. A dropped row is reported by the crawl, never guessed at:
 * the alternative is a catalogue entry keyed on a value the source never
 * published.
 */
export function projectCatalogRow(raw: unknown): UvsgamesCatalogProjection | null {
  const row = record(raw);
  if (row === null) {
    return null;
  }
  const externalId = text(row.id);
  const name = text(row.name);
  const startAt = instant(row.start_datetime);
  const displayStatus = text(row.display_status);
  if (externalId === null || name === null || startAt === null || displayStatus === null) {
    return null;
  }

  const settings = record(row.settings);
  const venue = store(row);
  const fields = {
    externalId,
    // The live column and the candidate both CHECK the name length at 120.
    name: name.slice(0, 120),
    startAt,
    endAtEstimate: instant(row.heuristic_end_datetime),
    displayStatus,
    decklistStatus: text(settings?.decklist_status),
    playerCount: count(row.starting_player_count),
    eventType: text(row.event_type),
    // The flat `event_format` is a different, junk-valued field ("OTHER" or
    // empty); the format vocabulary lives in `gameplay_format` alone.
    eventFormat: text(record(row.gameplay_format)?.name),
    storeId: venue.id,
    storeName: venue.name,
    location: text(row.full_address),
    timezone: text(row.timezone),
    eventConfigurationTemplate: text(row.event_configuration_template),
  };
  return { ...fields, contentHash: catalogContentHash(fields) };
}

/** One entry of the source's published template vocabulary. */
export interface UvsgamesTemplateProjection {
  templateId: string;
  sourceName: string;
}

const MAX_TEMPLATE_NAME = 200;

/**
 * The template endpoint returns a bare array, not the listing's page
 * envelope. Rows carry far more than a name; only id and name are projected.
 */
export function projectTemplateRows(body: unknown): UvsgamesTemplateProjection[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const templates: UvsgamesTemplateProjection[] = [];
  for (const raw of body) {
    const row = record(raw);
    const templateId = text(row?.id);
    const sourceName = text(row?.name);
    if (templateId !== null && sourceName !== null) {
      templates.push({ templateId, sourceName: sourceName.slice(0, MAX_TEMPLATE_NAME) });
    }
  }
  return templates;
}

/**
 * The UTC day would file an evening Americas event under the next day.
 * Falls back to UTC when the zone is unusable; the source omits it for online events.
 */
export function venueLocalDay(startAt: Date, timezone: string | null): string {
  if (timezone !== null) {
    try {
      return formatInZone(startAt, timezone);
    } catch {
      // empty
    }
  }
  return startAt.toISOString().slice(0, 10);
}

function formatInZone(startAt: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(startAt);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get("year")}-${lookup.get("month")}-${lookup.get("day")}`;
}
