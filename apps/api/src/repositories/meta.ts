import { META_CATALOG_PROVIDERS, WellKnown } from "@openrift/shared";
import type {
  CardType,
  DeckFormatConfig,
  DeckZone,
  META_EVENT_SORTS,
  MetaCreditVisibility,
  MetaEntryStatus,
  MetaEventSourceFilter,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared/types";
import type {
  ExpressionBuilder,
  Insertable,
  Kysely,
  RawBuilder,
  Selectable,
  SqlBool,
  Updateable,
} from "kysely";
import { sql } from "kysely";

import type {
  Database,
  MetaEventMatchesTable,
  MetaEventPhasesTable,
  MetaEventPlayersTable,
  MetaEventSourcesTable,
  MetaEventsTable,
} from "../db/index.js";
import { rowBatches } from "../lib/bind-batches.js";

/**
 * The synthetic account that owns every archived deck. It has no `accounts`
 * row, so no credential or OAuth path can produce a session for it — the id is
 * safe to hardcode as the write path's owner.
 */
export const META_ARCHIVE_USER_ID = "meta-archive";

export type MetaEventMatchRow = Selectable<MetaEventMatchesTable>;

export type NewMetaEventMatch = Insertable<MetaEventMatchesTable>;

export type MetaEventPhaseRow = Selectable<MetaEventPhasesTable>;

export type NewMetaEventPhase = Insertable<MetaEventPhasesTable>;

/** One event's recomputed classification, with the fields the pass owns. */
export interface MetaEventClassificationPatch {
  id: string;
  /** Omitted leaves the live value: the column is NOT NULL and a human may own it. */
  tier?: MetaEventTier;
  country?: string | null;
  location?: string | null;
}

/** A written match row, with the source key the caller pairs it back up by. */
export interface UpsertedMetaEventMatch {
  id: string;
  sourceMatchId: string | null;
}

export type MetaEventRow = Selectable<MetaEventsTable>;

/**
 * `playerRowCount` is the whole standings table; `deckCount` the subset a
 * decklist is known for. They differ for nearly every real event, which is the
 * point of the pyramid.
 */
export type MetaEventWithCounts = MetaEventRow & {
  playerRowCount: number;
  deckCount: number;
};

/**
 * One player's entry as a public standings table renders it.
 *
 * `legendName` is the canonical `cards.name`; the types and tags travel beside
 * it so a player-facing presenter can compose the champion-led label while the
 * admin table keeps the field it edits.
 */
export interface MetaEventPlayerRow {
  id: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  sourceIdentity: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendCardId: string | null;
  legendName: string | null;
  legendSlug: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
  legendDomains: string[] | null;
  championCardId: string | null;
  championName: string | null;
  championSlug: string | null;
  championDomains: string[] | null;
  /** Null for a standings-only entry, together with the three fields below. */
  deckId: string | null;
  deckName: string | null;
  shareToken: string | null;
  listStatus: MetaListStatus;
}

/** A standings row carrying the event it belongs to, for a cross-event batch. */
export type MetaEventPlayerWithEventRow = MetaEventPlayerRow & { metaEventId: string };

/**
 * One recent addition to the archive, already grouped into a burst: all rows of
 * one kind landing on one event within one UTC day.
 */
export interface MetaActivityRow {
  kind: "event-added" | "decks-added" | "results-added";
  /** When the newest row of the burst landed. */
  occurredAt: Date;
  /** Rows in the burst; null for `event-added`. */
  count: number | null;
  eventSlug: string;
  eventName: string;
}

/** One archived deck as the cross-event browser lists it. */
export interface MetaDeckSummaryRow {
  playerId: string;
  deckId: string;
  shareToken: string;
  listStatus: MetaListStatus;
  deckName: string;
  deckFormat: string;
  legendCardId: string | null;
  legendName: string | null;
  legendSlug: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
  championCardId: string | null;
  championName: string | null;
  playerName: string;
  sourceIdentity: string | null;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
}

export interface MetaDeckCardRow {
  deckId: string;
  cardId: string;
  quantity: number;
  sideboard: boolean;
}

/**
 * One legend the archive holds a result for, with the card fields a display
 * name and a route key are built from.
 */
export interface MetaArchiveLegendRow {
  cardId: string;
  name: string;
  slug: string;
  types: CardType[] | null;
  tags: string[] | null;
  domains: string[] | null;
}

/** One legend as the sitemap lists it: the route key's ingredients plus its lastmod. */
export interface MetaLegendSitemapRow extends MetaArchiveLegendRow {
  updatedAt: Date;
}

/** One legend's standings rows at one event, folded for the index. */
export interface MetaLegendEventRecordRow {
  legendCardId: string;
  eventSlug: string;
  bestRank: number;
  rankIsTier: boolean;
  finishes: number;
  decklists: number;
  won: boolean;
}

/** One archived standings row as a legend's own page lists it. */
export interface MetaLegendFinishRow {
  playerId: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  sourceIdentity: string | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  shareToken: string | null;
  listStatus: MetaListStatus;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
  eventPlayerCount: number | null;
}

export interface MetaPlayerFinishRow {
  playerId: string;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  shareToken: string | null;
  listStatus: MetaListStatus;
  legendCardId: string | null;
  legendName: string | null;
  legendSlug: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
  legendDomains: string[] | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
  eventPlayerCount: number | null;
}

/**
 * The standings context an archived deck's page prints. Also the
 * archive-membership test the public deck endpoint uses: `undefined` means
 * the token's deck exists but is outside the archive, and must 404.
 */
export interface MetaDeckContextRow {
  playerId: string;
  listStatus: MetaListStatus;
  playerName: string;
  sourceIdentity: string | null;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
  eventPlayerCount: number | null;
}

/** One standings row in the admin's event management table. */
export interface AdminMetaPlayerRow extends MetaEventPlayerRow {
  deckFormat: string | null;
  cardCount: number;
}

/** A live standings row as the review queue compares against it. */
export interface LiveMetaPlayerRow {
  id: string;
  metaEventId: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendCardId: string | null;
  championCardId: string | null;
  listStatus: MetaListStatus;
  deckId: string | null;
  deckName: string | null;
  shareToken: string | null;
}

const SITEMAP_TIERS = ["premier", "competitive"] as const;

/**
 * Inclusive date-only bounds on the event a deck was played at. Either end may
 * be open; both absent is the whole archive.
 */
export interface MetaDeckDateRange {
  from?: string;
  to?: string;
}

/** Applied to the *event's* fields, not the standings row's. */
export interface MetaCountsFilters {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * The archive scope bar's selection as a read applies it, over the event's own
 * fields. Each facet is an include list or an exclude list, never both.
 */
export interface MetaScopeFilters extends MetaDeckDateRange {
  formats?: readonly string[];
  formatsEx?: readonly string[];
  tiers?: readonly string[];
  tiersEx?: readonly string[];
  /** ISO 3166-1 alpha-2, matched case-insensitively against the stored code. */
  countries?: readonly string[];
  countriesEx?: readonly string[];
}

/** Which archived decks the browser is asking for, and how many rows of them. */
export interface MetaDeckFilters extends MetaScopeFilters {
  /** A legend's card id. */
  legend?: string;
  /** A player key, as {@link foldedPlayerIdentity} yields it. */
  player?: string;
  limit?: number;
}

/** How many events the archive holds at each tier. */
export type MetaEventTierCounts = Record<MetaEventTier, number>;

/** One legend's headline numbers inside a scope. */
export interface MetaLegendRecordCounts {
  /** Events won, not rank-1 rows: a shared first place at one event is one win. */
  wins: number;
  finishes: number;
  decklists: number;
}

/**
 * One citation on an event: where a slice of its data came from. Public, and
 * never a contributor — a person is credited through {@link MetaContributorRow}
 * instead.
 */
export type MetaEventSourceRow = Selectable<MetaEventSourcesTable>;

/** The providers promotion reads a mirror for, as opposed to a push provider. */
const MIRROR_PROVIDERS: ReadonlySet<string> = new Set(META_CATALOG_PROVIDERS);

/**
 * `provider` and `externalId` are null together for a hand-entered citation (a
 * VOD, a photo of the standings board); a provider row carries the source's
 * key so promotion and unlinking can find it.
 */
export interface MetaEventSourceInput {
  metaEventId: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
}

/**
 * One contributor as an event page prints them. The name is resolved at read
 * time from the user's profile and their `meta_credit_visibility`, so a rename
 * or an opt-out reaches every past contribution with no sweep across rows.
 */
export interface MetaContributorRow {
  metaEventId: string;
  userId: string;
  /** Never empty: a contributor whose chosen field is blank is dropped instead. */
  displayName: string;
}

export interface MetaEventInput {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  /** Omitted means the column default (`store`); the accept paths always classify one. */
  tier?: MetaEventTier;
  country?: string | null;
  location?: string | null;
}

export interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

/**
 * Folds repeated lines into one row per `uq_deck_cards` key, summing quantity.
 * The index is `NULLS NOT DISTINCT`, so the archive's null `preferred_printing_id`
 * does not separate two lines the way a null usually would, and a source that
 * lists a card across several lines (or under two names that resolve to one
 * card) would otherwise violate it.
 */
export function deckCardMergeKey(card: MetaDeckCardInput): string {
  return `${card.cardId} ${card.zone} ${card.preferredPrintingId ?? ""}`;
}

export function mergeDeckCards(cards: readonly MetaDeckCardInput[]): MetaDeckCardInput[] {
  const merged = new Map<string, MetaDeckCardInput>();
  for (const card of cards) {
    const key = deckCardMergeKey(card);
    const held = merged.get(key);
    if (held === undefined) {
      merged.set(key, { ...card });
      continue;
    }
    held.quantity += card.quantity;
  }
  return [...merged.values()];
}

export interface MetaStoredDeckCard {
  cardId: string;
  zone: string;
  quantity: number;
  preferredPrintingId: string | null;
}

function deckCardKey(card: MetaStoredDeckCard | MetaDeckCardInput): string {
  return `${card.cardId} ${card.zone} ${card.quantity} ${card.preferredPrintingId ?? ""}`;
}

/**
 * `incoming` is compared as given — callers pass it through
 * {@link mergeDeckCards} first, since that is the shape the table holds.
 */
export function sameDeckCards(
  existing: readonly MetaStoredDeckCard[],
  incoming: readonly MetaDeckCardInput[],
): boolean {
  if (existing.length !== incoming.length) {
    return false;
  }
  const held = new Map<string, number>();
  for (const card of existing) {
    const key = deckCardKey(card);
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  for (const card of incoming) {
    const key = deckCardKey(card);
    const left = held.get(key) ?? 0;
    if (left === 0) {
      return false;
    }
    held.set(key, left - 1);
  }
  return true;
}

/**
 * The decklist attached to a standings row. `listStatus` cannot be `"none"`
 * here: that value means there is no deck, and the table CHECKs the two agree.
 */
export interface MetaArchivedDeckInput {
  name: string;
  format: string;
  formatConfig: DeckFormatConfig | null;
  cards: MetaDeckCardInput[];
  listStatus: Exclude<MetaListStatus, "none">;
}

export interface MetaEventPlayerInput {
  eventId: string;
  rank: number;
  rankIsTier: boolean;
  /**
   * Null only when {@link uvsgamesPlayerId} is set: a row filed from the
   * source is named by the source, and the archive stores no snapshot of it.
   * Both together is an admin's override of the source's name.
   */
  playerName: string | null;
  uvsgamesPlayerId?: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** The standings columns behind the rank; every source but the official one omits them. */
  matchPoints?: number | null;
  opponentMatchWinPct?: number | null;
  gameWinPct?: number | null;
  opponentGameWinPct?: number | null;
  entryStatus?: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  sourceIdentity?: string | null;
  mintedByOverlayId?: string | null;
  deck: MetaArchivedDeckInput | null;
}

export interface MetaEventPlayerUpdate extends MetaEventPlayerPatch {
  id: string;
}

/**
 * The snake_case name and SQL type of every patchable column. `updatePlayers`
 * is raw SQL, past the `CamelCasePlugin`, so it has to spell them itself.
 */
const PLAYER_PATCH_COLUMNS = [
  { key: "rank", column: "rank", type: "int" },
  { key: "rankIsTier", column: "rank_is_tier", type: "boolean" },
  { key: "playerName", column: "player_name", type: "text" },
  { key: "uvsgamesPlayerId", column: "uvsgames_player_id", type: "int" },
  { key: "wins", column: "wins", type: "smallint" },
  { key: "losses", column: "losses", type: "smallint" },
  { key: "draws", column: "draws", type: "smallint" },
  { key: "matchPoints", column: "match_points", type: "int" },
  { key: "opponentMatchWinPct", column: "opponent_match_win_pct", type: "double precision" },
  { key: "gameWinPct", column: "game_win_pct", type: "double precision" },
  { key: "opponentGameWinPct", column: "opponent_game_win_pct", type: "double precision" },
  { key: "entryStatus", column: "entry_status", type: "text" },
  { key: "legendCardId", column: "legend_card_id", type: "uuid" },
  { key: "championCardId", column: "champion_card_id", type: "uuid" },
  { key: "sourceIdentity", column: "source_identity", type: "text" },
] as const satisfies readonly {
  key: keyof MetaEventPlayerPatch;
  column: string;
  type: string;
}[];

export interface MetaStoredPlayerDeck {
  deckId: string;
  listStatus: MetaListStatus;
  name: string;
  format: string;
  cards: MetaStoredDeckCard[];
}

/** Scalar columns only — the deck moves through `setPlayerDeck` / `clearPlayerDeck`. */
export interface MetaEventPlayerPatch {
  rank?: number;
  rankIsTier?: boolean;
  playerName?: string | null;
  uvsgamesPlayerId?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  matchPoints?: number | null;
  opponentMatchWinPct?: number | null;
  gameWinPct?: number | null;
  opponentGameWinPct?: number | null;
  entryStatus?: MetaEntryStatus | null;
  legendCardId?: string | null;
  championCardId?: string | null;
  sourceIdentity?: string | null;
}

/**
 * Queries for the admin-curated meta archive. `meta_event_players` is the
 * anchor: one row per player per event, with an optional `decks` row (owned by
 * {@link META_ARCHIVE_USER_ID}) hanging off it. This repo owns the event rows,
 * the standings rows, and every join that treats the three as one thing.
 */
/**
 * The player's name as every read serves it: the row's own column when the
 * archive holds one, otherwise the source's current display name. Writing the
 * local column is the admin's override, and clearing it hands the player back to
 * the source's renames.
 *
 * Requires `uvsgames_players` left-joined as `up`.
 */
const resolvedPlayerName = sql<string>`coalesce(p.player_name, up.display_name)`;

/**
 * Must stay character-for-character what `metaPlayerKey` and
 * `idx_meta_event_players_player_key` compute.
 */
const foldedPlayerIdentity = sql<string>`regexp_replace(p.source_identity, '#\\d+$', '')`;

/**
 * One facet as SQL over a column of the event alias `me`. An include list keeps
 * only its values; an exclude list drops them and keeps a row whose column is
 * null, since "all but Germany" is a claim about Germany and not about the
 * events no source named a venue for. A facet carries at most one of the two.
 */
function facetCondition(
  column: RawBuilder<unknown>,
  included?: readonly string[],
  excluded?: readonly string[],
): RawBuilder<SqlBool> | undefined {
  if (included !== undefined && included.length > 0) {
    return sql<SqlBool>`${column} in (${sql.join(included.map((value) => sql`${value}`))})`;
  }
  if (excluded !== undefined && excluded.length > 0) {
    const values = sql.join(excluded.map((value) => sql`${value}`));
    return sql<SqlBool>`(${column} is null or ${column} not in (${values}))`;
  }
  return undefined;
}

/** Every condition a scope puts on the event alias `me`. */
function scopeConditions(scope: MetaScopeFilters): RawBuilder<SqlBool>[] {
  const upper = (values?: readonly string[]) => values?.map((value) => value.toUpperCase());
  return [
    scope.from === undefined ? undefined : sql<SqlBool>`me.event_date >= ${scope.from}`,
    scope.to === undefined ? undefined : sql<SqlBool>`me.event_date <= ${scope.to}`,
    facetCondition(sql`me.format`, scope.formats, scope.formatsEx),
    facetCondition(sql`me.tier`, scope.tiers, scope.tiersEx),
    facetCondition(sql`me.country`, upper(scope.countries), upper(scope.countriesEx)),
  ].filter((condition) => condition !== undefined);
}

/** How one page of the live event list is filtered. */
export interface MetaEventFilters {
  /** Matched against the event name and the organizer. */
  search?: string;
  format?: string;
  /** A provider that feeds the event, or `manual` for events no provider feeds. */
  source?: MetaEventSourceFilter;
  dateFrom?: string;
  dateTo?: string;
  /** Keeps only events holding fewer standings rows than the reported field. */
  incompleteStandings?: boolean;
  /** Keeps only events where no standings row carries a decklist. */
  noDecks?: boolean;
}

/** How one page of the live event list is ordered. Defaults to newest first. */
export interface MetaEventOrder {
  sort?: (typeof META_EVENT_SORTS)[number];
  direction?: "asc" | "desc";
}

const EVENT_ORDER_COLUMNS: Record<(typeof META_EVENT_SORTS)[number], RawBuilder<unknown>> = {
  eventDate: sql`meta_events.event_date`,
  name: sql`meta_events.name`,
  format: sql`meta_events.format`,
  organizer: sql`meta_events.organizer`,
  playerRowCount: sql`c.player_row_count`,
  deckCount: sql`c.deck_count`,
};

/**
 * Nulls sort last whichever way the column runs: an event with no organizer is
 * not the answer to "who ran the earliest event", in either direction.
 */
function eventOrderBy(order: MetaEventOrder) {
  const column = EVENT_ORDER_COLUMNS[order.sort ?? "eventDate"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

/**
 * The archive holds fewer standings rows than the source said played. An
 * event with no reported field size is excluded, not counted as complete.
 */
const standingsShort = sql<boolean>`meta_events.player_count is not null
  and c.player_row_count < meta_events.player_count`;

const noDecks = sql<boolean>`c.deck_count = 0`;

/**
 * The event has a citation from the named provider — or, for `manual`, from no
 * provider at all: hand-entered citations carry a null provider, so an event
 * built by hand has no provider row whether or not it has citations.
 */
function sourcedBy(source: MetaEventSourceFilter) {
  return (eb: ExpressionBuilder<Database, "metaEvents">) => {
    const providerRows = eb
      .selectFrom("metaEventSources as src")
      .select("src.id")
      .whereRef("src.metaEventId", "=", "metaEvents.id")
      .where("src.provider", "is not", null);
    if (source === "manual") {
      return eb.not(eb.exists(providerRows));
    }
    return eb.exists(providerRows.where("src.provider", "=", source));
  };
}

export function metaRepo(db: Kysely<Database>) {
  /**
   * Lateral so the roster and deck counts stay filterable and sortable:
   * neither is a column on `meta_events`.
   *
   * The lateral body is an ungrouped aggregate: it always yields one row, so
   * `c.player_row_count` / `c.deck_count` are non-null for every event.
   */
  function eventQuery() {
    return db
      .selectFrom("metaEvents")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("metaEventPlayers as p")
            .whereRef("p.metaEventId", "=", "metaEvents.id")
            .select([
              eb.cast<number>(eb.fn.countAll(), "integer").as("playerRowCount"),
              sql<number>`count(*) filter (where p.deck_id is not null)::int`.as("deckCount"),
            ])
            .as("c"),
        (join) => join.onTrue(),
      )
      .selectAll("metaEvents")
      .select([
        sql<number>`c.player_row_count`.as("playerRowCount"),
        sql<number>`c.deck_count`.as("deckCount"),
      ]);
  }

  function playerQuery() {
    return (
      db
        .selectFrom("metaEventPlayers as p")
        .leftJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("cards as cc", "cc.id", "p.championCardId")
        // Left join: mvCardAggregates is refreshed on demand, so an inner
        // join would drop a standings row for a card not in it yet.
        .leftJoin("mvCardAggregates as lmca", "lmca.cardId", "p.legendCardId")
        .leftJoin("mvCardAggregates as cmca", "cmca.cardId", "p.championCardId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .select([
          "p.id",
          "p.rank",
          "p.rankIsTier",
          resolvedPlayerName.as("playerName"),
          "p.sourceIdentity",
          "p.wins",
          "p.losses",
          "p.draws",
          "p.legendCardId",
          "lc.name as legendName",
          "lc.slug as legendSlug",
          "lmca.types as legendTypes",
          "lc.tags as legendTags",
          "lmca.domains as legendDomains",
          "p.championCardId",
          "cc.name as championName",
          "cc.slug as championSlug",
          "cmca.domains as championDomains",
          "p.deckId",
          "d.name as deckName",
          "d.shareToken",
          "p.listStatus",
        ])
    );
  }

  /** The standings rows a count reads, narrowed by the event's own fields. */
  function playersInScope(filters: MetaCountsFilters) {
    let query = db
      .selectFrom("metaEventPlayers as p")
      .innerJoin("metaEvents as me", "me.id", "p.metaEventId");
    if (filters.format !== undefined) {
      query = query.where("me.format", "=", filters.format);
    }
    if (filters.dateFrom !== undefined) {
      query = query.where("me.eventDate", ">=", filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      query = query.where("me.eventDate", "<=", filters.dateTo);
    }
    return query;
  }

  /** A blank result drops the row; it never partially prints a user id. */
  function contributorQuery() {
    const displayName = sql<string>`nullif(btrim(case
      when u.meta_credit_visibility = 'riot_id' then coalesce(nullif(btrim(u.riot_id), ''), u.name)
      else u.name
    end), '')`;
    return db
      .selectFrom("metaCredits as mc")
      .innerJoin("users as u", "u.id", "mc.userId")
      .select(["mc.metaEventId", "mc.userId"])
      .select(displayName.as("displayName"))
      .distinct()
      .where("u.metaCreditVisibility", "!=", "hidden")
      .where(sql<SqlBool>`${displayName} is not null`)
      .orderBy("displayName", "asc")
      .orderBy("mc.userId", "asc");
  }

  /** One legend's standings rows inside a scope, before any ordering or select. */
  function legendFinishQuery(legendCardId: string, scope: MetaScopeFilters) {
    let query = db
      .selectFrom("metaEventPlayers as p")
      .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
      .leftJoin("decks as d", "d.id", "p.deckId")
      .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
      .where("p.legendCardId", "=", legendCardId);
    for (const condition of scopeConditions(scope)) {
      query = query.where(condition);
    }
    return query;
  }

  /** Those rows with the columns a legend's page prints. */
  function legendFinishRows(legendCardId: string, scope: MetaScopeFilters) {
    return legendFinishQuery(legendCardId, scope).select([
      "p.id as playerId",
      "p.rank",
      "p.rankIsTier",
      resolvedPlayerName.as("playerName"),
      "p.sourceIdentity",
      "p.wins",
      "p.losses",
      "p.draws",
      "d.shareToken",
      "p.listStatus",
      "me.slug as eventSlug",
      "me.name as eventName",
      "me.eventDate",
      "me.format as eventFormat",
      "me.tier as eventTier",
      "me.country as eventCountry",
      "me.playerCount as eventPlayerCount",
    ]);
  }

  /** Writes the `decks` row and its cards, and points the standings row at it. */
  async function insertDeckForPlayer(
    trx: Kysely<Database>,
    playerId: string,
    deck: MetaArchivedDeckInput,
    shareToken: string | null,
  ): Promise<string> {
    const row = await trx
      .insertInto("decks")
      .values({
        userId: META_ARCHIVE_USER_ID,
        name: deck.name,
        description: null,
        format: deck.format,
        formatConfig: deck.formatConfig,
        // The permalink is the point of an archived deck; it is public from the
        // moment it exists, never through a later share toggle.
        isPublic: true,
        shareToken,
        links: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("deckCards")
      .values(mergeDeckCards(deck.cards).map((card) => ({ deckId: row.id, ...card })))
      .execute();

    await trx
      .updateTable("metaEventPlayers")
      .set({ deckId: row.id, listStatus: deck.listStatus })
      .where("id", "=", playerId)
      .execute();

    return row.id;
  }

  return {
    /**
     * The archived events inside an inclusive event-date window, unpaged. The
     * public `/meta` lists are the only callers; anything the admin pages or
     * narrows by more than the date goes through {@link listEvents} instead.
     */
    allEvents(range: MetaDeckDateRange = {}): Promise<MetaEventWithCounts[]> {
      let query = eventQuery();
      if (range.from !== undefined) {
        query = query.where("metaEvents.eventDate", ">=", range.from);
      }
      if (range.to !== undefined) {
        query = query.where("metaEvents.eventDate", "<=", range.to);
      }
      return query.orderBy("eventDate", "desc").orderBy("name", "asc").execute();
    },

    async listEvents(
      filters: MetaEventFilters,
      page: { limit: number; offset: number },
      order: MetaEventOrder = {},
    ): Promise<{ rows: MetaEventWithCounts[]; total: number }> {
      let rowQuery = eventQuery()
        .orderBy(eventOrderBy(order))
        // Whole days collide constantly on the date column, so the slug breaks
        // ties and keeps a page boundary from repeating or skipping a row.
        .orderBy("metaEvents.slug", "asc")
        .limit(page.limit)
        .offset(page.offset);
      let countQuery = eventQuery()
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as("total"));

      if (filters.search !== undefined && filters.search.trim() !== "") {
        const pattern = `%${filters.search.trim()}%`;
        const matches = (eb: ExpressionBuilder<Database, "metaEvents">) =>
          eb.or([
            eb("metaEvents.name", "ilike", pattern),
            eb("metaEvents.organizer", "ilike", pattern),
          ]);
        rowQuery = rowQuery.where(matches);
        countQuery = countQuery.where(matches);
      }
      if (filters.format !== undefined) {
        rowQuery = rowQuery.where("metaEvents.format", "=", filters.format);
        countQuery = countQuery.where("metaEvents.format", "=", filters.format);
      }
      if (filters.source !== undefined) {
        rowQuery = rowQuery.where(sourcedBy(filters.source));
        countQuery = countQuery.where(sourcedBy(filters.source));
      }
      if (filters.dateFrom !== undefined) {
        rowQuery = rowQuery.where("metaEvents.eventDate", ">=", filters.dateFrom);
        countQuery = countQuery.where("metaEvents.eventDate", ">=", filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        rowQuery = rowQuery.where("metaEvents.eventDate", "<=", filters.dateTo);
        countQuery = countQuery.where("metaEvents.eventDate", "<=", filters.dateTo);
      }
      if (filters.incompleteStandings === true) {
        rowQuery = rowQuery.where(standingsShort);
        countQuery = countQuery.where(standingsShort);
      }
      if (filters.noDecks === true) {
        rowQuery = rowQuery.where(noDecks);
        countQuery = countQuery.where(noDecks);
      }

      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    eventBySlug(slug: string): Promise<MetaEventWithCounts | undefined> {
      return eventQuery().where("slug", "=", slug).executeTakeFirst();
    },

    eventById(id: string): Promise<MetaEventWithCounts | undefined> {
      return eventQuery().where("id", "=", id).executeTakeFirst();
    },

    /** The row's own columns, without the standings counts {@link eventById} joins for. */
    eventRowById(id: string): Promise<MetaEventRow | undefined> {
      return db.selectFrom("metaEvents").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** Every event's id and current tier, for the tier scan. */
    allEventTiers(): Promise<{ id: string; tier: MetaEventTier }[]> {
      return db.selectFrom("metaEvents").select(["id", "tier"]).execute();
    },

    /** Every citation there is, for a pass that walks the whole archive. */
    allSources(): Promise<MetaEventSourceRow[]> {
      return db.selectFrom("metaEventSources").selectAll().execute();
    },

    /**
     * Every podium (rank ≤ 3) standings row of the named events, best first.
     *
     * A source that published two of the same place gets both rows, in a stable
     * alphabetical order: which of a tie is "the" winner is not the archive's
     * call to make, and picking one would print a fact nobody published.
     */
    topFinishesForEvents(eventIds: readonly string[]): Promise<MetaEventPlayerWithEventRow[]> {
      if (eventIds.length === 0) {
        return Promise.resolve([]);
      }
      return playerQuery()
        .select("p.metaEventId")
        .where("p.metaEventId", "in", [...eventIds])
        .where("p.rank", "<=", 3)
        .orderBy("p.metaEventId")
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc")
        .execute();
    },

    /**
     * The newest additions to the archive, one row per burst (one kind, one
     * event, one UTC day), newest first.
     *
     * Deck and standings bursts on the UTC day the event was created are
     * folded into that event's `event-added` row, not reported separately.
     */
    async recentActivity(limit: number): Promise<MetaActivityRow[]> {
      const eventDay = sql`(e.created_at at time zone 'UTC')::date`;

      const [events, deckBursts, resultBursts] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "name", "createdAt"])
          .orderBy("createdAt", "desc")
          .limit(limit)
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .innerJoin("metaEvents as e", "e.id", "p.metaEventId")
          .select((eb) => [
            "e.slug as eventSlug",
            "e.name as eventName",
            eb.fn.countAll<string>().as("count"),
            eb.fn.max("d.createdAt").as("occurredAt"),
          ])
          .where(sql`(d.created_at at time zone 'UTC')::date`, ">", eventDay)
          .groupBy(["e.slug", "e.name", sql`(d.created_at at time zone 'UTC')::date`])
          .orderBy(sql`max(d.created_at)`, "desc")
          .limit(limit)
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("metaEvents as e", "e.id", "p.metaEventId")
          .select((eb) => [
            "e.slug as eventSlug",
            "e.name as eventName",
            eb.fn.countAll<string>().as("count"),
            eb.fn.max("p.createdAt").as("occurredAt"),
          ])
          .where(sql`(p.created_at at time zone 'UTC')::date`, ">", eventDay)
          .groupBy(["e.slug", "e.name", sql`(p.created_at at time zone 'UTC')::date`])
          .orderBy(sql`max(p.created_at)`, "desc")
          .limit(limit)
          .execute(),
      ]);

      const rows: MetaActivityRow[] = [
        ...events.map((row): MetaActivityRow => ({
          kind: "event-added",
          occurredAt: row.createdAt,
          count: null,
          eventSlug: row.slug,
          eventName: row.name,
        })),
        ...deckBursts.map((row): MetaActivityRow => ({
          kind: "decks-added",
          occurredAt: row.occurredAt,
          count: Number(row.count),
          eventSlug: row.eventSlug,
          eventName: row.eventName,
        })),
        ...resultBursts.map((row): MetaActivityRow => ({
          kind: "results-added",
          occurredAt: row.occurredAt,
          count: Number(row.count),
          eventSlug: row.eventSlug,
          eventName: row.eventName,
        })),
      ];
      return rows
        .toSorted((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
        .slice(0, limit);
    },

    /** The whole field, deckless entries included, best finish first. */
    standingsForEvent(eventId: string): Promise<MetaEventPlayerRow[]> {
      return playerQuery()
        .where("p.metaEventId", "=", eventId)
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc")
        .execute();
    },

    playerById(id: string): Promise<MetaEventPlayerRow | undefined> {
      return playerQuery().where("p.id", "=", id).executeTakeFirst();
    },

    /** Which event a standings row sits under, for a caller holding only its id. */
    async eventIdForPlayer(playerId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("metaEventPlayers")
        .select("metaEventId")
        .where("id", "=", playerId)
        .executeTakeFirst();
      return row?.metaEventId;
    },

    /**
     * The standings rows as stored, without the display resolution
     * {@link standingsForEvent} applies.
     *
     * Promotion needs the raw columns: `playerName` NULL where the source names
     * the player, and the source key it reconciles identity on. The read query
     * coalesces both away, which is right for rendering and wrong for deciding
     * whether a row already exists.
     */
    rawStandingsForEvent(eventId: string): Promise<Selectable<MetaEventPlayersTable>[]> {
      return db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("rank", "asc")
        .execute();
    },

    /**
     * Each standings row's rendered name beside its rank, for matching an
     * event-anchored overlay onto the row it describes. The name resolution is
     * the same one every read surface uses, so an overlay matches what the
     * submitter actually saw.
     */
    async standingsNamesForEvent(
      eventId: string,
    ): Promise<{ id: string; name: string; rank: number }[]> {
      return await db
        .selectFrom("metaEventPlayers as p")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select(["p.id", "p.rank"])
        .select(resolvedPlayerName.as("name"))
        .where("p.metaEventId", "=", eventId)
        .execute();
    },

    /** A batch of full event rows, for list surfaces that would otherwise loop {@link eventById}. */
    async eventsByIds(ids: readonly string[]): Promise<MetaEventWithCounts[]> {
      if (ids.length === 0) {
        return [];
      }
      return await eventQuery()
        .where("metaEvents.id", "in", [...ids])
        .execute();
    },

    /** The event's phase structure in play order; empty when no source published it. */
    phasesForEvent(eventId: string): Promise<MetaEventPhaseRow[]> {
      return db
        .selectFrom("metaEventPhases")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("phaseOrder", "asc")
        .execute();
    },

    /**
     * Replaces one event's phases. The source republishes the whole list on
     * every fetch and nothing references a phase row, so a wholesale replace is
     * both correct and cheaper than reconciling three rows.
     */
    async replaceEventPhases(eventId: string, rows: NewMetaEventPhase[]): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("metaEventPhases").where("metaEventId", "=", eventId).execute();
        if (rows.length > 0) {
          await trx.insertInto("metaEventPhases").values(rows).execute();
        }
      });
    },

    /** Round-by-round results in play order; empty when no source carried them. */
    matchesForEvent(eventId: string): Promise<MetaEventMatchRow[]> {
      return db
        .selectFrom("metaEventMatches")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("phaseOrder", "asc")
        .orderBy("roundNumber", "asc")
        .orderBy("tableNumber", "asc")
        .orderBy("id", "asc")
        .execute();
    },

    /**
     * Writes materialized matches, upserting on the source's own match id.
     *
     * @returns Each written row's live id beside its source id. Postgres
     * returns `ON CONFLICT` rows in arbitrary order; pair them by key, not
     * position.
     */
    async upsertEventMatches(rows: NewMetaEventMatch[]): Promise<UpsertedMetaEventMatch[]> {
      if (rows.length === 0) {
        return [];
      }
      // Batched: a 1000-player Swiss binds past one statement's parameter
      // ceiling. Wrapped in a transaction so readers see a whole
      // materialization or none of it.
      return await db.transaction().execute(async (trx) => {
        const written: UpsertedMetaEventMatch[] = [];
        for (const batch of rowBatches(rows)) {
          written.push(
            ...(await trx
              .insertInto("metaEventMatches")
              .values(batch)
              .onConflict((oc) =>
                // The conflict target must match the partial index's
                // predicate; this path only writes rows with a source id.
                oc
                  .columns(["metaEventId", "sourceMatchId"])
                  .where("sourceMatchId", "is not", null)
                  .doUpdateSet((eb) => ({
                    phaseOrder: eb.ref("excluded.phaseOrder"),
                    roundNumber: eb.ref("excluded.roundNumber"),
                    sourceRoundId: eb.ref("excluded.sourceRoundId"),
                    tableNumber: eb.ref("excluded.tableNumber"),
                    isBye: eb.ref("excluded.isBye"),
                    isDraw: eb.ref("excluded.isDraw"),
                    player1Id: eb.ref("excluded.player1Id"),
                    player2Id: eb.ref("excluded.player2Id"),
                    winnerId: eb.ref("excluded.winnerId"),
                    gamesWonP1: eb.ref("excluded.gamesWonP1"),
                    gamesWonP2: eb.ref("excluded.gamesWonP2"),
                  })),
              )
              .returning(["id", "sourceMatchId"])
              .execute()),
          );
        }
        return written;
      });
    },

    /**
     * The archived decks a browser is asking for, newest event first. Only rows
     * with a list appear: a standings-only entry has no deck to browse.
     *
     * The scope's facets narrow the rows before the cap does, so a capped
     * request fills its grid with rows that are already in scope.
     *
     * `total` counts the whole match, so a capped request can still say how much
     * of what it found it is showing.
     */
    async allDeckSummaries(
      filters: MetaDeckFilters = {},
    ): Promise<{ rows: MetaDeckSummaryRow[]; total: number }> {
      let query = db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("decks as d", "d.id", "p.deckId")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("cards as cc", "cc.id", "p.championCardId")
        .leftJoin("mvCardAggregates as lmca", "lmca.cardId", "p.legendCardId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select([
          "p.id as playerId",
          "p.deckId",
          "d.shareToken",
          "p.listStatus",
          "d.name as deckName",
          "d.format as deckFormat",
          "p.legendCardId",
          "lc.name as legendName",
          "lc.slug as legendSlug",
          "lmca.types as legendTypes",
          "lc.tags as legendTags",
          "p.championCardId",
          "cc.name as championName",
          resolvedPlayerName.as("playerName"),
          "p.sourceIdentity",
          "p.rank",
          "p.rankIsTier",
          "p.wins",
          "p.losses",
          "p.draws",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
          "me.tier as eventTier",
          "me.country as eventCountry",
        ])
        // A deck is minted with its permalink, so this only ever narrows the
        // type; a token cleared by hand would leave a row with no page anyway.
        .where("d.shareToken", "is not", null)
        .$narrowType<{ deckId: string; shareToken: string }>();
      for (const condition of scopeConditions(filters)) {
        query = query.where(condition);
      }
      if (filters.legend !== undefined) {
        query = query.where("p.legendCardId", "=", filters.legend);
      }
      if (filters.player !== undefined) {
        query = query.where(foldedPlayerIdentity, "=", filters.player);
      }

      const countQuery = query.clearSelect().select((eb) => eb.fn.countAll<string>().as("total"));
      let rowQuery = query
        .orderBy("me.eventDate", "desc")
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc");
      if (filters.limit !== undefined) {
        rowQuery = rowQuery.limit(filters.limit);
      }

      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    /**
     * Every legend the archive holds a standings row for, with the count of
     * lists filed under it.
     *
     * Grouped by the card, not the champion: two legends of one champion are
     * two entries.
     */
    archiveLegends(): Promise<MetaArchiveLegendRow[]> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("mvCardAggregates as mca", "mca.cardId", "lc.id")
        .select(["lc.id as cardId", "lc.name", "lc.slug", "mca.types", "lc.tags", "mca.domains"])
        .groupBy(["lc.id", "lc.name", "lc.slug", "mca.types", "lc.tags", "mca.domains"])
        .orderBy("lc.name", "asc")
        .execute();
    },

    /**
     * Every legend's standings rows folded per event, for the index's scoped
     * counts and best-finish line. One row per (legend, event) pair, newest
     * event first.
     */
    archiveLegendEventRecords(): Promise<MetaLegendEventRecordRow[]> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .select([
          sql<string>`p.legend_card_id`.as("legendCardId"),
          "me.slug as eventSlug",
          sql<number>`min(p.rank)::int`.as("bestRank"),
          // The flag belonging to the best-ranked row, not an aggregate of all.
          sql<boolean>`(array_agg(p.rank_is_tier order by p.rank asc))[1]`.as("rankIsTier"),
          sql<number>`count(*)::int`.as("finishes"),
          // Mirrors what `allDeckSummaries` yields for this legend: a row with
          // no permalink has no page for the count to promise.
          sql<number>`count(*) filter (where d.share_token is not null)::int`.as("decklists"),
          sql<boolean>`bool_or(p.rank = 1)`.as("won"),
        ])
        .where("p.legendCardId", "is not", null)
        .groupBy(["p.legendCardId", "me.slug", "me.eventDate"])
        .orderBy("me.eventDate", "desc")
        .orderBy("me.slug", "asc")
        .execute();
    },

    /**
     * One page of a legend's record inside a scope, newest event first and the
     * better placing first inside one day.
     *
     * Every row is a published standings row. The archive computes nothing from
     * them here beyond their order.
     */
    async finishesForLegend(
      legendCardId: string,
      scope: MetaScopeFilters = {},
      page?: { limit: number; offset: number },
    ): Promise<{ rows: MetaLegendFinishRow[]; total: number }> {
      let rowQuery = legendFinishRows(legendCardId, scope)
        .orderBy("me.eventDate", "desc")
        .orderBy("p.rank", "asc")
        .orderBy("me.name", "asc");
      if (page !== undefined) {
        rowQuery = rowQuery.limit(page.limit).offset(page.offset);
      }
      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        legendFinishQuery(legendCardId, scope)
          .select((eb) => eb.fn.countAll<string>().as("total"))
          .executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    /**
     * A legend's high-water marks in scope: best placing first, the most recent
     * of an equal placing ahead of older ones.
     */
    bestFinishesForLegend(
      legendCardId: string,
      scope: MetaScopeFilters,
      limit: number,
    ): Promise<MetaLegendFinishRow[]> {
      return legendFinishRows(legendCardId, scope)
        .orderBy("p.rank", "asc")
        .orderBy("me.eventDate", "desc")
        .orderBy("me.name", "asc")
        .limit(limit)
        .execute();
    },

    /**
     * One legend's headline numbers in scope. Wins count events and decklists
     * count permalinks, never rows: a source that published a shared first place
     * files two rows at one event, and counting rows would report the legend
     * winning it twice.
     */
    legendRecordCounts(
      legendCardId: string,
      scope: MetaScopeFilters = {},
    ): Promise<MetaLegendRecordCounts> {
      return legendFinishQuery(legendCardId, scope)
        .select([
          sql<number>`count(distinct me.id) filter (where p.rank = 1)::int`.as("wins"),
          sql<number>`count(*)::int`.as("finishes"),
          sql<number>`count(distinct d.share_token)::int`.as("decklists"),
        ])
        .executeTakeFirstOrThrow();
    },

    finishesForPlayer(key: string): Promise<MetaPlayerFinishRow[]> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .leftJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("mvCardAggregates as lmca", "lmca.cardId", "p.legendCardId")
        .select([
          "p.id as playerId",
          resolvedPlayerName.as("playerName"),
          "p.rank",
          "p.rankIsTier",
          "p.wins",
          "p.losses",
          "p.draws",
          "d.shareToken",
          "p.listStatus",
          "p.legendCardId",
          "lc.name as legendName",
          "lc.slug as legendSlug",
          "lmca.types as legendTypes",
          "lc.tags as legendTags",
          "lmca.domains as legendDomains",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
          "me.tier as eventTier",
          "me.country as eventCountry",
          "me.playerCount as eventPlayerCount",
        ])
        .where(foldedPlayerIdentity, "=", key)
        .orderBy("me.eventDate", "desc")
        .orderBy("p.rank", "asc")
        .execute();
    },

    /**
     * What every archived list holds, for the browser's collection overlay.
     * Unpaginated like {@link allDeckSummaries} and for the same reason.
     * The sideboard stays its own row; every other zone is summed together.
     */
    async allDeckCards(range: MetaDeckDateRange = {}): Promise<MetaDeckCardRow[]> {
      const isSideboard = sql<boolean>`dc.zone = ${sql.lit(WellKnown.deckZone.SIDEBOARD)}`;
      const { from, to } = range;
      const rows = await db
        .selectFrom("deckCards as dc")
        .select(({ fn }) => [
          "dc.deckId",
          "dc.cardId",
          fn.sum<string>("dc.quantity").as("quantity"),
          isSideboard.as("sideboard"),
        ])
        // `exists`, not a join: a join would double quantities if
        // `uq_meta_event_players_deck` ever allows more than one standings
        // row per deck.
        .where((eb) => {
          if (from === undefined && to === undefined) {
            return eb.exists(
              eb
                .selectFrom("metaEventPlayers as p")
                .select(sql.lit(1).as("x"))
                .whereRef("p.deckId", "=", "dc.deckId"),
            );
          }
          let scoped = eb
            .selectFrom("metaEventPlayers as p")
            .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
            .select(sql.lit(1).as("x"))
            .whereRef("p.deckId", "=", "dc.deckId");
          if (from !== undefined) {
            scoped = scoped.where("me.eventDate", ">=", from);
          }
          if (to !== undefined) {
            scoped = scoped.where("me.eventDate", "<=", to);
          }
          return eb.exists(scoped);
        })
        .groupBy(["dc.deckId", "dc.cardId", isSideboard])
        .orderBy("dc.deckId")
        .orderBy("dc.cardId")
        .orderBy(isSideboard)
        .execute();
      return rows.map((row) => ({
        deckId: row.deckId,
        cardId: row.cardId,
        quantity: Number(row.quantity),
        sideboard: row.sideboard,
      }));
    },

    /**
     * Guard for the share-token rotate path: an archived deck's token is its
     * permalink, so rotation must be refused while a standings row points at it.
     */
    async isMetaDeck(deckId: string): Promise<boolean> {
      const row = await db
        .selectFrom("metaEventPlayers")
        .select("id")
        .where("deckId", "=", deckId)
        .executeTakeFirst();
      return row !== undefined;
    },

    contextForDeck(deckId: string): Promise<MetaDeckContextRow | undefined> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select([
          "p.id as playerId",
          "p.listStatus",
          resolvedPlayerName.as("playerName"),
          "p.sourceIdentity",
          "p.rank",
          "p.rankIsTier",
          "p.wins",
          "p.losses",
          "p.draws",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
          "me.tier as eventTier",
          "me.country as eventCountry",
          "me.playerCount as eventPlayerCount",
        ])
        .where("p.deckId", "=", deckId)
        .executeTakeFirst();
    },

    /**
     * The archive's side of the sync funnel: how many events it holds, how many
     * of those have standings at all, how many carry at least one decklist, and
     * how many decks that adds up to.
     */
    async archiveOverview(provider?: string): Promise<{
      events: number;
      eventsWithStandings: number;
      eventsWithDecklists: number;
      decks: number;
    }> {
      // When a provider is given, count only events that provider's citation
      // links, so the per-source funnel's "Published" is the archive this source
      // fed. The decks count follows the same restriction.
      let base = db.selectFrom("metaEvents as e");
      if (provider !== undefined) {
        base = base.where((eb) =>
          eb.exists(
            eb
              .selectFrom("metaEventSources as src")
              .whereRef("src.metaEventId", "=", "e.id")
              .where("src.provider", "=", provider),
          ),
        );
      }
      const row = await base
        .select((eb) => [
          eb.fn.countAll<string>().as("events"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p where p.meta_event_id = e.id
          ))`.as("eventsWithStandings"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p
            where p.meta_event_id = e.id and p.deck_id is not null
          ))`.as("eventsWithDecklists"),
          // A deck belongs to this slice when its event is in the filtered set.
          // The correlated exists keeps the provider restriction on the count.
          provider === undefined
            ? sql<string>`(select count(*) from meta_event_players p where p.deck_id is not null)`.as(
                "decks",
              )
            : sql<string>`(
                select count(*) from meta_event_players p
                where p.deck_id is not null and exists (
                  select 1 from meta_event_sources src
                  where src.meta_event_id = p.meta_event_id and src.provider = ${provider}
                )
              )`.as("decks"),
        ])
        .executeTakeFirstOrThrow();
      return {
        events: Number(row.events),
        eventsWithStandings: Number(row.eventsWithStandings),
        eventsWithDecklists: Number(row.eventsWithDecklists),
        decks: Number(row.decks),
      };
    },

    /** Every standings row in scope. */
    async playerCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Rows whose main deck the archive holds. `partial` counts exactly like
     * `full` — a partial list's main deck is complete by definition.
     */
    async deckCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .where("p.listStatus", "!=", "none")
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Events per tier across the whole archive, every tier present whether or
     * not an event sits at it. Deliberately unscoped: this is the archive's own
     * size, which a page prints beside a scoped number.
     */
    async eventTierCounts(): Promise<MetaEventTierCounts> {
      const rows = await db
        .selectFrom("metaEvents")
        .select((eb) => ["tier", eb.cast<number>(eb.fn.countAll(), "integer").as("count")])
        .groupBy("tier")
        .execute();
      const counts: MetaEventTierCounts = { premier: 0, competitive: 0, local: 0 };
      for (const row of rows) {
        counts[row.tier as MetaEventTier] = row.count;
      }
      return counts;
    },

    adminPlayersForEvent(eventId: string): Promise<AdminMetaPlayerRow[]> {
      return playerQuery()
        .select((eb) => [
          "d.format as deckFormat",
          eb
            .selectFrom("deckCards as dc")
            .select((inner) =>
              inner.cast<number>(inner.fn.sum("dc.quantity"), "integer").as("cardCount"),
            )
            .whereRef("dc.deckId", "=", "p.deckId")
            .as("cardCount"),
        ])
        .where("p.metaEventId", "=", eventId)
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc")
        .execute()
        .then((rows) => rows.map((row) => ({ ...row, cardCount: row.cardCount ?? 0 })));
    },

    /** The live rows a candidate pipeline diffs against, by standings-row id. */
    livePlayersByIds(ids: string[]): Promise<LiveMetaPlayerRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return (
        db
          .selectFrom("metaEventPlayers as p")
          .leftJoin("decks as d", "d.id", "p.deckId")
          // Resolved, so a diff against a candidate's own name does not report a
          // change on every pass for a row filed under the source's identity.
          .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
          .select([
            "p.id",
            "p.metaEventId",
            "p.rank",
            "p.rankIsTier",
            resolvedPlayerName.as("playerName"),
            "p.wins",
            "p.losses",
            "p.draws",
            "p.legendCardId",
            "p.championCardId",
            "p.listStatus",
            "p.deckId",
            "d.name as deckName",
            "d.shareToken",
          ])
          .where("p.id", "in", ids)
          .execute()
      );
    },

    async createEvent(input: MetaEventInput): Promise<MetaEventWithCounts> {
      const row = await db
        .insertInto("metaEvents")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...row, playerRowCount: 0, deckCount: 0 };
    },

    /**
     * Writes the reclassify pass's per-field decisions in one statement. A
     * field left out of the patch must keep its live value, not be
     * overwritten with null.
     *
     * @returns How many rows the statement touched.
     */
    async setEventClassifications(rows: readonly MetaEventClassificationPatch[]): Promise<number> {
      if (rows.length === 0) {
        return 0;
      }
      const values = sql.join(
        rows.map(
          (row) => sql`(
            ${row.id}::uuid,
            ${row.tier ?? null}::text,
            ${row.country !== undefined}::boolean,
            ${row.country ?? null}::text,
            ${row.location !== undefined}::boolean,
            ${row.location ?? null}::text
          )`,
        ),
      );
      const result = await sql`
        update meta_events as m
           set tier = coalesce(v.tier, m.tier),
               country = case when v.set_country then v.country else m.country end,
               location = case when v.set_location then v.location else m.location end
          from (values ${values})
            as v(id, tier, set_country, country, set_location, location)
         where m.id = v.id
      `.execute(db);
      return Number(result.numAffectedRows ?? 0n);
    },

    /** The caller has already narrowed the body to real columns via `buildPatchUpdates`. */
    async updateEvent(id: string, updates: Updateable<MetaEventsTable>): Promise<boolean> {
      const result = await db
        .updateTable("metaEvents")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Deleting the event cascades its standings rows, releasing the RESTRICT
     * on their decks. Decks are then deleted explicitly or they would
     * survive under the synthetic owner.
     */
    deleteEvent(id: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const deckRows = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("metaEventId", "=", id)
          .where("deckId", "is not", null)
          .$narrowType<{ deckId: string }>()
          .execute();

        const result = await trx.deleteFrom("metaEvents").where("id", "=", id).executeTakeFirst();
        if ((result.numDeletedRows ?? 0n) === 0n) {
          return false;
        }

        if (deckRows.length > 0) {
          await trx
            .deleteFrom("decks")
            .where(
              "id",
              "in",
              deckRows.map((row) => row.deckId),
            )
            .execute();
        }
        return true;
      });
    },

    /**
     * `shareToken` is supplied by the caller (wrapped in `withUniqueShareToken`)
     * because the retry has to re-run the whole transaction, not just the
     * insert that collided. It is null exactly when `input.deck` is, since a
     * standings-only entry has no page to address.
     */
    createPlayer(
      input: MetaEventPlayerInput,
      shareToken: string | null,
    ): Promise<{ metaEventPlayerId: string; deckId: string | null } | undefined> {
      return db.transaction().execute(async (trx) => {
        const event = await trx
          .selectFrom("metaEvents")
          .select("id")
          .where("id", "=", input.eventId)
          .executeTakeFirst();
        if (!event) {
          return;
        }

        const player = await trx
          .insertInto("metaEventPlayers")
          .values({
            metaEventId: input.eventId,
            rank: input.rank,
            rankIsTier: input.rankIsTier,
            playerName: input.playerName,
            uvsgamesPlayerId: input.uvsgamesPlayerId ?? null,
            wins: input.wins,
            losses: input.losses,
            draws: input.draws,
            matchPoints: input.matchPoints ?? null,
            opponentMatchWinPct: input.opponentMatchWinPct ?? null,
            gameWinPct: input.gameWinPct ?? null,
            opponentGameWinPct: input.opponentGameWinPct ?? null,
            entryStatus: input.entryStatus ?? null,
            legendCardId: input.legendCardId,
            championCardId: input.championCardId,
            sourceIdentity: input.sourceIdentity ?? null,
            mintedByOverlayId: input.mintedByOverlayId ?? null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        const deckId =
          input.deck === null
            ? null
            : await insertDeckForPlayer(trx, player.id, input.deck, shareToken);

        return { metaEventPlayerId: player.id, deckId };
      });
    },

    async updatePlayer(id: string, patch: MetaEventPlayerPatch): Promise<boolean> {
      const updates: Updateable<MetaEventPlayersTable> = {};
      if (patch.rank !== undefined) {
        updates.rank = patch.rank;
      }
      if (patch.rankIsTier !== undefined) {
        updates.rankIsTier = patch.rankIsTier;
      }
      if (patch.uvsgamesPlayerId !== undefined) {
        updates.uvsgamesPlayerId = patch.uvsgamesPlayerId;
      }
      if (patch.playerName !== undefined) {
        updates.playerName = patch.playerName;
      }
      if (patch.wins !== undefined) {
        updates.wins = patch.wins;
      }
      if (patch.losses !== undefined) {
        updates.losses = patch.losses;
      }
      if (patch.draws !== undefined) {
        updates.draws = patch.draws;
      }
      if (patch.matchPoints !== undefined) {
        updates.matchPoints = patch.matchPoints;
      }
      if (patch.opponentMatchWinPct !== undefined) {
        updates.opponentMatchWinPct = patch.opponentMatchWinPct;
      }
      if (patch.gameWinPct !== undefined) {
        updates.gameWinPct = patch.gameWinPct;
      }
      if (patch.opponentGameWinPct !== undefined) {
        updates.opponentGameWinPct = patch.opponentGameWinPct;
      }
      if (patch.entryStatus !== undefined) {
        updates.entryStatus = patch.entryStatus;
      }
      if (patch.legendCardId !== undefined) {
        updates.legendCardId = patch.legendCardId;
      }
      if (patch.championCardId !== undefined) {
        updates.championCardId = patch.championCardId;
      }
      if (patch.sourceIdentity !== undefined) {
        updates.sourceIdentity = patch.sourceIdentity;
      }

      if (Object.keys(updates).length === 0) {
        const row = await db
          .selectFrom("metaEventPlayers")
          .select("id")
          .where("id", "=", id)
          .executeTakeFirst();
        return row !== undefined;
      }

      const result = await db
        .updateTable("metaEventPlayers")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * The same patch as {@link updatePlayer}, for many rows in one statement.
     * Grouped by which columns each patch carries, so an omitted column is never written null.
     */
    async updatePlayers(updates: readonly MetaEventPlayerUpdate[]): Promise<void> {
      const groups = Map.groupBy(updates, (update) =>
        PLAYER_PATCH_COLUMNS.filter(({ key }) => update[key] !== undefined)
          .map(({ key }) => key)
          .join(","),
      );

      for (const group of groups.values()) {
        const [sample] = group;
        if (!sample) {
          continue;
        }
        const columns = PLAYER_PATCH_COLUMNS.filter(({ key }) => sample[key] !== undefined);
        if (columns.length === 0) {
          continue;
        }
        const rows = group.map((update) =>
          Object.fromEntries([
            ["id", update.id],
            ...columns.map(({ key, column }) => [column, update[key]]),
          ]),
        );
        const assignments = columns.map(({ column }) => `"${column}" = v."${column}"`).join(", ");
        const record = ['"id" uuid', ...columns.map(({ column, type }) => `"${column}" ${type}`)];
        await sql`
          update ${sql.table("metaEventPlayers")} as p
          set ${sql.raw(assignments)}
          from jsonb_to_recordset(${rows}::jsonb)
            as v(${sql.raw(record.join(", "))})
          where p.id = v."id"
        `.execute(db);
      }
    },

    /** Every archived deck the event's standings rows point at, three queries for the whole field. */
    async deckStatesForEvent(eventId: string): Promise<Map<string, MetaStoredPlayerDeck>> {
      const players = await db
        .selectFrom("metaEventPlayers")
        .select(["id", "deckId", "listStatus"])
        .where("metaEventId", "=", eventId)
        .where("deckId", "is not", null)
        .execute();
      if (players.length === 0) {
        return new Map();
      }

      const deckIds = players.map((player) => player.deckId as string);
      const decks = await db
        .selectFrom("decks")
        .select(["id", "name", "format"])
        .where("id", "in", deckIds)
        .execute();
      const cards = await db
        .selectFrom("deckCards")
        .select(["deckId", "cardId", "zone", "quantity", "preferredPrintingId"])
        .where("deckId", "in", deckIds)
        .execute();

      const byDeck = new Map(decks.map((deck) => [deck.id, deck]));
      const cardsByDeck = Map.groupBy(cards, (card) => card.deckId);
      const states = new Map<string, MetaStoredPlayerDeck>();
      for (const player of players) {
        const deck = byDeck.get(player.deckId as string);
        if (deck === undefined) {
          continue;
        }
        states.set(player.id, {
          deckId: deck.id,
          listStatus: player.listStatus,
          name: deck.name,
          format: deck.format,
          cards: cardsByDeck.get(deck.id) ?? [],
        });
      }
      return states;
    },

    /**
     * Attaches a list, or replaces the one already there.
     *
     * `shareToken` is written only when the deck is created; a replacement
     * keeps the token published links already use. `preserveName` keeps the
     * existing name across a re-promote. An unchanged card list is left
     * alone, not deleted and reinserted.
     */
    setPlayerDeck(
      playerId: string,
      deck: MetaArchivedDeckInput,
      shareToken: string,
      options?: { preserveName?: boolean },
    ): Promise<{ deckId: string } | undefined> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select(["deckId", "listStatus"])
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return;
        }

        if (player.deckId === null) {
          const deckId = await insertDeckForPlayer(trx, playerId, deck, shareToken);
          return { deckId };
        }

        const current = await trx
          .selectFrom("decks")
          .select(["name", "format", "formatConfig"])
          .where("id", "=", player.deckId)
          .executeTakeFirst();
        const name = options?.preserveName === true ? (current?.name ?? deck.name) : deck.name;
        if (current === undefined || current.name !== name || current.format !== deck.format) {
          await trx
            .updateTable("decks")
            .set({
              name,
              format: deck.format,
              formatConfig: deck.formatConfig,
              updatedAt: sql`now()`,
            })
            .where("id", "=", player.deckId)
            .execute();
        }

        const existing = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", player.deckId)
          .execute();
        const incoming = mergeDeckCards(deck.cards);
        if (!sameDeckCards(existing, incoming)) {
          await trx.deleteFrom("deckCards").where("deckId", "=", player.deckId).execute();
          await trx
            .insertInto("deckCards")
            .values(incoming.map((card) => ({ deckId: player.deckId as string, ...card })))
            .execute();
        }
        if (player.listStatus !== deck.listStatus) {
          await trx
            .updateTable("metaEventPlayers")
            .set({ listStatus: deck.listStatus })
            .where("id", "=", playerId)
            .execute();
        }

        return { deckId: player.deckId };
      });
    },

    async renamePlayerDeck(playerId: string, name: string): Promise<boolean> {
      const player = await db
        .selectFrom("metaEventPlayers")
        .select("deckId")
        .where("id", "=", playerId)
        .executeTakeFirst();
      if (!player || player.deckId === null) {
        return false;
      }
      await db
        .updateTable("decks")
        .set({ name, updatedAt: sql`now()` })
        .where("id", "=", player.deckId)
        .execute();
      return true;
    },

    /**
     * Detaches and deletes a standings row's list. The reference is cleared
     * first because `meta_event_players.deck_id` is ON DELETE RESTRICT: a
     * standings row must never disappear because someone removed a decklist.
     */
    clearPlayerDeck(playerId: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return false;
        }
        if (player.deckId === null) {
          return true;
        }
        await trx
          .updateTable("metaEventPlayers")
          .set({ deckId: null, listStatus: "none" })
          .where("id", "=", playerId)
          .execute();
        await trx.deleteFrom("decks").where("id", "=", player.deckId).execute();
        return true;
      });
    },

    async orphanMintedPlayerIds(metaEventId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEventPlayerOverlays as o", "o.id", "p.mintedByOverlayId")
        .select("p.id")
        .where("p.metaEventId", "=", metaEventId)
        .where((eb) =>
          eb.or([
            eb("o.status", "=", "rejected"),
            sql<boolean>`o.meta_event_player_id IS DISTINCT FROM p.id`,
          ]),
        )
        .execute();
      return rows.map((row) => row.id);
    },

    async mintedPlayerCounts(overlayIds: readonly string[]): Promise<Map<string, number>> {
      if (overlayIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("metaEventPlayers")
        .select(["mintedByOverlayId", (eb) => eb.fn.countAll<string>().as("count")])
        .where("mintedByOverlayId", "in", [...overlayIds])
        .groupBy("mintedByOverlayId")
        .$narrowType<{ mintedByOverlayId: string }>()
        .execute();
      return new Map(rows.map((row) => [row.mintedByOverlayId, Number(row.count)]));
    },

    deletePlayer(playerId: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return false;
        }
        await trx.deleteFrom("metaEventPlayers").where("id", "=", playerId).execute();
        if (player.deckId !== null) {
          await trx.deleteFrom("decks").where("id", "=", player.deckId).execute();
        }
        return true;
      });
    },

    sourcesForEvent(eventId: string): Promise<MetaEventSourceRow[]> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy(sql`provider asc nulls last`)
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** The only link between a mirror and live event; accept and promotion resolve through it. */
    sourceByKey(provider: string, externalId: string): Promise<MetaEventSourceRow | undefined> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
    },

    eventSourceById(id: string): Promise<MetaEventSourceRow | undefined> {
      return db.selectFrom("metaEventSources").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** Citations for a page of events, in one round trip for the admin list. */
    async sourcesForEvents(eventIds: readonly string[]): Promise<MetaEventSourceRow[]> {
      if (eventIds.length === 0) {
        return [];
      }
      return await db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("metaEventId", "in", [...eventIds])
        .orderBy("priority", "asc")
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** Reorders one citation, which is how a reviewer picks the winning source. */
    async setEventSourcePriority(id: string, priority: number): Promise<boolean> {
      const result = await db
        .updateTable("metaEventSources")
        .set({ priority })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    /** A second mirror on an event is cited but not read, since nothing merges a player across two mirrors yet. */
    async insertEventSource(input: MetaEventSourceInput): Promise<MetaEventSourceRow> {
      const provider = input.provider;
      const rival =
        provider !== null && MIRROR_PROVIDERS.has(provider)
          ? await db
              .selectFrom("metaEventSources")
              .select("id")
              .where("metaEventId", "=", input.metaEventId)
              .where("provider", "is not", null)
              .where("provider", "!=", provider)
              .where("provider", "in", [...MIRROR_PROVIDERS])
              .where("contributes", "=", true)
              .executeTakeFirst()
          : undefined;
      return await db
        .insertInto("metaEventSources")
        .values({ ...input, contributes: rival === undefined })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** Turns a cited-but-unread source back on, once its players are linked. */
    async setEventSourceContributes(id: string, contributes: boolean): Promise<boolean> {
      const result = await db
        .updateTable("metaEventSources")
        .set({ contributes })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0n) > 0;
    },

    async deleteEventSource(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    async deleteEventSourceByKey(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Records one contribution; a null `metaEventPlayerId` credits the event
     * itself. Idempotent on the contribution's unique index (`NULLS NOT
     * DISTINCT`, so a second event-level credit for the same user is the same
     * row), because an accept is legitimately re-run — a corrected list, a
     * re-upload — and a contributor is credited once per thing they
     * contributed, not once per click.
     */
    async insertCredit(values: {
      metaEventId: string;
      metaEventPlayerId: string | null;
      userId: string;
    }): Promise<void> {
      await db
        .insertInto("metaCredits")
        .values(values)
        .onConflict((oc) => oc.columns(["metaEventId", "userId", "metaEventPlayerId"]).doNothing())
        .execute();
    },

    /**
     * Deleting the standings row itself cascades; this is the narrower case of
     * taking a credit back while the row stays. Several people can have
     * contributed to one entry, so the unlink path always passes `userId`.
     */
    async deleteCreditsForPlayer(metaEventPlayerId: string, userId?: string): Promise<void> {
      let query = db.deleteFrom("metaCredits").where("metaEventPlayerId", "=", metaEventPlayerId);
      if (userId !== undefined) {
        query = query.where("userId", "=", userId);
      }
      await query.execute();
    },

    /**
     * Reads `users.meta_credit_visibility` live, not frozen onto the credit
     * row: opting out removes all past credits immediately.
     */
    contributorsForEvent(eventId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventId", "=", eventId).execute();
    },

    contributorsForPlayer(metaEventPlayerId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventPlayerId", "=", metaEventPlayerId).execute();
    },

    /**
     * The column lives on `users` but its meaning is this domain's: it is the
     * consent behind {@link contributorsForEvent}, and reading it anywhere
     * else would be reading a meta-archive rule out of context.
     */
    async creditVisibility(userId: string): Promise<MetaCreditVisibility | undefined> {
      const row = await db
        .selectFrom("users")
        .select("metaCreditVisibility")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.metaCreditVisibility;
    },

    /**
     * No row changes here: the public read resolves visibility live, so
     * opting in credits every past contribution and opting out removes them
     * all.
     */
    async setCreditVisibility(userId: string, visibility: MetaCreditVisibility): Promise<boolean> {
      const result = await db
        .updateTable("users")
        .set({ metaCreditVisibility: visibility })
        .where("id", "=", userId)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * `updatedAt` drives the `<lastmod>` the sitemap generator emits. Store
     * night events are excluded while the archive ramps up.
     */
    async sitemapEntries(): Promise<{
      events: { slug: string; updatedAt: string }[];
      decks: { slug: string; updatedAt: string }[];
      legends: MetaLegendSitemapRow[];
      players: { slug: string; updatedAt: string }[];
    }> {
      const [events, decks, legends, players] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "updatedAt"])
          .where("tier", "in", SITEMAP_TIERS)
          .orderBy("eventDate", "desc")
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
          .select(["d.shareToken as slug", "d.updatedAt"])
          .where("d.shareToken", "is not", null)
          .where("me.tier", "in", SITEMAP_TIERS)
          .$narrowType<{ slug: string }>()
          .execute(),
        // Unlike events and decks: dropping store-tier finishes would leave a linked page uncrawled.
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("cards as lc", "lc.id", "p.legendCardId")
          .leftJoin("mvCardAggregates as mca", "mca.cardId", "lc.id")
          .select([
            "lc.id as cardId",
            "lc.name",
            "lc.slug",
            "mca.types",
            "lc.tags",
            "mca.domains",
            sql<Date>`max(p.updated_at)`.as("updatedAt"),
          ])
          .groupBy(["lc.id", "lc.name", "lc.slug", "mca.types", "lc.tags", "mca.domains"])
          .orderBy("lc.name", "asc")
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
          .select([foldedPlayerIdentity.as("slug"), sql<Date>`max(p.updated_at)`.as("updatedAt")])
          .where("p.sourceIdentity", "is not", null)
          .where("me.tier", "in", SITEMAP_TIERS)
          .groupBy(foldedPlayerIdentity)
          .execute(),
      ]);
      const toEntry = (row: { slug: string; updatedAt: Date }) => ({
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
      });
      return {
        events: events.map((row) => toEntry(row)),
        decks: decks.map((row) => toEntry(row)),
        legends,
        players: players.map((row) => toEntry(row)),
      };
    },
  };
}
