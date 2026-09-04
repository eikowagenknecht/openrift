// oxlint-disable-next-line import/no-nodejs-modules -- server-side hashing, never reaches the browser
import { createHash } from "node:crypto";

import { inferZone, WellKnown } from "@openrift/shared";
import type { DeckZone } from "@openrift/shared";

import { countryFromAddress } from "./meta-event-classify.js";

/**
 * Reading topdeck.gg's tournament search into the shapes `topdeck_*` stores.
 * One body carries the tournament, its standings and every submitted list, so
 * unlike the other two sources there is nothing here to queue.
 */

/** The third catalogued source. */
export const TOPDECK_PROVIDER = "topdeck";

/** The source's own page for a tournament, which becomes the citation's URL. */
export function topdeckEventUrl(tid: string): string {
  return `https://topdeck.gg/event/${tid}`;
}

/** The game the source files Riftbound under, the required half of every search. */
export const TOPDECK_GAME = "Riftbound";

/** Anything but the source's constructed word skips deck validation: a sealed list is not a constructed deck. */
export function topdeckFormat(sourceFormat: string): string {
  return sourceFormat.toLowerCase() === "constructed"
    ? WellKnown.deckFormat.CONSTRUCTED
    : WellKnown.deckFormat.FREEFORM;
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

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function coord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The source's `startDate`, unix seconds. */
function instant(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MS_PER_HOUR = 3_600_000;
const DEGREES_PER_HOUR = 15;

/**
 * No timezone in the source, so longitude stands in for it. Never off by
 * enough to move the day: no sampled event starts within 3h of local midnight.
 */
export function topdeckLocalDay(startAt: Date, longitude: number | null): string {
  if (longitude === null) {
    return startAt.toISOString().slice(0, 10);
  }
  const offsetHours = Math.round(longitude / DEGREES_PER_HOUR);
  return new Date(startAt.getTime() + offsetHours * MS_PER_HOUR).toISOString().slice(0, 10);
}

/** The columns `topdeck_events` keeps, minus the crawl bookkeeping the repo owns. */
export interface TopdeckEventProjection {
  tid: string;
  name: string;
  format: string;
  startAt: Date;
  swissRounds: number | null;
  topCut: number | null;
  playerCount: number | null;
  isTeamEvent: boolean;
  teamSize: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
}

/** Stable over the projection's own field order, so reordered JSON is not a change. */
export function topdeckContentHash(fields: Omit<TopdeckEventProjection, "contentHash">): string {
  const parts = [
    fields.name,
    fields.format,
    String(fields.startAt.getTime()),
    fields.swissRounds === null ? "" : String(fields.swissRounds),
    fields.topCut === null ? "" : String(fields.topCut),
    fields.playerCount === null ? "" : String(fields.playerCount),
    String(fields.isTeamEvent),
    fields.teamSize === null ? "" : String(fields.teamSize),
    fields.city ?? "",
    fields.state ?? "",
    fields.country ?? "",
    fields.address ?? "",
    fields.longitude === null ? "" : String(fields.longitude),
    fields.latitude === null ? "" : String(fields.latitude),
  ];
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

const MAX_EVENT_NAME = 120;
const MAX_PLAYER_NAME = 80;
const MAX_ADDRESS = 500;

/** One standings row as `topdeck_event_standings` stores it. */
export interface TopdeckStandingProjection {
  playerKey: string;
  sourcePlayerId: string | null;
  playerName: string;
  rank: number;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendName: string | null;
  /** Null when the player submitted no list. */
  sourceDeckId: string | null;
  /** The `deckObj` sections, kept raw until the card bridge is loaded. */
  deckSections: Record<string, unknown> | null;
}

/** One card line of a decklist, in the zone vocabulary the mirror stores. */
export interface TopdeckDeckLine {
  lineNumber: number;
  zone: DeckZone;
  quantity: number;
  cardName: string;
}

/** A whole tournament as the mirror keeps it. */
export interface TopdeckTournamentProjection {
  event: TopdeckEventProjection;
  standings: TopdeckStandingProjection[];
}

/** The deck key, since the source publishes the list inline and names no id. */
export function topdeckDeckId(tid: string, playerKey: string): string {
  return `${tid}:${playerKey}`;
}

function playerKeyOf(
  sourcePlayerId: string | null,
  playerName: string,
  seenNames: Map<string, number>,
): string {
  if (sourcePlayerId !== null) {
    return `u${sourcePlayerId}`;
  }
  const occurrence = (seenNames.get(playerName) ?? 0) + 1;
  seenNames.set(playerName, occurrence);
  return `n${playerName}#${occurrence}`;
}

function projectStandings(raw: unknown, tid: string): TopdeckStandingProjection[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seenNames = new Map<string, number>();
  const rows: TopdeckStandingProjection[] = [];
  for (const entry of raw) {
    const row = record(entry);
    const playerName = row === null ? null : text(row.name);
    if (row === null || playerName === null) {
      continue;
    }
    const sourcePlayerId = text(row.id);
    const trimmedName = playerName.slice(0, MAX_PLAYER_NAME);
    const playerKey = playerKeyOf(sourcePlayerId, trimmedName, seenNames);
    const deckSections = record(row.deckObj);
    rows.push({
      playerKey,
      sourcePlayerId,
      playerName: trimmedName,
      // The payload orders the field by finish, so the position is the standing.
      rank: rows.length + 1,
      wins: count(row.wins),
      losses: count(row.losses),
      draws: count(row.draws),
      legendName: text(row.leader),
      sourceDeckId: deckSections === null ? null : topdeckDeckId(tid, playerKey),
      deckSections,
    });
  }
  return rows;
}

/** Null when the tournament carries no usable id, name, start or format. */
export function projectTournament(raw: unknown): TopdeckTournamentProjection | null {
  const row = record(raw);
  if (row === null) {
    return null;
  }
  const tid = text(row.TID);
  const name = text(row.tournamentName);
  const startAt = instant(row.startDate);
  const format = text(row.format);
  if (tid === null || name === null || startAt === null || format === null) {
    return null;
  }
  const standings = projectStandings(row.standings, tid);
  const eventData = record(row.eventData) ?? {};
  const address = text(eventData.address);
  const fields = {
    tid,
    name: name.slice(0, MAX_EVENT_NAME),
    format,
    startAt,
    swissRounds: count(row.swissNum),
    topCut: count(row.topCut),
    playerCount: standings.length,
    isTeamEvent: row.isTeamEvent === true,
    teamSize: count(row.teamSize),
    city: text(eventData.city),
    state: text(eventData.state),
    // The source names the country in full where it names one at all, so both
    // it and the address go through the same trailing-name reader.
    country: countryFromAddress(text(eventData.country)) ?? countryFromAddress(address),
    address: address === null ? null : address.slice(0, MAX_ADDRESS),
    longitude: coord(eventData.lng),
    latitude: coord(eventData.lat),
  };
  return { event: { ...fields, contentHash: topdeckContentHash(fields) }, standings };
}

/** The source names the zone outright; anything unlisted is main deck. */
const ZONE_BY_SECTION: ReadonlyMap<string, DeckZone> = new Map([
  ["legend", WellKnown.deckZone.LEGEND],
  ["champion", WellKnown.deckZone.CHAMPION],
  ["runes", WellKnown.deckZone.RUNES],
  ["rune pool", WellKnown.deckZone.RUNES],
  ["battlefields", WellKnown.deckZone.BATTLEFIELD],
  ["sideboard", WellKnown.deckZone.SIDEBOARD],
]);

/** `deckObj` carries the list's own provenance under this heading, not cards. */
const METADATA_SECTION = "metadata";

/** The `id` a card entry carries when the list was built against a printing. */
const SHORT_CODE = /^[A-Z]{2,4}-\d{1,4}[a-z]?$/u;

/** Every `short_code` a set of decks names, for one bridge query per pass. */
export function referencedShortCodes(standings: readonly TopdeckStandingProjection[]): string[] {
  const codes = new Set<string>();
  for (const standing of standings) {
    for (const [section, cards] of Object.entries(standing.deckSections ?? {})) {
      const entries = section === METADATA_SECTION ? null : record(cards);
      for (const meta of Object.values(entries ?? {})) {
        const id = text(record(meta)?.id);
        if (id !== null && SHORT_CODE.test(id)) {
          codes.add(id);
        }
      }
    }
  }
  return [...codes];
}

/**
 * A resolved `short_code` supplies our catalogue's spelling; an unresolved
 * entry keeps the source's own spelling for promotion to match.
 */
export function projectTopdeckDeckLines(
  sections: Record<string, unknown>,
  bridge: ReadonlyMap<string, { cardId: string; name: string; type: string }>,
): TopdeckDeckLine[] {
  const lines: TopdeckDeckLine[] = [];
  for (const [section, cards] of Object.entries(sections)) {
    if (section === METADATA_SECTION) {
      continue;
    }
    const entries = record(cards);
    if (entries === null) {
      continue;
    }
    const sectionZone = ZONE_BY_SECTION.get(section.toLowerCase());
    for (const [cardName, meta] of Object.entries(entries)) {
      const quantity = count(record(meta)?.count);
      const name = text(cardName);
      if (quantity === null || quantity === 0 || name === null) {
        continue;
      }
      const shortCode = text(record(meta)?.id);
      const resolved = shortCode === null ? undefined : bridge.get(shortCode);
      lines.push({
        lineNumber: lines.length,
        zone:
          sectionZone ??
          (resolved ? inferZone([resolved.type], [], "mainDeck") : WellKnown.deckZone.MAIN),
        quantity,
        cardName: resolved?.name ?? name,
      });
    }
  }
  return lines;
}

/** The legend a deck's lines imply, for the standings row's own column. */
export function legendFromTopdeckLines(lines: readonly TopdeckDeckLine[]): string | null {
  return lines.find((line) => line.zone === WellKnown.deckZone.LEGEND)?.cardName ?? null;
}
