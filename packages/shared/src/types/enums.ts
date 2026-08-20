// ── Game data enums ─────────────────────────────────────────────────────────
// These types are backed by reference tables in the database. Valid values are
// managed via the admin UI — adding a value requires only an INSERT into the
// reference table (no code change). See WellKnown in well-known.ts for values
// that have special application logic (compile-time safety).

/** Backed by `card_types` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type CardType = string & Record<never, never>;

/** Backed by `rarities` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Rarity = string & Record<never, never>;

/** Backed by `domains` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Domain = string & Record<never, never>;

/** Backed by `super_types` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type SuperType = string & Record<never, never>;

export type CardFace = "front" | "back";

/**
 * How a printing without a scan of its own resolves substitute artwork.
 * `auto` derives it (see `findStandardArtFallback`), `pinned` shows the
 * admin-chosen `fallback_image_file_id`, `none` suppresses the substitute so
 * only the drawn placeholder shows. A closed set backed by a CHECK constraint
 * (migration 257), not a reference table.
 */
export type FallbackArtMode = "auto" | "pinned" | "none";

/** Backed by `art_variants` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type ArtVariant = string & Record<never, never>;

/** Backed by `finishes` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type Finish = string & Record<never, never>;

/** Backed by `card_sizes` reference table. Physical card size (standard/oversized). */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type CardSize = string & Record<never, never>;

// ── Enum orders ─────────────────────────────────────────────────────────────
// Sort orders for reference-table enums. The /api/enums endpoint is the
// authoritative source at runtime. Every sort path must read the live order
// (via `useEnumOrders().orders` in web or the matching repo on the API),
// so admin re-ordering of the reference tables takes effect everywhere.
// There is deliberately no fallback constant.

/** Sort-order configuration for all reference-table enums. */
export interface EnumOrders {
  finishes: readonly string[];
  rarities: readonly string[];
  domains: readonly string[];
  cardTypes: readonly string[];
  superTypes: readonly string[];
  artVariants: readonly string[];
  cardSizes: readonly string[];
}

// ── Application-level enums ─────────────────────────────────────────────────
// These are structural to the app and stay hardcoded — adding a value always
// requires code changes.

export type ActivityAction = "added" | "removed" | "moved";

/** Backed by `deck_formats` reference table. */
// oxlint-disable-next-line typescript-eslint/ban-types -- open string type for DB-driven enum values
export type DeckFormat = string & Record<never, never>;

/** Backed by `deck_zones` reference table. */
export type DeckZone =
  | "main"
  | "sideboard"
  | "legend"
  | "champion"
  | "runes"
  | "battlefield"
  | "overflow";

/**
 * How much of an archived deck's list the meta archive holds (ADR-014). Sources
 * publish at three levels of detail, and the archive keeps them apart rather
 * than guessing from the card count.
 *
 * - `full`: the pilot's whole list.
 * - `partial`: the main deck is complete, the side zones (battlefields, runes,
 *   sideboard) may be missing. Card inclusion reads the main zone alone, so
 *   these count there exactly like a full list.
 * - `archetype`: the main deck is unknown; the cards are the legend and, where
 *   the source named one, the champion.
 *
 * All three count towards legend play-rate. Only `archetype` is excluded from
 * card inclusion, and only `archetype` has no public deck page.
 */
export type MetaListStatus = "full" | "partial" | "archetype";

/** The {@link MetaListStatus} values, in decreasing completeness. */
export const META_LIST_STATUSES = ["full", "partial", "archetype"] as const;

/**
 * Whether a contributor's name appears on the meta archive pages they
 * contributed to, and which of their profile fields it reads (ADR-014).
 *
 * Credit rows are always written; this is what the public read filters on, so
 * opting in later credits every past contribution and opting out removes them
 * all without touching an archive row. `riot_id` falls back to the display name
 * when the Riot ID is unset.
 */
export type MetaCreditVisibility = "hidden" | "name" | "riot_id";

/** The {@link MetaCreditVisibility} values. */
export const META_CREDIT_VISIBILITIES = ["hidden", "name", "riot_id"] as const;

/**
 * Where a user's decklist submission ended up (ADR-014, ADR-036). Same
 * vocabulary as `card_submissions.status`, so the two ledgers read alike.
 */
export type MetaSubmissionStatus =
  | "pending"
  | "accepted"
  | "already_correct"
  | "not_applied"
  | "rejected";

/** The {@link MetaSubmissionStatus} values. */
export const META_SUBMISSION_STATUSES = [
  "pending",
  "accepted",
  "already_correct",
  "not_applied",
  "rejected",
] as const;

/** Why an admin resolved a decklist submission without accepting it. */
export type MetaSubmissionReason =
  | "duplicate"
  | "already_correct"
  | "unverified"
  | "incomplete_list"
  | "not_an_event";

/** The {@link MetaSubmissionReason} values. */
export const META_SUBMISSION_REASONS = [
  "duplicate",
  "already_correct",
  "unverified",
  "incomplete_list",
  "not_an_event",
] as const;
