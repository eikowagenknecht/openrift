import type { MetaEventFieldEdits } from "@openrift/shared/types/api/meta";

/**
 * An unchanged box and an emptied box both propose nothing: clearing a value
 * is not expressible here, only replacing it.
 */
export interface MetaEventCorrectionDraft {
  name: string;
  eventDate: string;
  format: string;
  playerCount: string;
  organizer: string;
  location: string;
  country: string;
  note: string;
}

export interface MetaEventCorrectionSubject {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  location: string | null;
  country: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const WHOLE_NUMBER_PATTERN = /^\d+$/u;
const COUNTRY_PATTERN = /^[A-Za-z]{2}$/u;

/** Mirrors the contract's own ceiling. */
const MAX_PLAYER_COUNT = 1_000_000;

export function metaEventCorrectionDraft(
  event: MetaEventCorrectionSubject,
): MetaEventCorrectionDraft {
  return {
    name: event.name,
    eventDate: event.eventDate,
    format: event.format,
    playerCount: event.playerCount === null ? "" : String(event.playerCount),
    organizer: event.organizer ?? "",
    location: event.location ?? "",
    country: event.country ?? "",
    note: "",
  };
}

function value(box: string): string | null {
  const trimmed = box.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function changed(box: string, current: string | null): boolean {
  const next = value(box);
  return next !== null && next !== current;
}

/** A draft that changes nothing produces an empty object, not an error. */
export function metaEventCorrectionEdits(
  draft: MetaEventCorrectionDraft,
  event: MetaEventCorrectionSubject,
): MetaEventFieldEdits {
  const edits: MetaEventFieldEdits = {};
  if (changed(draft.name, event.name)) {
    edits.name = draft.name.trim();
  }
  if (changed(draft.eventDate, event.eventDate)) {
    edits.eventDate = draft.eventDate.trim();
  }
  if (changed(draft.format, event.format)) {
    edits.format = draft.format.trim();
  }
  const players = value(draft.playerCount);
  if (players !== null && Number(players) !== event.playerCount) {
    edits.playerCount = Number(players);
  }
  if (changed(draft.organizer, event.organizer)) {
    edits.organizer = draft.organizer.trim();
  }
  if (changed(draft.location, event.location)) {
    edits.location = draft.location.trim();
  }
  if (changed(draft.country, event.country)) {
    edits.country = draft.country.trim().toUpperCase();
  }
  return edits;
}

/** Bounds mirror the contract's own limits. */
export function validateMetaEventCorrectionDraft(
  draft: MetaEventCorrectionDraft,
  event: MetaEventCorrectionSubject,
): string | null {
  const edits = metaEventCorrectionEdits(draft, event);
  const note = draft.note.trim();
  if (note.length === 0) {
    return "Tell us what's wrong, and where you saw the right version.";
  }
  if (note.length > 2000) {
    return "The note must be 2000 characters or fewer.";
  }
  if (edits.name !== undefined && edits.name.length > 120) {
    return "The tournament's name must be 120 characters or fewer.";
  }
  if (edits.eventDate !== undefined && !ISO_DATE_PATTERN.test(edits.eventDate)) {
    return "Pick the day the tournament was played.";
  }
  const players = draft.playerCount.trim();
  if (players.length > 0) {
    if (!WHOLE_NUMBER_PATTERN.test(players) || Number(players) < 1) {
      return "The number of players must be a whole number of at least 1.";
    }
    if (Number(players) > MAX_PLAYER_COUNT) {
      return "That is more players than any tournament has had. Check the number.";
    }
  }
  if (edits.organizer !== undefined && edits.organizer.length > 120) {
    return "The organizer must be 120 characters or fewer.";
  }
  if (edits.location !== undefined && edits.location.length > 200) {
    return "The venue must be 200 characters or fewer.";
  }
  if (edits.country !== undefined && !COUNTRY_PATTERN.test(edits.country)) {
    return "Write the country as its two-letter code, like DE or US.";
  }
  return null;
}
