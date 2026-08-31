// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

/**
 * Reading the Chinese app's shop, event and deck payloads into the slim shapes
 * `playloltcg_*` stores (ADR-014, second source). The source publishes no schema
 * and its lists nest differently per endpoint, so every field is probed
 * defensively and a row with no usable id or name is dropped rather than guessed.
 */

/** The second catalogued source. */
export const PLAYLOLTCG_PROVIDER = "playloltcg";

/** The source's own page for an event, which becomes the citation's URL. */
export function playloltcgEventUrl(activityShopId: number): string {
  return `https://playloltcg.com/activity/${activityShopId}`;
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

function coord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The day part of a source timestamp, in the `YYYY-MM-DD` shape the `date`
 * columns store and hand back. The source publishes no time of day.
 */
function day(value: unknown): string | null {
  const raw = text(value);
  if (raw === null || !/^\d{4}-\d{2}-\d{2}/u.test(raw)) {
    return null;
  }
  const iso = raw.slice(0, 10);
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
}

/**
 * The source's `cardNo` as the key our SC printings are matched on. The source
 * is inconsistent — `SFD·195/221`, `UNL-145a/219`, `VEN·038` all occur in one
 * deck — so both separators are folded and the `/total` suffix is dropped,
 * leaving the set-number-variant that equals our `short_code` (`SFD-195`,
 * `UNL-145a`, `VEN-038`). Verified against the live deck feed 2026-08-30.
 *
 * @returns The `short_code` key, or null when the value carries no code.
 */
export function normalizeCardNo(cardNo: unknown): string | null {
  const raw = text(cardNo);
  if (raw === null) {
    return null;
  }
  const [head = ""] = raw.replaceAll("·", "-").split("/");
  const key = head.trim();
  return key === "" ? null : key;
}

/** A shop from the registry, as `playloltcg_shops` stores it. */
export interface PlayloltcgShopProjection {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
}

/**
 * One `searchShop` row, or null when it carries no id or name.
 *
 * @param raw - A shop object from the registry.
 * @returns The projection, or null.
 */
export function projectShopRow(raw: unknown): PlayloltcgShopProjection | null {
  const row = record(raw);
  if (row === null) {
    return null;
  }
  const id = sourceId(row.id);
  const name = text(row.name);
  if (id === null || name === null) {
    return null;
  }
  return {
    id,
    name: name.slice(0, 200),
    province: text(row.province),
    city: text(row.city),
    area: text(row.area),
    address: text(row.address),
    longitude: coord(row.longitude),
    latitude: coord(row.latitude),
  };
}

/**
 * The source's `sortWeight` lifecycle, sent as an integer or as a string of one:
 * 1 registration-open, 2 fully-booked, 3 scheduled, then the two the recheck
 * ladder reads by name.
 */
const PLAYLOLTCG_STATUS_REGISTRATION_OPEN = 1;
export const PLAYLOLTCG_STATUS_IN_PROGRESS = 4;
export const PLAYLOLTCG_STATUS_FINISHED = 5;

/** The `sortWeight` lifecycle as a bounded value, or null when it is out of range. */
function status(value: unknown): number | null {
  let n = Number.NaN;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    n = Number(value);
  }
  const inRange = n >= PLAYLOLTCG_STATUS_REGISTRATION_OPEN && n <= PLAYLOLTCG_STATUS_FINISHED;
  return Number.isInteger(n) && inRange ? n : null;
}

/**
 * The columns `playloltcg_events` keeps, minus `shopId` (the repo resolves that
 * by name against the registry) and the crawl bookkeeping the repo owns.
 */
export interface PlayloltcgEventProjection {
  activityShopId: number;
  shopName: string | null;
  name: string;
  activityType: string | null;
  activityTypeName: string | null;
  battleMode: string | null;
  status: number | null;
  /** `YYYY-MM-DD`, matching the `date` column; the source publishes no time. */
  startAt: string | null;
  endAt: string | null;
  playerCount: number | null;
  maxUser: number | null;
  fee: number | null;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
}

/**
 * Stable over the projection's own field order, so a source that reorders its
 * JSON keys never reads as a change.
 */
export function playloltcgContentHash(
  fields: Omit<PlayloltcgEventProjection, "contentHash">,
): string {
  const parts = [
    fields.name,
    fields.shopName ?? "",
    fields.activityType ?? "",
    fields.activityTypeName ?? "",
    fields.battleMode ?? "",
    fields.status === null ? "" : String(fields.status),
    fields.startAt ?? "",
    fields.endAt ?? "",
    fields.playerCount === null ? "" : String(fields.playerCount),
    fields.maxUser === null ? "" : String(fields.maxUser),
    fields.fee === null ? "" : String(fields.fee),
    fields.province ?? "",
    fields.city ?? "",
    fields.area ?? "",
    fields.address ?? "",
    fields.longitude === null ? "" : String(fields.longitude),
    fields.latitude === null ? "" : String(fields.latitude),
  ];
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

/**
 * One `activityShop/page` row as the slim projection, or null when it carries no
 * usable id or name. The venue is the event's own address, which the source
 * repeats per row; the store link is resolved from {@link shopName} by the repo.
 *
 * @param raw - An event object from the date-window listing.
 * @returns The projection, or null.
 */
export function projectEventRow(raw: unknown): PlayloltcgEventProjection | null {
  const row = record(raw);
  if (row === null) {
    return null;
  }
  const activityShopId = sourceId(row.activityShopId);
  const name = text(row.name);
  if (activityShopId === null || name === null) {
    return null;
  }
  const fields = {
    activityShopId,
    shopName: text(row.shopName),
    name: name.slice(0, 120),
    activityType: text(row.activityType),
    activityTypeName: text(row.activityTypeName),
    battleMode: text(row.battleMode),
    status: status(row.sortWeight),
    startAt: day(row.startTime),
    endAt: day(row.endTime),
    playerCount: count(row.applyNum),
    maxUser: count(row.maxUser),
    fee: count(row.applyAmount),
    province: text(row.activityProvince) ?? text(row.shopProvince),
    city: text(row.activityCity) ?? text(row.shopCity),
    area: text(row.activityArea) ?? text(row.shopArea),
    address: text(row.activityAddress) ?? text(row.address),
    longitude: coord(row.longitude),
    latitude: coord(row.latitude),
  };
  return { ...fields, contentHash: playloltcgContentHash(fields) };
}

/** One card row from a deck body, resolved enough to stage. */
export interface PlayloltcgDeckCard {
  /** The source's raw `cardNo`, kept for the citation and for debugging a miss. */
  cardNo: string;
  /** The `short_code` key {@link normalizeCardNo} produced, for SC resolution. */
  shortCode: string | null;
  cardName: string | null;
  hero: string | null;
  cardCount: number;
  /** The legend is the row whose categories include `legendary` (传奇). */
  isLegend: boolean;
  /** The champion unit, distinct from the legend. */
  isMainHero: boolean;
}

function categories(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * One `getActivityCardGroupCardListImage` card row.
 *
 * @param raw - A card object from a deck body.
 * @returns The card, or null when it carries no code.
 */
export function projectDeckCard(raw: unknown): PlayloltcgDeckCard | null {
  const row = record(raw);
  if (row === null) {
    return null;
  }
  const cardNo = text(row.cardNo);
  if (cardNo === null) {
    return null;
  }
  return {
    cardNo,
    shortCode: normalizeCardNo(cardNo),
    cardName: text(row.cardName),
    hero: text(row.hero),
    cardCount: count(row.cardCount) ?? 1,
    isLegend: categories(row.cardCategoryList).includes("legendary"),
    isMainHero: row.isMainHero === true,
  };
}

/** The `cardGroupId`s a standings table points at, as the mirror keys its decks. */
export function referencedDeckIds(standings: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const row of standings) {
    const id = sourceId(record(row)?.cardGroupId);
    if (id !== null) {
      ids.add(String(id));
    }
  }
  return [...ids];
}
