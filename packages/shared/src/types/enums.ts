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

/** `auto` derives from `findStandardArtFallback`, `pinned` uses `fallback_image_file_id`, `none` suppresses the substitute. Backed by a CHECK constraint, not a reference table. */
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

/**
 * The /api/enums endpoint is the authoritative source at runtime; there is
 * deliberately no fallback constant.
 */
export interface EnumOrders {
  finishes: readonly string[];
  rarities: readonly string[];
  domains: readonly string[];
  cardTypes: readonly string[];
  superTypes: readonly string[];
  artVariants: readonly string[];
  cardSizes: readonly string[];
}

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

/** `none` has no deck attached, and so no public page. `partial` may be missing side zones. */
export type MetaListStatus = "none" | "partial" | "full";

/** The {@link MetaListStatus} values, in increasing completeness. */
export const META_LIST_STATUSES = ["none", "partial", "full"] as const;

export type MetaEntryStatus = "complete" | "eliminated" | "dropped";

/** The {@link MetaEntryStatus} values. */
export const META_ENTRY_STATUSES = ["complete", "eliminated", "dropped"] as const;

/** No casual tier: `meta_sync_settings.auto_accept_min_players` keeps play nights out of the archive. */
export type MetaEventTier = "premier" | "competitive" | "local";

/** The {@link MetaEventTier} values, most to least competitive. */
export const META_EVENT_TIERS = ["premier", "competitive", "local"] as const;

/** Final once set: `refused` marks the id unreadable so later passes don't retry it. */
export type MetaSourceFetchStatus = "fetched" | "refused";

/** The {@link MetaSourceFetchStatus} values. */
export const META_SOURCE_FETCH_STATUSES = ["fetched", "refused"] as const;

/** Why a swept event id produced no catalogue row. */
export type UvsgamesProbeOutcome = "other_game" | "absent" | "unreadable";

/** The {@link UvsgamesProbeOutcome} values. */
export const UVSGAMES_PROBE_OUTCOMES = ["other_game", "absent", "unreadable"] as const;

/** Admin corrections start `accepted`; user submissions start `pending`. Only `accepted` overlays are applied. */
export type MetaOverlayStatus = "pending" | "accepted" | "rejected";

/** The {@link MetaOverlayStatus} values. */
export const META_OVERLAY_STATUSES = ["pending", "accepted", "rejected"] as const;

/** `slug` and `sourceUrl` are absent on purpose: neither is an overlay-claimable field. */
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

/** `cards` has no matching column or CHECK. `deckId` is absent: it is never pointed at directly. */
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

/** A source contributes to the cross-mirror review only once none of its rows is `unreviewed`. */
export const META_CROSS_SOURCE_STATES = ["linked", "distinct", "unreviewed"] as const;

export type MetaCrossSourceState = (typeof META_CROSS_SOURCE_STATES)[number];

export const META_EVENT_SOURCE_FILTERS = [
  ...META_CATALOG_PROVIDERS,
  "usersubmission",
  "manual",
] as const;

export type MetaEventSourceFilter = (typeof META_EVENT_SOURCE_FILTERS)[number];

/** Derived from the citation and the ignore table, not stored. */
export const META_CATALOG_TRIAGE = ["new", "accepted", "dismissed"] as const;

/** The source's own status vocabulary, not ours. */
export const META_CATALOG_DISPLAY_STATUSES = ["upcoming", "inProgress", "complete"] as const;

/** 1 registration-open, 2 fully-booked, 3 scheduled, 4 in-progress, 5 finished; the source can report a step outside this. */
export const PLAYLOLTCG_STATUSES = [1, 2, 3, 4, 5] as const;

export type PlayloltcgStatus = (typeof PLAYLOLTCG_STATUSES)[number];

/** topdeck's own format words, case included, since its search matches on them. */
export const TOPDECK_FORMATS = ["Constructed", "Limited", "Sealed", "2v2", "Free-for-All"] as const;

export type TopdeckFormat = (typeof TOPDECK_FORMATS)[number];

export const META_CATALOG_SORTS = ["startAt", "name", "playerCount"] as const;

/** Which way a {@link META_CATALOG_SORTS} column runs. */
export const META_CATALOG_SORT_DIRECTIONS = ["asc", "desc"] as const;

/** Credit rows are always written; this only gates the public read. `riot_id` falls back to the display name when unset. */
export type MetaCreditVisibility = "hidden" | "name" | "riot_id";

/** The {@link MetaCreditVisibility} values. */
export const META_CREDIT_VISIBILITIES = ["hidden", "name", "riot_id"] as const;

/** Same vocabulary as `card_submissions.status`. */
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

/** `event_correction` is the one kind carrying no decklist. */
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
