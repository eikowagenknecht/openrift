/**
 * Names an accepted candidate has to invent: the live event's URL slug, and a
 * deck's display name when the source shipped none.
 *
 * Both are pure and both are deliberately conservative — the slug grammar is a
 * CHECK constraint on `meta_events.slug`, and the reserved list is enforced at
 * the contract boundary for hand-entered events, so a candidate that produced
 * an illegal slug would fail at the insert with nothing useful to show the
 * reviewer.
 */
import { slugifyName } from "@openrift/shared/utils";

/**
 * `meta_events.slug` CHECK: `^[a-z0-9][a-z0-9-]{2,49}$` — 3 to 50 characters,
 * opening on a letter or digit.
 */
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 50;

/** Used when a name slugifies to nothing usable ("???", a purely CJK title). */
const SLUG_FALLBACK_STEM = "event";

/**
 * Slugs the `/meta` route space spends on its own pages, mirroring
 * `RESERVED_EVENT_SLUGS` in the admin contract. An accepted candidate must not
 * claim one either.
 */
const RESERVED_SLUGS = new Set(["decks", "events", "stats", "new", "admin"]);

/** How many `-2`, `-3`, … variants {@link metaEventSlugCandidates} offers. */
const MAX_SLUG_VARIANTS = 50;

function trimHyphens(text: string): string {
  return text.replaceAll(/^-+|-+$/gu, "");
}

function yearOf(eventDate: string): string {
  return /^(?<year>\d{4})/u.exec(eventDate)?.groups?.year ?? "";
}

/**
 * The slug an accepted event gets before uniqueness is considered: the name,
 * slugified, with the event's year appended.
 *
 * The year is what keeps a recurring series ("Summoner Skirmish") from
 * colliding with itself every season, so it is part of the base rather than a
 * disambiguation suffix. A name that already ends in the year keeps it once.
 */
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

/**
 * The slugs to try, in order, when accepting a candidate event. The caller
 * takes the first one no live event already holds.
 *
 * Reserved slugs are dropped rather than renamed, because the numbered variants
 * after them ("decks-2", …) are free and read better than a rewritten stem.
 */
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

/** `decks.name` CHECK bound. */
const MAX_DECK_NAME_LENGTH = 200;

/**
 * The display name for an accepted deck whose source gave none.
 *
 * Sources routinely ship bare decklists, and "Untitled deck" ×8 on an event
 * page is useless. The legend is what players call the archetype, so it leads;
 * the event name stands in when the list has no legend zone card (an
 * incomplete import, or a format without legends).
 */
export function defaultMetaDeckName(
  legendName: string | null,
  playerName: string,
  eventName: string,
): string {
  const lead = legendName === null || legendName === "" ? eventName : legendName;
  return `${lead} (${playerName})`.slice(0, MAX_DECK_NAME_LENGTH);
}
