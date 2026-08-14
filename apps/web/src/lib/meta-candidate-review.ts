import type { MetaCandidateDeck, MetaCandidateQueueRow, MetaUploadBody } from "@openrift/shared";

// Pure helpers for the Meta Archive's candidate review queue (ADR-014): parsing
// an upload file, ordering the queue, and rendering a deck's card delta. Kept
// out of the components so they can be tested without a DOM, and because the
// React Compiler cannot lower the parser's branching inside its try/catch.

/** What a candidate's link state is called and how the badge is toned. */
export interface CandidateStateDisplay {
  label: string;
  variant: "warning" | "subtle" | "muted";
}

const STATE_DISPLAY: Record<MetaCandidateQueueRow["state"], CandidateStateDisplay> = {
  new: { label: "New", variant: "warning" },
  changed: { label: "Changed", variant: "subtle" },
  inSync: { label: "In sync", variant: "muted" },
};

/**
 * Label and badge tone for a candidate's state.
 *
 * @param state - The candidate's link state.
 * @returns The display label and the Badge variant to render it with.
 */
export function candidateStateDisplay(
  state: MetaCandidateQueueRow["state"],
): CandidateStateDisplay {
  return STATE_DISPLAY[state];
}

export type MetaUploadParseResult =
  | { ok: true; body: MetaUploadBody }
  | { ok: false; error: string };

/**
 * Parses an upload file. The file must be the whole request body — a
 * `{ provider, events }` object — because provider and events travel together
 * and guessing either from a filename would silently stage rows under the wrong
 * key.
 *
 * @param text - Raw file contents.
 * @returns The parsed body, or the reason it was rejected.
 */
export function parseMetaUploadFile(text: string): MetaUploadParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "Expected a JSON object with `provider` and `events`." };
  }
  const body = json as Partial<MetaUploadBody>;
  if (typeof body.provider !== "string" || body.provider.trim().length === 0) {
    return { ok: false, error: "Missing a non-empty `provider` string." };
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return { ok: false, error: "Missing a non-empty `events` array." };
  }
  return { ok: true, body: { provider: body.provider.trim(), events: body.events } };
}

/**
 * Orders the queue the way it is worked: anything not reviewed yet first, then
 * the most recent event date, then the name so the order never wobbles between
 * two events on the same day.
 *
 * @param rows - The queue rows.
 * @returns A new array in review order.
 */
export function sortCandidateQueue(rows: MetaCandidateQueueRow[]): MetaCandidateQueueRow[] {
  return rows.toSorted((a, b) => {
    const aChecked = a.checkedAt === null ? 0 : 1;
    const bChecked = b.checkedAt === null ? 0 : 1;
    if (aChecked !== bChecked) {
      return aChecked - bChecked;
    }
    if (a.eventDate !== b.eventDate) {
      return a.eventDate < b.eventDate ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** A candidate deck's card delta against the live deck it is linked to. */
type CardDelta = NonNullable<MetaCandidateDeck["diff"]>["cards"];

/** @returns The card's name, or a placeholder when the row vanished under us. */
function cardLabel(name: string | null): string {
  return name ?? "Unknown card";
}

/**
 * Renders a deck's card delta as one compact line per change: "+2 Vi (Main)",
 * "-1 Jinx (Sideboard)", "Ekko (Main) 3 → 2".
 *
 * @param cards - The diff's card section.
 * @param zoneLabel - Resolves a zone slug to its display label.
 * @returns One line per added, removed, and changed card, additions first.
 */
export function formatCardDeltaLines(
  cards: CardDelta,
  zoneLabel: (zone: string) => string,
): string[] {
  const lines: string[] = [];
  for (const card of cards.added) {
    lines.push(`+${card.quantity} ${cardLabel(card.name)} (${zoneLabel(card.zone)})`);
  }
  for (const card of cards.removed) {
    lines.push(`-${card.quantity} ${cardLabel(card.name)} (${zoneLabel(card.zone)})`);
  }
  for (const card of cards.changed) {
    lines.push(`${cardLabel(card.name)} (${zoneLabel(card.zone)}) ${card.from} → ${card.to}`);
  }
  return lines;
}

/**
 * Whether a linked deck's diff carries anything worth showing. A diff object
 * with no field changes and no card changes means "identical to live".
 *
 * @param diff - The deck's diff, or null while it is unlinked.
 * @returns True when the diff has at least one field or card change.
 */
export function hasDeckChanges(diff: MetaCandidateDeck["diff"]): boolean {
  if (!diff) {
    return false;
  }
  return (
    diff.fields.length > 0 ||
    diff.cards.added.length > 0 ||
    diff.cards.removed.length > 0 ||
    diff.cards.changed.length > 0
  );
}

/** One zone's worth of a candidate deck's card list. */
export interface CandidateZoneGroup {
  zone: string;
  cards: MetaCandidateDeck["cards"];
}

/**
 * Groups a candidate deck's cards by zone, configured zones in their configured
 * order first. A source can name a zone we have never heard of, so unknown ones
 * follow in the order they first appear rather than being dropped.
 *
 * @param cards - The candidate deck's card list.
 * @param zoneOrder - The configured zone slugs, in display order.
 * @returns One group per zone that has cards, cards sorted by name.
 */
export function groupCandidateCardsByZone(
  cards: MetaCandidateDeck["cards"],
  zoneOrder: string[],
): CandidateZoneGroup[] {
  const byZone = Map.groupBy(cards, (card) => card.zone);
  const known = zoneOrder.filter((zone) => byZone.has(zone));
  const unknown = [...byZone.keys()].filter((zone) => !zoneOrder.includes(zone));
  return [...known, ...unknown].map((zone) => ({
    zone,
    cards: (byZone.get(zone) ?? []).toSorted((a, b) => a.name.localeCompare(b.name)),
  }));
}

/**
 * Renders a diff value (a scalar or a list of scalars) for the diff tables.
 *
 * @param value - The stored or proposed value.
 * @returns A display string; an em-dash placeholder for null and empty lists.
 */
export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(", ") : "—";
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : "—";
  }
  return String(value);
}
