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
 * How much of a player's list the meta archive holds (ADR-014). Sources publish
 * at three levels of detail, and the archive keeps them apart rather than
 * guessing from the card count.
 *
 * - `none`: no list at all. The archive still knows who played, how they
 *   finished, and usually which legend they piloted, which is what most
 *   archived entries are.
 * - `partial`: the main deck is complete, the side zones (battlefields, runes,
 *   sideboard) may be missing.
 * - `full`: the player's whole list.
 *
 * `none` is the one with no deck attached, and so the one with no public page.
 */
export type MetaListStatus = "none" | "partial" | "full";

/** The {@link MetaListStatus} values, in increasing completeness. */
export const META_LIST_STATUSES = ["none", "partial", "full"] as const;

/**
 * How a player's entry in an archived event ended, as the official source
 * reports it. It is the one fact a win/loss record cannot carry: a player who
 * dropped at 0-2 and one who played every round and lost both show "0-2".
 *
 * - `complete`: played the event out.
 * - `eliminated`: knocked out by the structure, in a cut or an elimination phase.
 * - `dropped`: left before the event finished.
 */
export type MetaEntryStatus = "complete" | "eliminated" | "dropped";

/** The {@link MetaEntryStatus} values. */
export const META_ENTRY_STATUSES = ["complete", "eliminated", "dropped"] as const;

/**
 * How much an archived event counts for, in the archive's own vocabulary
 * rather than any one source's product names:
 *
 * - `premier`: the main stage. Regional Qualifiers, and whatever nationals or
 *   worlds the programme grows.
 * - `competitive`: serious open fields below the main stage. Showdown Series,
 *   City Challenges, and the large side events run alongside a qualifier.
 * - `local`: the store-level tournaments that make up most of the archive.
 *
 * Sources are matched into these by rule at ingest and the value is
 * admin-editable per event, so a renamed product line is a rule change, not a
 * new tier.
 *
 * There is no casual tier: the archive's admission threshold
 * (`meta_sync_settings.auto_accept_min_players`) keeps play nights out, so
 * every event that reaches it is a tournament with standings on file.
 */
export type MetaEventTier = "premier" | "competitive" | "local";

/** The {@link MetaEventTier} values, most to least competitive. */
export const META_EVENT_TIERS = ["premier", "competitive", "local"] as const;

/**
 * Whether a source served a decklist when the fetcher asked for it.
 *
 * A published list never changes, so either outcome is final: `refused` records
 * that the id was tried and came back unreadable, which is what stops the next
 * pass asking again.
 */
export type MetaSourceFetchStatus = "fetched" | "refused";

/** The {@link MetaSourceFetchStatus} values. */
export const META_SOURCE_FETCH_STATUSES = ["fetched", "refused"] as const;

/** Why a swept event id produced no catalogue row. */
export type UvsgamesProbeOutcome = "other_game" | "absent" | "unreadable";

/** The {@link UvsgamesProbeOutcome} values. */
export const UVSGAMES_PROBE_OUTCOMES = ["other_game", "absent", "unreadable"] as const;

/**
 * Where an overlay sits in review. An admin's correction is written straight to
 * `accepted`; a user's submission starts `pending`.
 *
 * Only `accepted` overlays are applied, so a pending one changes nothing a
 * reader sees, and rejecting is a status change rather than a delete.
 */
export type MetaOverlayStatus = "pending" | "accepted" | "rejected";

/** The {@link MetaOverlayStatus} values. */
export const META_OVERLAY_STATUSES = ["pending", "accepted", "rejected"] as const;

/**
 * The event fields an overlay can claim.
 *
 * `slug` is absent on purpose: it is minted at promotion and renaming is its
 * own action, not a patch. So is `sourceUrl`, which lives in
 * `meta_event_sources` as that provider's citation.
 */
export type MetaEventOverlayField =
  | "name"
  | "eventDate"
  | "format"
  | "playerCount"
  | "organizer"
  | "notes"
  | "tier"
  | "country"
  | "location";

/** The {@link MetaEventOverlayField} values. Mirrored by a CHECK on the table. */
export const META_EVENT_OVERLAY_FIELDS = [
  "name",
  "eventDate",
  "format",
  "playerCount",
  "organizer",
  "notes",
  "tier",
  "country",
  "location",
] as const;

/**
 * The standings fields an overlay can claim.
 *
 * `cards` claims the overlay's card-line rows rather than a column, so it is
 * the one value here with no matching column and no generated consistency
 * CHECK. `deckId` is absent: a deck is built by promotion from the claimed
 * lines, never pointed at directly.
 */
export type MetaPlayerOverlayField =
  | "playerName"
  | "rank"
  | "rankIsTier"
  | "wins"
  | "losses"
  | "draws"
  | "matchPoints"
  | "opponentMatchWinPct"
  | "gameWinPct"
  | "opponentGameWinPct"
  | "entryStatus"
  | "legendCardId"
  | "championCardId"
  | "listStatus"
  | "cards";

/** The {@link MetaPlayerOverlayField} values. Mirrored by a CHECK on the table. */
export const META_PLAYER_OVERLAY_FIELDS = [
  "playerName",
  "rank",
  "rankIsTier",
  "wins",
  "losses",
  "draws",
  "matchPoints",
  "opponentMatchWinPct",
  "gameWinPct",
  "opponentGameWinPct",
  "entryStatus",
  "legendCardId",
  "championCardId",
  "listStatus",
  "cards",
] as const;

/**
 * The columns the admin live event list can be ordered by. The list is paged on
 * the server, so a sort has to travel with the query rather than reorder the
 * page that happens to be on screen.
 */
export const META_EVENT_SORTS = [
  "eventDate",
  "name",
  "format",
  "playerRowCount",
  "deckCount",
  "organizer",
] as const;

/** Which way a {@link META_EVENT_SORTS} column runs. */
export const META_EVENT_SORT_DIRECTIONS = ["asc", "desc"] as const;

/** The catalogued sources, the axis the admin Sync and Catalogue tabs select on. */
export const META_CATALOG_PROVIDERS = ["uvsgames", "playloltcg", "topdeck"] as const;

/**
 * The live event list's source filter: the catalogued providers,
 * `usersubmission` (the provider accepted submissions are cited under), and
 * `manual` for events no provider feeds.
 */
export const META_EVENT_SOURCE_FILTERS = [
  ...META_CATALOG_PROVIDERS,
  "usersubmission",
  "manual",
] as const;

export type MetaEventSourceFilter = (typeof META_EVENT_SOURCE_FILTERS)[number];

/**
 * Triage state, derived from the citation and the ignore table rather than
 * stored: `new` means no live event cites the key and it is not ignored.
 */
export const META_CATALOG_TRIAGE = ["new", "accepted", "dismissed"] as const;

/** The source's own status vocabulary, not ours. */
export const META_CATALOG_DISPLAY_STATUSES = ["upcoming", "inProgress", "complete"] as const;

/**
 * playloltcg's `sortWeight` lifecycle, which stands in for uvsgames'
 * {@link META_CATALOG_DISPLAY_STATUSES}: 1 registration-open, 2 fully-booked,
 * 3 scheduled, 4 in-progress, 5 finished. The source can report a step outside
 * it, which is why the column is not an enum in the database.
 */
export const PLAYLOLTCG_STATUSES = [1, 2, 3, 4, 5] as const;

export type PlayloltcgStatus = (typeof PLAYLOLTCG_STATUSES)[number];

/** topdeck's own format words, case included, since its search matches on them. */
export const TOPDECK_FORMATS = ["Constructed", "Limited", "Sealed", "2v2", "Free-for-All"] as const;

export type TopdeckFormat = (typeof TOPDECK_FORMATS)[number];

/**
 * The columns the catalogue can be ordered by. The list is paged on the server
 * over a six-figure mirror, so a sort has to travel with the query rather than
 * reorder the fifty rows that happen to be on screen.
 */
export const META_CATALOG_SORTS = ["startAt", "name", "playerCount"] as const;

/** Which way a {@link META_CATALOG_SORTS} column runs. */
export const META_CATALOG_SORT_DIRECTIONS = ["asc", "desc"] as const;

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

/**
 * What a contribution to the meta archive asks for: a list the archive has none
 * of, the missing half of one it holds partially, a fix to one it holds wrongly,
 * or a fix to the event's own facts (the one kind carrying no decklist).
 */
export type MetaSubmissionKind = "new_list" | "completion" | "correction" | "event_correction";

/** The {@link MetaSubmissionKind} values. */
export const META_SUBMISSION_KINDS = [
  "new_list",
  "completion",
  "correction",
  "event_correction",
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
