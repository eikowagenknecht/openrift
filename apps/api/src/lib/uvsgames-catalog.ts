// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

/**
 * Reading the official source's event listing into the slim projection
 * `uvsgames_events` stores (ADR-014). The source publishes no schema and
 * changes shape without notice, so every field is probed defensively and a row
 * that carries no id, name, or start time is dropped rather than guessed at.
 */

/** The one catalogued source. A second one needs its own crawl scheduler first. */
export const UVSGAMES_PROVIDER = "uvsgames";

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

/** Whether an event name carries one of {@link NOTABLE_EVENT_NAMES}. */
export function isNotableEventName(name: string): boolean {
  const haystack = name.toLowerCase();
  return NOTABLE_EVENT_NAMES.some((needle) => haystack.includes(needle));
}

/**
 * The lookup key both sides of a format mapping are compared on, so
 * "Constructed", "CONSTRUCTED" and "Standard Constructed" cannot each need
 * their own stored row.
 */
export function normalizeFormatKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "");
}

/**
 * Resolves one of the source's format strings against the admin-curated
 * mappings, which the caller loads once per run or request.
 *
 * @returns The `deck_formats` slug, or null when nothing maps it — an event the
 * archive is never allowed to file automatically.
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
  /** The store's own id, which the upsert normalizes into `uvsgames_stores`. */
  storeId: number | null;
  /** Kept as the fallback for a row whose store the source did not key. */
  storeName: string | null;
  location: string | null;
  timezone: string | null;
  /** The source's template uuid, curated in `uvsgames_event_templates`. */
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

/** The source's own integer keys, which arrive as numbers and must stay whole. */
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
 * The store an event is held at. The source has moved this between a nested
 * object and a flat field, so both shapes are read; only the nested one carries
 * the id, and the flat fields are null on every row the listing serves today.
 */
function store(row: Record<string, unknown>): { id: number | null; name: string | null } {
  const nested = record(row.store);
  return {
    id: sourceId(nested?.id),
    name: text(nested?.name) ?? text(row.store_name) ?? text(row.organizer_name),
  };
}

/**
 * Stable over the projection's own field order, so a source that reorders its
 * JSON keys never reads as a change. Truncated: 32 hex characters is 128 bits
 * of a SHA-256, which is far past collision territory for a quarter-million
 * rows and keeps the column small.
 */
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
    // The live column CHECKs 1..120 and the candidate the same, so a source
    // name past that is truncated here rather than failing every ingest.
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

/** The column's CHECK, so a source that publishes an essay is stored, not refused. */
const MAX_TEMPLATE_NAME = 200;

/**
 * The template endpoint answers with a bare array rather than the listing's
 * page envelope, and its rows carry far more than a name (the scheduling,
 * registration and structure policies each template applies). Only the id and
 * the name are projected; the policies describe how the source runs an event,
 * which the archive has no use for.
 *
 * @returns Every readable entry, in the order the source returned them.
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
 * The venue-local calendar day of an instant, which is what `meta_events`
 * stores. Taking the UTC day instead files an evening event in the Americas
 * under the next day. An unusable zone falls back to UTC rather than throwing:
 * the source omits it for online events, and a day that is off by one beats no
 * event at all.
 */
export function venueLocalDay(startAt: Date, timezone: string | null): string {
  if (timezone !== null) {
    try {
      return formatInZone(startAt, timezone);
    } catch {
      // Unknown or malformed zone; UTC below.
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
