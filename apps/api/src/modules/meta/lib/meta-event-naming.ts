import { RESERVED_META_EVENT_SLUGS } from "@openrift/shared/contracts/admin/meta-events";
import { slugifyName } from "@openrift/shared/utils";

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

const SLUG_FALLBACK_STEM = "event";

const RESERVED_SLUGS = new Set(RESERVED_META_EVENT_SLUGS);

const MAX_SLUG_VARIANTS = 50;

function trimHyphens(text: string): string {
  return text.replaceAll(/^-+|-+$/gu, "");
}

function yearOf(eventDate: string): string {
  return /^(?<year>\d{4})/u.exec(eventDate)?.groups?.year ?? "";
}

/** The year is part of the base, not a disambiguation suffix, so a recurring series doesn't collide every season. */
export function metaEventSlugBase(name: string, eventDate: string): string {
  const year = yearOf(eventDate);
  const slugified = slugifyName(name);
  const stem = slugified === "" ? SLUG_FALLBACK_STEM : slugified;

  const suffix = year === "" || stem === year || stem.endsWith(`-${year}`) ? "" : `-${year}`;
  const trimmed = trimHyphens(stem.slice(0, MAX_SLUG_LENGTH - suffix.length));
  const candidate = `${trimmed === "" ? SLUG_FALLBACK_STEM : trimmed}${suffix}`;

  // Only reachable for a very short name in a year-less date, e.g. "AB".
  return candidate.length < MIN_SLUG_LENGTH ? `${SLUG_FALLBACK_STEM}${suffix}` : candidate;
}

export function metaEventSlugCandidates(name: string, eventDate: string): string[] {
  const base = metaEventSlugBase(name, eventDate);
  const slugs: string[] = [];
  for (let n = 1; n <= MAX_SLUG_VARIANTS; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const stem = trimHyphens(base.slice(0, MAX_SLUG_LENGTH - suffix.length));
    const slug = `${stem}${suffix}`;
    if (!RESERVED_SLUGS.has(slug) && slug.length >= MIN_SLUG_LENGTH) {
      slugs.push(slug);
    }
  }
  return slugs;
}

const MAX_DECK_NAME_LENGTH = 200;

/** Resolves a standing's name the way every read query's `coalesce` does, for callers holding raw columns. */
export function resolvedStandingName(
  standing: { playerName: string | null; uvsgamesPlayerId: number | null },
  displayNames: ReadonlyMap<number, string>,
): string {
  if (standing.playerName !== null) {
    return standing.playerName;
  }
  if (standing.uvsgamesPlayerId === null) {
    return "";
  }
  return displayNames.get(standing.uvsgamesPlayerId) ?? "";
}

/** The legend leads when present; the event name stands in for a list with no legend zone card. */
export function defaultMetaDeckName(
  legendName: string | null,
  playerName: string,
  eventName: string,
): string {
  const lead = legendName === null || legendName === "" ? eventName : legendName;
  const parts = [lead, playerName === "" ? null : `(${playerName})`].filter(Boolean);
  const name = parts.length === 0 ? "Untitled deck" : parts.join(" ");
  return name.slice(0, MAX_DECK_NAME_LENGTH);
}
