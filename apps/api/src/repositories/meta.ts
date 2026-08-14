import { WellKnown, getOrientation } from "@openrift/shared";
import type { CardType, DeckFormatConfig, DeckZone, MetaListStatus } from "@openrift/shared/types";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database, DecksTable, MetaDecksTable, MetaEventsTable } from "../db/index.js";

/**
 * The synthetic account that owns every archived deck (ADR-014, seeded by
 * migration 235). It has no `accounts` row, so no credential or OAuth path can
 * produce a session for it — the id is safe to hardcode as the write path's
 * owner.
 */
export const META_ARCHIVE_USER_ID = "meta-archive";

/** An event row plus how many decks are archived under it. */
export type MetaEventWithCount = Selectable<MetaEventsTable> & { deckCount: number };

/**
 * One archived deck, denormalized far enough for a tile: the deck's own
 * identity, its placement, its event, and the legend/champion the archive
 * groups by. Legend and champion are null when the deck has no card in that
 * zone.
 */
export interface MetaDeckSummaryRow {
  deckId: string;
  /**
   * Null for an archetype-only deck: those get no token, so there is no public
   * page to link a tile to.
   */
  shareToken: string | null;
  /** How much of the pilot's list this deck holds. */
  listStatus: MetaListStatus;
  deckName: string;
  deckFormat: string;
  legendCardId: string | null;
  legendName: string | null;
  championCardId: string | null;
  championName: string | null;
  playerName: string;
  finishTier: number;
  record: string | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
}

/** The archive's own facts about one deck, for the public deck page's event panel. */
export interface MetaDeckContextRow {
  /**
   * `"archetype"` here means the deck has no page. Such a deck also has no
   * share token, so the public deck route cannot normally reach it; carrying
   * the status is what lets that route refuse one anyway if a token ever
   * resolves to it.
   */
  listStatus: MetaListStatus;
  playerName: string;
  finishTier: number;
  record: string | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
}

/** An admin's view of one archived deck within its event. */
export interface AdminMetaDeckRow {
  deckId: string;
  /** Null while the deck is archetype-only. @see MetaDeckSummaryRow.shareToken */
  shareToken: string | null;
  listStatus: MetaListStatus;
  name: string;
  format: string;
  playerName: string;
  finishTier: number;
  record: string | null;
  cardCount: number;
}

/** How many archived decks contain a given card, with the card's display name. */
export interface MetaCardStatRow {
  cardId: string;
  name: string;
  slug: string;
  deckCount: number;
  /**
   * Whether the card's art is stored landscape (Battlefields). The thumbnail
   * rotates it instead of cropping it to a strip, so the flag has to travel
   * with the row — the stats surfaces never load the catalog.
   */
  landscape: boolean;
}

/** Optional scope for the stats aggregates, applied to the *event's* fields. */
export interface MetaStatsFilters {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Narrowing shared by both stats aggregates. `knownMainDeckOnly` drops the
 * archetype-only decks, which is what the card-inclusion numbers need: those
 * decks carry a legend and nothing else, so counting them would make every
 * card's percentage read against a denominator most of it never had a chance
 * to appear in. Partial lists stay in — the aggregate reads the main zone, and
 * a partial list's main deck is complete by definition. The legend play-rate
 * passes nothing, since a legend is the one thing all three states have.
 */
export interface MetaStatsScope {
  knownMainDeckOnly?: boolean;
}

/**
 * Where an accepted row came from (migration 236). Both null for a
 * hand-entered event or deck; both set when a candidate was accepted, which is
 * how the next upload finds this row instead of proposing a duplicate.
 */
export interface MetaSourceKey {
  sourceProvider: string | null;
  sourceExternalId: string | null;
}

/**
 * A deck's source key, which needs its event's id as well: sources number
 * their lists per event, so the deck id alone is not unique across a provider.
 * Kept apart from {@link MetaSourceKey} because `meta_events` has no such
 * column to write.
 */
export interface MetaDeckSourceKey extends MetaSourceKey {
  sourceEventExternalId: string | null;
}

/** Columns an event create accepts; the rest are defaulted by the table. */
export interface MetaEventInput extends MetaSourceKey {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

/** One card row of an archived deck, as the admin client resolved it. */
export interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

/** Everything needed to mint an archived deck plus its satellite row in one go. */
export interface MetaDeckInput extends MetaDeckSourceKey {
  eventId: string;
  name: string;
  format: string;
  formatConfig: DeckFormatConfig | null;
  cards: MetaDeckCardInput[];
  playerName: string;
  finishTier: number;
  record: string | null;
  /**
   * How much of the list `cards` holds. `"archetype"` pairs with a null
   * `shareToken` — the two belong together, and `createArchivedDeck` is what
   * keeps them that way.
   */
  listStatus: MetaListStatus;
}

/** The editable slice of an archived deck. Absent keys are left untouched. */
export interface MetaDeckPatch {
  eventId?: string;
  name?: string;
  playerName?: string;
  finishTier?: number;
  record?: string | null;
  cards?: MetaDeckCardInput[];
  listStatus?: MetaListStatus;
  /**
   * Service-owned, not an editable field: only `updateArchivedDeck` sets it,
   * to mint the permalink a deck gains when it is promoted out of
   * `"archetype"`. Never routed from a request body.
   */
  shareToken?: string;
}

/**
 * Queries for the admin-curated meta archive (ADR-014). Archived decks live in
 * `decks` under {@link META_ARCHIVE_USER_ID}; this repo owns the event rows,
 * the satellite placement rows, and every join that treats the two as one
 * thing.
 *
 * @returns An object with meta-archive query methods bound to the given `db`.
 */
export function metaRepo(db: Kysely<Database>) {
  const deckCountExpr = sql<number>`(select count(*)::int from meta_decks where meta_decks.meta_event_id = meta_events.id)`;

  /**
   * The archived decks both stats aggregates read, joined to their event.
   *
   * The filters read the *event*, not the deck: a deck inherits its format and
   * its date from where it was played, so "constructed decks since June" is a
   * statement about events. `knownMainDeckOnly` is the one deck-level
   * narrowing, and it exists so the card table's numerator and denominator
   * agree — see {@link MetaStatsScope}.
   *
   * @param filters The event-level scope.
   * @param scope Deck-level narrowing.
   * @returns The joined query, ready for an aggregate select.
   */
  function decksInScope(filters: MetaStatsFilters, scope?: MetaStatsScope) {
    let query = db
      .selectFrom("metaDecks as md")
      .innerJoin("metaEvents as me", "me.id", "md.metaEventId");
    if (filters.format !== undefined) {
      query = query.where("me.format", "=", filters.format);
    }
    if (filters.dateFrom !== undefined) {
      query = query.where("me.eventDate", ">=", filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      query = query.where("me.eventDate", "<=", filters.dateTo);
    }
    if (scope?.knownMainDeckOnly === true) {
      query = query.where("md.listStatus", "!=", "archetype");
    }
    return query;
  }

  /**
   * Base select for deck summaries. The legend and champion come from lateral
   * joins rather than two correlated subqueries each, so the card id and its
   * name are read in one pass per zone. A deck with several cards in a zone
   * (not a legal state, but representable) resolves to the alphabetically
   * first, deterministically.
   * @returns The joined query, unordered and unfiltered.
   */
  function deckSummaryQuery() {
    return db
      .selectFrom("metaDecks as md")
      .innerJoin("decks as d", "d.id", "md.deckId")
      .innerJoin("metaEvents as me", "me.id", "md.metaEventId")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("deckCards as dc")
            .innerJoin("cards as c", "c.id", "dc.cardId")
            .select(["dc.cardId", "c.name"])
            .whereRef("dc.deckId", "=", "md.deckId")
            .where("dc.zone", "=", WellKnown.deckZone.LEGEND)
            .orderBy("c.name")
            .limit(1)
            .as("legend"),
        (join) => join.onTrue(),
      )
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("deckCards as dc")
            .innerJoin("cards as c", "c.id", "dc.cardId")
            .select(["dc.cardId", "c.name"])
            .whereRef("dc.deckId", "=", "md.deckId")
            .where("dc.zone", "=", WellKnown.deckZone.CHAMPION)
            .orderBy("c.name")
            .limit(1)
            .as("champion"),
        (join) => join.onTrue(),
      )
      .select([
        "md.deckId",
        // Nullable here, unlike everywhere else a deck token is read: an
        // archetype-only deck has no page, so it never gets one.
        "d.shareToken",
        "md.listStatus",
        "d.name as deckName",
        "d.format as deckFormat",
        "legend.cardId as legendCardId",
        "legend.name as legendName",
        "champion.cardId as championCardId",
        "champion.name as championName",
        "md.playerName",
        "md.finishTier",
        "md.record",
        "me.slug as eventSlug",
        "me.name as eventName",
        "me.eventDate",
        "me.format as eventFormat",
      ]);
  }

  return {
    /** @returns Every archived event with its deck count, newest first. */
    listEvents(): Promise<MetaEventWithCount[]> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .orderBy("eventDate", "desc")
        .orderBy("name", "asc")
        .execute();
    },

    /** @returns The event with that slug plus its deck count, or `undefined`. */
    eventBySlug(slug: string): Promise<MetaEventWithCount | undefined> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** @returns The event with that id plus its deck count, or `undefined`. */
    eventById(id: string): Promise<MetaEventWithCount | undefined> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Deck summaries for one event, best finish first. Ties (equal
     * `finish_tier`) fall back to the player name so the order is stable.
     * @returns The event's archived decks.
     */
    deckSummariesForEvent(eventId: string): Promise<MetaDeckSummaryRow[]> {
      return deckSummaryQuery()
        .where("md.metaEventId", "=", eventId)
        .orderBy("md.finishTier", "asc")
        .orderBy("md.playerName", "asc")
        .execute();
    },

    /**
     * Every archived deck across every event, newest event first then best
     * finish. Unpaginated and unfiltered by design (ADR-014): the archive is
     * curated and small, and the deck browser filters client-side.
     * @returns All archived deck summaries.
     */
    allDeckSummaries(): Promise<MetaDeckSummaryRow[]> {
      return deckSummaryQuery()
        .orderBy("me.eventDate", "desc")
        .orderBy("md.finishTier", "asc")
        .orderBy("md.playerName", "asc")
        .execute();
    },

    /**
     * Guard for the share-token rotate path: an archived deck's token is its
     * permalink, so rotation must be refused while this row exists.
     * @returns Whether the deck belongs to the archive.
     */
    async isMetaDeck(deckId: string): Promise<boolean> {
      const row = await db
        .selectFrom("metaDecks")
        .select("deckId")
        .where("deckId", "=", deckId)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * The two facts an update has to know before it writes: how complete the
     * deck's list is, and whether it already carries a permalink. Promoting a
     * deck out of `"archetype"` is what mints the token, and that must happen
     * exactly once.
     * @returns The deck's list and token state, or `undefined` when it is not
     *   an archived deck.
     */
    deckShareState(
      deckId: string,
    ): Promise<{ listStatus: MetaListStatus; shareToken: string | null } | undefined> {
      return db
        .selectFrom("metaDecks as md")
        .innerJoin("decks as d", "d.id", "md.deckId")
        .select(["md.listStatus", "d.shareToken"])
        .where("md.deckId", "=", deckId)
        .executeTakeFirst();
    },

    /**
     * The archive's context for one deck: which event it came from and how it
     * placed. Also the archive-membership test the public deck endpoint uses —
     * `undefined` means the token belongs to a deck outside the archive, which
     * must 404 rather than render as an archive entry.
     * @returns The deck's event and placement, or `undefined`.
     */
    contextForDeck(deckId: string): Promise<MetaDeckContextRow | undefined> {
      return db
        .selectFrom("metaDecks as md")
        .innerJoin("metaEvents as me", "me.id", "md.metaEventId")
        .select([
          "md.listStatus",
          "md.playerName",
          "md.finishTier",
          "md.record",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
        ])
        .where("md.deckId", "=", deckId)
        .executeTakeFirst();
    },

    /**
     * How many archived decks fall in the stats scope — the denominator an
     * aggregate is read against. Called twice by the public stats route, once
     * per {@link MetaStatsScope}, because the two aggregates count over
     * different populations.
     * @returns The deck count in scope.
     */
    async deckCountInScope(filters: MetaStatsFilters, scope?: MetaStatsScope): Promise<number> {
      const row = await decksInScope(filters, scope)
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Card inclusion: how many distinct archived decks in scope contain each
     * card, in any zone. Pass `zone` to narrow it — `"main"` is what the
     * public stats show, and `"legend"` gives the legend play-rate, which is
     * the archive's grouping axis. Same event-level scope as
     * {@link deckCountInScope}, whose matching result is the denominator: the
     * card table passes `knownMainDeckOnly` on both, the legend play-rate on
     * neither.
     * @returns One row per card, most-played first.
     */
    cardInclusion(
      filters: MetaStatsFilters,
      options?: MetaStatsScope & { zone?: DeckZone },
    ): Promise<MetaCardStatRow[]> {
      const zone = options?.zone;
      let query = decksInScope(filters, options)
        .innerJoin("deckCards as dc", "dc.deckId", "md.deckId")
        .innerJoin("cards as c", "c.id", "dc.cardId");
      if (zone !== undefined) {
        query = query.where("dc.zone", "=", zone);
      }
      return query
        .select((eb) => [
          "dc.cardId",
          "c.name",
          "c.slug",
          eb.cast<number>(eb.fn.count("dc.deckId").distinct(), "integer").as("deckCount"),
          // The junction table rather than `mv_card_aggregates`: the view is
          // refreshed on demand, and a card the archive already references
          // must not drop out of the stats while it is stale.
          eb
            .selectFrom("cardCardTypes as cct")
            .select(sql<CardType[]>`array_agg(cct.type_slug order by cct.position)`.as("types"))
            .whereRef("cct.cardId", "=", "dc.cardId")
            .as("types"),
        ])
        .groupBy(["dc.cardId", "c.name", "c.slug"])
        .orderBy("deckCount", "desc")
        .orderBy("c.name", "asc")
        .execute()
        .then((rows) =>
          rows.map(({ types, ...row }) => ({
            ...row,
            landscape: getOrientation(types ?? []) === "landscape",
          })),
        );
    },

    /**
     * Admin rows for one event's decks, with the card count so the table can
     * flag a half-entered list.
     * @returns The event's decks, best finish first.
     */
    adminDecksForEvent(eventId: string): Promise<AdminMetaDeckRow[]> {
      return db
        .selectFrom("metaDecks as md")
        .innerJoin("decks as d", "d.id", "md.deckId")
        .select((eb) => [
          "md.deckId",
          "d.shareToken",
          "md.listStatus",
          "d.name",
          "d.format",
          "md.playerName",
          "md.finishTier",
          "md.record",
          eb
            .selectFrom("deckCards as dc")
            .select((inner) =>
              inner.cast<number>(inner.fn.sum("dc.quantity"), "integer").as("cardCount"),
            )
            .whereRef("dc.deckId", "=", "md.deckId")
            .as("cardCount"),
        ])
        .where("md.metaEventId", "=", eventId)
        .orderBy("md.finishTier", "asc")
        .orderBy("md.playerName", "asc")
        .execute()
        .then((rows) => rows.map((row) => ({ ...row, cardCount: row.cardCount ?? 0 })));
    },

    /** @returns The created event row, with a deck count of zero. */
    async createEvent(input: MetaEventInput): Promise<MetaEventWithCount> {
      const row = await db
        .insertInto("metaEvents")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...row, deckCount: 0 };
    },

    /**
     * Applies a partial event update. The caller has already narrowed the body
     * to real columns via `buildPatchUpdates`.
     * @returns Whether the event existed.
     */
    async updateEvent(id: string, updates: Updateable<MetaEventsTable>): Promise<boolean> {
      const result = await db
        .updateTable("metaEvents")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Deletes an event, its satellite rows, and the `decks` rows behind them.
     * The FK cascade only reaches `meta_decks`, so without the explicit deck
     * delete the archived decks would survive under the synthetic owner with
     * nothing left pointing at them.
     * @returns Whether the event existed.
     */
    deleteEvent(id: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const deckRows = await trx
          .selectFrom("metaDecks")
          .select("deckId")
          .where("metaEventId", "=", id)
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
     * Creates an archived deck: the `decks` row under the synthetic owner, its
     * cards, and the satellite placement row, all in one transaction so a
     * failure can't leave a deck with no event or an event row with no deck.
     *
     * `shareToken` is supplied by the caller (wrapped in `withUniqueShareToken`)
     * because the retry has to re-run the whole transaction, not just the
     * insert that collided. It is null for an archetype-only deck, which has no
     * public page and so needs no permalink.
     *
     * @returns The new deck's id, or `undefined` when the event doesn't exist.
     */
    createDeck(
      input: MetaDeckInput,
      shareToken: string | null,
    ): Promise<{ deckId: string } | undefined> {
      return db.transaction().execute(async (trx) => {
        const event = await trx
          .selectFrom("metaEvents")
          .select("id")
          .where("id", "=", input.eventId)
          .executeTakeFirst();
        if (!event) {
          // Rolls back before anything is written, so a bad event id can never
          // strand a deck under the synthetic owner.
          return;
        }

        const deck = await trx
          .insertInto("decks")
          .values({
            userId: META_ARCHIVE_USER_ID,
            name: input.name,
            description: null,
            format: input.format,
            formatConfig: input.formatConfig === null ? null : JSON.stringify(input.formatConfig),
            // The permalink is the point of an archived deck; it is public
            // from the moment it exists, never through a later share toggle.
            isPublic: true,
            shareToken,
            links: JSON.stringify([]),
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("deckCards")
          .values(input.cards.map((card) => ({ deckId: deck.id, ...card })))
          .execute();

        await trx
          .insertInto("metaDecks")
          .values({
            deckId: deck.id,
            metaEventId: input.eventId,
            playerName: input.playerName,
            finishTier: input.finishTier,
            record: input.record,
            listStatus: input.listStatus,
            sourceProvider: input.sourceProvider,
            sourceEventExternalId: input.sourceEventExternalId,
            sourceExternalId: input.sourceExternalId,
          })
          .execute();

        return { deckId: deck.id };
      });
    },

    /**
     * Applies a partial update across the deck row, its cards, and its
     * placement row. Card replacement is wholesale, matching the deck
     * builder's own `replaceCards`.
     * @returns Whether the archived deck existed.
     */
    updateDeck(deckId: string, patch: MetaDeckPatch): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom("metaDecks")
          .select("deckId")
          .where("deckId", "=", deckId)
          .executeTakeFirst();
        if (!existing) {
          return false;
        }

        const satellite: Updateable<MetaDecksTable> = {};
        if (patch.eventId !== undefined) {
          satellite.metaEventId = patch.eventId;
        }
        if (patch.playerName !== undefined) {
          satellite.playerName = patch.playerName;
        }
        if (patch.finishTier !== undefined) {
          satellite.finishTier = patch.finishTier;
        }
        if (patch.record !== undefined) {
          satellite.record = patch.record;
        }
        if (patch.listStatus !== undefined) {
          satellite.listStatus = patch.listStatus;
        }
        if (Object.keys(satellite).length > 0) {
          await trx.updateTable("metaDecks").set(satellite).where("deckId", "=", deckId).execute();
        }

        // The token travels with the deck row, not the satellite, and arrives
        // only when a deck stops being archetype-only.
        const deckUpdates: Updateable<DecksTable> = {};
        if (patch.name !== undefined) {
          deckUpdates.name = patch.name;
        }
        if (patch.shareToken !== undefined) {
          deckUpdates.shareToken = patch.shareToken;
        }
        if (Object.keys(deckUpdates).length > 0) {
          await trx.updateTable("decks").set(deckUpdates).where("id", "=", deckId).execute();
        }

        if (patch.cards !== undefined) {
          await trx.deleteFrom("deckCards").where("deckId", "=", deckId).execute();
          await trx
            .insertInto("deckCards")
            .values(patch.cards.map((card) => ({ deckId, ...card })))
            .execute();
          await trx
            .updateTable("decks")
            .set({ updatedAt: sql`now()` })
            .where("id", "=", deckId)
            .execute();
        }

        return true;
      });
    },

    /**
     * Removes an archived deck entirely. Deleting the `decks` row cascades to
     * both `deck_cards` and the satellite row, so this is the whole operation.
     * The extra `meta_decks` predicate keeps the method from ever reaching a
     * user's own deck.
     * @returns Whether the archived deck existed.
     */
    async deleteDeck(deckId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("decks")
        .where("id", "=", deckId)
        .where("userId", "=", META_ARCHIVE_USER_ID)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("metaDecks")
              .select("deckId")
              .whereRef("metaDecks.deckId", "=", "decks.id"),
          ),
        )
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Sitemap entries for the archive: one per event slug and one per archived
     * deck token. `updatedAt` drives the `<lastmod>` the generator emits.
     * @returns Event slugs and deck share tokens with their last-modified instants.
     */
    async sitemapEntries(): Promise<{
      events: { slug: string; updatedAt: string }[];
      decks: { slug: string; updatedAt: string }[];
    }> {
      const [events, decks] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "updatedAt"])
          .orderBy("eventDate", "desc")
          .execute(),
        db
          .selectFrom("metaDecks as md")
          .innerJoin("decks as d", "d.id", "md.deckId")
          .select(["d.shareToken as slug", "d.updatedAt"])
          .where("d.shareToken", "is not", null)
          .$narrowType<{ slug: string }>()
          .execute(),
      ]);
      const toEntry = (row: { slug: string; updatedAt: Date }) => ({
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
      });
      return {
        events: events.map((row) => toEntry(row)),
        decks: decks.map((row) => toEntry(row)),
      };
    },
  };
}
