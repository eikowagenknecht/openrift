import { WellKnown, getOrientation } from "@openrift/shared";
import type {
  CardType,
  DeckFormatConfig,
  DeckZone,
  MetaCreditVisibility,
  MetaListStatus,
} from "@openrift/shared/types";
import type { Kysely, Selectable, SqlBool, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DecksTable,
  MetaDecksTable,
  MetaEventSourcesTable,
  MetaEventsTable,
} from "../db/index.js";

/**
 * The synthetic account that owns every archived deck. It has no `accounts`
 * row, so no credential or OAuth path can produce a session for it — the id is
 * safe to hardcode as the write path's owner.
 */
export const META_ARCHIVE_USER_ID = "meta-archive";

export type MetaEventWithCount = Selectable<MetaEventsTable> & { deckCount: number };

export interface MetaDeckSummaryRow {
  deckId: string;
  /**
   * Null for an archetype-only deck: those get no token, so there is no public
   * page to link a tile to.
   */
  shareToken: string | null;
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

export interface AdminMetaDeckRow {
  deckId: string;
  /** Null while the deck is archetype-only. */
  shareToken: string | null;
  listStatus: MetaListStatus;
  name: string;
  format: string;
  playerName: string;
  finishTier: number;
  record: string | null;
  cardCount: number;
}

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

/** Applied to the *event's* fields, not the deck's. */
export interface MetaStatsFilters {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * `knownMainDeckOnly` drops the archetype-only decks, which is what the
 * card-inclusion numbers need: those decks carry a legend and nothing else, so
 * counting them would make every card's percentage read against a denominator
 * most of it never had a chance to appear in. Partial lists stay in — a partial
 * list's main deck is complete by definition. The legend play-rate passes
 * nothing, since a legend is the one thing all three states have.
 */
export interface MetaStatsScope {
  knownMainDeckOnly?: boolean;
}

/**
 * One citation on an event: where a slice of its data came from. Public, and
 * never a contributor — a person is credited through {@link MetaContributorRow}
 * instead.
 */
export type MetaEventSourceRow = Selectable<MetaEventSourcesTable>;

/**
 * `provider` and `externalId` are null together for a hand-entered citation (a
 * VOD, a photo of the standings board); a provider row carries the candidate's
 * key so unlinking can find it.
 */
export interface MetaEventSourceInput {
  metaEventId: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
}

/**
 * The key that names one source's deck. Scoped by the source's event id as well
 * as the deck's, because deck ids restart per event.
 */
export interface MetaDeckSourceKey {
  provider: string;
  eventExternalId: string;
  externalId: string;
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
}

export interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

export interface MetaDeckInput {
  eventId: string;
  name: string;
  format: string;
  formatConfig: DeckFormatConfig | null;
  cards: MetaDeckCardInput[];
  playerName: string;
  finishTier: number;
  record: string | null;
  /**
   * `"archetype"` pairs with a null `shareToken` — the two belong together,
   * and `createArchivedDeck` is what keeps them that way.
   */
  listStatus: MetaListStatus;
}

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
 * Queries for the admin-curated meta archive. Archived decks live in `decks`
 * under {@link META_ARCHIVE_USER_ID}; this repo owns the event rows, the
 * satellite placement rows, and every join that treats the two as one thing.
 */
export function metaRepo(db: Kysely<Database>) {
  const deckCountExpr = sql<number>`(select count(*)::int from meta_decks where meta_decks.meta_event_id = meta_events.id)`;

  /**
   * The filters read the *event*, not the deck: a deck inherits its format and
   * its date from where it was played, so "constructed decks since June" is a
   * statement about events. `knownMainDeckOnly` is the one deck-level
   * narrowing, and it exists so the card table's numerator and denominator
   * agree — see {@link MetaStatsScope}.
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
   * The legend and champion come from lateral joins rather than two correlated
   * subqueries each, so the card id and its name are read in one pass per
   * zone. A deck with several cards in a zone (not a legal state, but
   * representable) resolves to the alphabetically first, deterministically.
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

  /**
   * The display string is resolved in SQL so the filter and the ordering agree
   * with it: a contributor on `riot_id` falls back to their display name, a
   * blank result drops the row rather than printing part of a user id, and the
   * `DISTINCT` collapses the several decks one person contributed into one name
   * per event.
   */
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

  return {
    listEvents(): Promise<MetaEventWithCount[]> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .orderBy("eventDate", "desc")
        .orderBy("name", "asc")
        .execute();
    },

    eventBySlug(slug: string): Promise<MetaEventWithCount | undefined> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    eventById(id: string): Promise<MetaEventWithCount | undefined> {
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .select(deckCountExpr.as("deckCount"))
        .where("id", "=", id)
        .executeTakeFirst();
    },

    deckSummariesForEvent(eventId: string): Promise<MetaDeckSummaryRow[]> {
      return deckSummaryQuery()
        .where("md.metaEventId", "=", eventId)
        .orderBy("md.finishTier", "asc")
        .orderBy("md.playerName", "asc")
        .execute();
    },

    /**
     * Unpaginated and unfiltered by design: the archive is curated and small,
     * and the deck browser filters client-side.
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
     * The two facts an update has to know before it writes: promoting a deck
     * out of `"archetype"` is what mints the token, and that must happen
     * exactly once.
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
     * Also the archive-membership test the public deck endpoint uses —
     * `undefined` means the token belongs to a deck outside the archive, which
     * must 404 rather than render as an archive entry.
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
     * The denominator an aggregate is read against. Called twice by the public
     * stats route, once per {@link MetaStatsScope}, because the two aggregates
     * count over different populations.
     */
    async deckCountInScope(filters: MetaStatsFilters, scope?: MetaStatsScope): Promise<number> {
      const row = await decksInScope(filters, scope)
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Same event-level scope as {@link deckCountInScope}, whose matching
     * result is the denominator: the card table passes `knownMainDeckOnly` on
     * both, the legend play-rate on neither.
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

    async createEvent(input: MetaEventInput): Promise<MetaEventWithCount> {
      const row = await db
        .insertInto("metaEvents")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...row, deckCount: 0 };
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
     * The FK cascade only reaches `meta_decks`, so without the explicit deck
     * delete the archived decks would survive under the synthetic owner with
     * nothing left pointing at them.
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
     * `shareToken` is supplied by the caller (wrapped in `withUniqueShareToken`)
     * because the retry has to re-run the whole transaction, not just the
     * insert that collided. It is null for an archetype-only deck, which has no
     * public page and so needs no permalink.
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
          return;
        }

        const deck = await trx
          .insertInto("decks")
          .values({
            userId: META_ARCHIVE_USER_ID,
            name: input.name,
            description: null,
            format: input.format,
            formatConfig: input.formatConfig,
            // The permalink is the point of an archived deck; it is public
            // from the moment it exists, never through a later share toggle.
            isPublic: true,
            shareToken,
            links: [],
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
          })
          .execute();

        return { deckId: deck.id };
      });
    },

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
     * Deleting the `decks` row cascades to both `deck_cards` and the satellite
     * row, so this is the whole operation. The extra `meta_decks` predicate
     * keeps the method from ever reaching a user's own deck.
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

    sourcesForEvent(eventId: string): Promise<MetaEventSourceRow[]> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy(sql`provider asc nulls last`)
        .orderBy("createdAt", "asc")
        .execute();
    },

    insertEventSource(input: MetaEventSourceInput): Promise<MetaEventSourceRow> {
      return db
        .insertInto("metaEventSources")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async deleteEventSource(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Removes a provider's citation by its source key, which is what unlinking
     * a candidate has to work with: it knows the key, not the row id.
     */
    async deleteEventSourceByKey(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Records which source deck an archived deck came from, replacing whatever
     * that key pointed at before. The delete is what makes a relink work: the
     * key is unique across the table, so moving a source from one archived deck
     * to another has to take the row with it.
     */
    async writeDeckSource(deckId: string, key: MetaDeckSourceKey): Promise<void> {
      await db
        .deleteFrom("metaDeckSources")
        .where("provider", "=", key.provider)
        .where("eventExternalId", "=", key.eventExternalId)
        .where("externalId", "=", key.externalId)
        .execute();
      await db
        .insertInto("metaDeckSources")
        .values({ deckId, ...key })
        .execute();
    },

    async deleteDeckSourceByKey(key: MetaDeckSourceKey): Promise<boolean> {
      const result = await db
        .deleteFrom("metaDeckSources")
        .where("provider", "=", key.provider)
        .where("eventExternalId", "=", key.eventExternalId)
        .where("externalId", "=", key.externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Records one contribution; a null `deckId` credits the event itself.
     * Idempotent on the contribution's unique index (`NULLS NOT DISTINCT`, so
     * a second event-level credit for the same user is the same row), because
     * an accept is legitimately re-run — a corrected list, a re-upload — and a
     * contributor is credited once per thing they contributed, not once per
     * click.
     */
    async insertCredit(values: {
      metaEventId: string;
      deckId: string | null;
      userId: string;
    }): Promise<void> {
      await db
        .insertInto("metaCredits")
        .values(values)
        .onConflict((oc) => oc.columns(["metaEventId", "userId", "deckId"]).doNothing())
        .execute();
    },

    /**
     * Deleting the deck itself cascades; this is the narrower case of taking a
     * credit back while the deck stays. Several people can have contributed to
     * one deck, so the unlink path always passes `userId`.
     */
    async deleteCreditsForDeck(deckId: string, userId?: string): Promise<void> {
      let query = db.deleteFrom("metaCredits").where("deckId", "=", deckId);
      if (userId !== undefined) {
        query = query.where("userId", "=", userId);
      }
      await query.execute();
    },

    /**
     * Consent is `users.meta_credit_visibility`, read here rather than frozen
     * onto the credit row: opting in later credits every past contribution and
     * opting out removes them all, without touching an archive row.
     */
    contributorsForEvent(eventId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventId", "=", eventId).execute();
    },

    contributorsForDeck(deckId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.deckId", "=", deckId).execute();
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
     * Nothing else moves on a visibility change: opting in credits every past
     * contribution and opting out removes them all, because the public read
     * resolves the name at render rather than freezing it onto a credit row.
     */
    async setCreditVisibility(userId: string, visibility: MetaCreditVisibility): Promise<boolean> {
      const result = await db
        .updateTable("users")
        .set({ metaCreditVisibility: visibility })
        .where("id", "=", userId)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /** `updatedAt` drives the `<lastmod>` the sitemap generator emits. */
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
