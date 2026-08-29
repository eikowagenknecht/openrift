import { legendDisplayName } from "@openrift/shared";
import type { MetaListStatus } from "@openrift/shared/types";
import type { Insertable, Kysely, Selectable, SqlBool, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  CandidateMetaDecksTable,
  CandidateMetaEventsTable,
  Database,
  MetaEventsTable,
} from "../db/index.js";
import { cardTypesColumn } from "./query-helpers.js";

export type CandidateMetaEventRow = Selectable<CandidateMetaEventsTable>;

export type CandidateMetaDeckRow = Selectable<CandidateMetaDecksTable>;

/**
 * A live event tagged with one source's key. The pairing is read from
 * `meta_event_sources`, not from the candidate row, so it survives the
 * candidate being deleted by an ignore.
 */
export type LiveMetaEventRow = Selectable<MetaEventsTable> & { candidateExternalId: string };

export interface LiveMetaDeckRow {
  deckId: string;
  metaEventId: string;
  name: string;
  playerName: string;
  finishTier: number;
  record: string | null;
  listStatus: MetaListStatus;
  /** Null while the deck is archetype-only, the one case an archive deck has no permalink. */
  shareToken: string | null;
}

export interface LiveMetaDeckForCandidateRow extends LiveMetaDeckRow {
  candidateEventExternalId: string;
  candidateExternalId: string;
}

export interface LiveMetaDeckCardRow {
  deckId: string;
  cardId: string;
  zone: string;
  quantity: number;
}

export interface IgnoredMetaCandidateRow {
  provider: string;
  externalId: string;
  createdAt: Date;
}

/** Carries the source's event id too, because deck external ids repeat across events. */
export interface IgnoredMetaCandidateDeckRow extends IgnoredMetaCandidateRow {
  eventExternalId: string;
}

export interface MetaCandidateDeckKey {
  eventExternalId: string;
  externalId: string;
}

/**
 * Queries for the meta archive's candidate staging tables. Live `meta_events` /
 * `meta_decks` writes stay in `metaRepo` — this repo owns the candidate rows,
 * the ignore lists, and the source-key lookups that join the two worlds.
 */
export function metaCandidatesRepo(db: Kysely<Database>) {
  function liveDeckQuery() {
    return db
      .selectFrom("metaDecks as md")
      .innerJoin("decks as d", "d.id", "md.deckId")
      .select([
        "md.deckId",
        "md.metaEventId",
        "d.name",
        "d.shareToken",
        "md.playerName",
        "md.finishTier",
        "md.record",
        "md.listStatus",
      ]);
  }

  async function setEventLink(
    id: string,
    metaEventId: string | null,
    checkedAt?: Date,
  ): Promise<boolean> {
    const result = await db
      .updateTable("candidateMetaEvents")
      .set(checkedAt === undefined ? { metaEventId } : { metaEventId, checkedAt })
      .where("id", "=", id)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  async function setDeckLink(
    id: string,
    deckId: string | null,
    checkedAt?: Date,
  ): Promise<boolean> {
    const result = await db
      .updateTable("candidateMetaDecks")
      .set(checkedAt === undefined ? { deckId } : { deckId, checkedAt })
      .where("id", "=", id)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  return {
    /**
     * Scoped to the uploaded keys rather than the whole provider because ingest
     * replaces per event: rows the upload doesn't name are not read and not
     * touched.
     */
    async eventsBySourceKeys(
      provider: string,
      externalIds: string[],
    ): Promise<CandidateMetaEventRow[]> {
      if (externalIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "in", externalIds)
        .execute();
      return rows;
    },

    async decksByCandidateEventIds(eventIds: string[]): Promise<CandidateMetaDeckRow[]> {
      if (eventIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .where("candidateEventId", "in", eventIds)
        .orderBy("finishTier", "asc")
        .orderBy("playerName", "asc")
        .execute();
      return rows;
    },

    async ignoredEventIds(provider: string): Promise<string[]> {
      const rows = await db
        .selectFrom("ignoredCandidateMetaEvents")
        .select("externalId")
        .where("provider", "=", provider)
        .execute();
      return rows.map((row) => row.externalId);
    },

    async ignoredDeckKeys(provider: string): Promise<MetaCandidateDeckKey[]> {
      const rows = await db
        .selectFrom("ignoredCandidateMetaDecks")
        .select(["eventExternalId", "externalId"])
        .where("provider", "=", provider)
        .execute();
      return rows.map((row) => ({
        eventExternalId: row.eventExternalId,
        externalId: row.externalId,
      }));
    },

    /**
     * The live events this provider's uploaded keys already point at, read
     * through the citation rows that hold the source key.
     *
     * This is what re-links a candidate after an accept and what the in-sync
     * check diffs against. It goes through `meta_event_sources` rather than the
     * candidate row for one reason: ignoring an event *deletes* its candidate,
     * so a candidate join would lose the pairing the moment an admin ignores
     * and later un-ignores a key. The citation survives that.
     */
    liveEventsByCandidateKeys(
      provider: string,
      externalIds: string[],
    ): Promise<LiveMetaEventRow[]> {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return (
        db
          .selectFrom("metaEventSources as es")
          .innerJoin("metaEvents as me", "me.id", "es.metaEventId")
          .selectAll("me")
          // Nullable on the table, because a hand-entered citation has no key.
          // The provider predicate below only matches rows that do.
          .select(sql<string>`${sql.ref("es.externalId")}`.as("candidateExternalId"))
          .where("es.provider", "=", provider)
          .where("es.externalId", "in", externalIds)
          .execute()
      );
    },

    /**
     * The live archived decks this provider's uploaded deck keys already point
     * at, read through the `meta_deck_sources` rows that hold the source key.
     *
     * Same reasoning as {@link liveEventsByCandidateKeys}: an ignore deletes
     * the candidate deck, so reading the link off it would make un-ignoring the
     * key archive a second copy of one pilot's deck instead of finding the deck
     * it already made.
     *
     * The two id lists are matched independently rather than as pairs, so the
     * result can hold a deck whose event and deck ids each appear in the
     * payload but not together. The caller keys its index on the pair, which
     * drops those.
     */
    liveDecksByCandidateKeys(
      provider: string,
      eventExternalIds: string[],
      deckExternalIds: string[],
    ): Promise<LiveMetaDeckForCandidateRow[]> {
      if (eventExternalIds.length === 0 || deckExternalIds.length === 0) {
        return Promise.resolve([]);
      }
      return liveDeckQuery()
        .innerJoin("metaDeckSources as ds", "ds.deckId", "md.deckId")
        .select([
          "ds.eventExternalId as candidateEventExternalId",
          "ds.externalId as candidateExternalId",
        ])
        .where("ds.provider", "=", provider)
        .where("ds.eventExternalId", "in", eventExternalIds)
        .where("ds.externalId", "in", deckExternalIds)
        .execute();
    },

    liveDecksByIds(deckIds: string[]): Promise<LiveMetaDeckRow[]> {
      if (deckIds.length === 0) {
        return Promise.resolve([]);
      }
      return liveDeckQuery().where("md.deckId", "in", deckIds).execute();
    },

    liveEventsByIds(ids: string[]): Promise<Selectable<MetaEventsTable>[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("metaEvents").selectAll().where("id", "in", ids).execute();
    },

    liveDeckCards(deckIds: string[]): Promise<LiveMetaDeckCardRow[]> {
      if (deckIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("deckCards")
        .select(["deckId", "cardId", "zone", "quantity"])
        .where("deckId", "in", deckIds)
        .execute();
    },

    async insertEvent(values: Insertable<CandidateMetaEventsTable>): Promise<string> {
      const row = await db
        .insertInto("candidateMetaEvents")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    async updateEvent(id: string, updates: Updateable<CandidateMetaEventsTable>): Promise<void> {
      await db.updateTable("candidateMetaEvents").set(updates).where("id", "=", id).execute();
    },

    async insertDeck(values: Insertable<CandidateMetaDecksTable>): Promise<string> {
      const row = await db
        .insertInto("candidateMetaDecks")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    async updateDeck(id: string, updates: Updateable<CandidateMetaDecksTable>): Promise<void> {
      await db.updateTable("candidateMetaDecks").set(updates).where("id", "=", id).execute();
    },

    async deleteDecks(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidateMetaDecks").where("id", "in", ids).execute();
    },

    async listEvents(): Promise<CandidateMetaEventRow[]> {
      const rows = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .orderBy("eventDate", "desc")
        .orderBy("name", "asc")
        .execute();
      return rows;
    },

    /**
     * The candidates citing one live event. Ordered by provider so the review
     * screen's per-source columns keep the same places between visits.
     */
    async eventsByMetaEventId(metaEventId: string): Promise<CandidateMetaEventRow[]> {
      const rows = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("metaEventId", "=", metaEventId)
        .orderBy("provider", "asc")
        .orderBy("externalId", "asc")
        .execute();
      return rows;
    },

    /**
     * The candidate decks hanging off live events directly — user submissions,
     * which target an event the archive already has rather than a candidate
     * event of their own.
     */
    async decksByMetaEventIds(metaEventIds: string[]): Promise<CandidateMetaDeckRow[]> {
      if (metaEventIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .where("metaEventId", "in", metaEventIds)
        .orderBy("finishTier", "asc")
        .orderBy("playerName", "asc")
        .execute();
      return rows;
    },

    async eventById(id: string): Promise<CandidateMetaEventRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    async deckById(id: string): Promise<CandidateMetaDeckRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    /**
     * Unpaginated on purpose: the archive is curated and small, like the live
     * archive reads next to it.
     */
    async allDecks(): Promise<CandidateMetaDeckRow[]> {
      const rows = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .orderBy("finishTier", "asc")
        .orderBy("playerName", "asc")
        .execute();
      return rows;
    },

    /**
     * Points a candidate event at a live row, and marks it reviewed. Accept,
     * link-to-existing, and relink all use this one write — they differ only in
     * what the service does around it.
     */
    linkEvent(id: string, metaEventId: string, checkedAt: Date): Promise<boolean> {
      return setEventLink(id, metaEventId, checkedAt);
    },

    /**
     * Clears a candidate event's link. `checked_at` is deliberately left
     * alone: unlinking does not un-review the row, and it is not a source
     * change either.
     */
    unlinkEvent(id: string): Promise<boolean> {
      return setEventLink(id, null);
    },

    linkDeck(id: string, deckId: string, checkedAt: Date): Promise<boolean> {
      return setDeckLink(id, deckId, checkedAt);
    },

    unlinkDeck(id: string): Promise<boolean> {
      return setDeckLink(id, null);
    },

    async setEventCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaEvents")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    async setDeckCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaDecks")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Candidate decks holding at least one card name that resolved to nothing —
     * the rows a rematch pass has any reason to revisit. The predicate runs in
     * the database so an archive of fully-resolved decks costs one cheap scan.
     */
    async decksWithUnresolvedCards(): Promise<CandidateMetaDeckRow[]> {
      const rows = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        // raw sql: unnesting a jsonb array and testing a key of each element has
        // no Kysely expression form.
        .where(
          sql<SqlBool>`EXISTS (
            SELECT 1 FROM jsonb_array_elements(cards) AS card
            WHERE card ->> 'cardId' IS NULL
          )`,
        )
        .execute();
      return rows;
    },

    async listIgnored(): Promise<{
      events: IgnoredMetaCandidateRow[];
      decks: IgnoredMetaCandidateDeckRow[];
    }> {
      const [events, decks] = await Promise.all([
        db
          .selectFrom("ignoredCandidateMetaEvents")
          .selectAll()
          .orderBy("createdAt", "desc")
          .execute(),
        db
          .selectFrom("ignoredCandidateMetaDecks")
          .selectAll()
          .orderBy("createdAt", "desc")
          .execute(),
      ]);
      return { events, decks };
    },

    /**
     * Ignores a candidate event and drops the staged row, so the queue loses it
     * immediately and every later upload skips the key.
     */
    async ignoreEvent(provider: string, externalId: string): Promise<boolean> {
      await db
        .insertInto("ignoredCandidateMetaEvents")
        .values({ provider, externalId })
        .onConflict((oc) => oc.columns(["provider", "externalId"]).doNothing())
        .execute();
      const result = await db
        .deleteFrom("candidateMetaEvents")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    async unignoreEvent(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredCandidateMetaEvents")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Ignores a candidate deck and drops the staged row. The key names the
     * source's event rather than the candidate row, so it survives that event's
     * candidate being deleted and re-created by a later upload.
     */
    async ignoreDeck(
      provider: string,
      key: MetaCandidateDeckKey,
      deckId: string,
    ): Promise<boolean> {
      await db
        .insertInto("ignoredCandidateMetaDecks")
        .values({ provider, ...key })
        .onConflict((oc) => oc.columns(["provider", "eventExternalId", "externalId"]).doNothing())
        .execute();
      const result = await db
        .deleteFrom("candidateMetaDecks")
        .where("id", "=", deckId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    async unignoreDeck(provider: string, key: MetaCandidateDeckKey): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredCandidateMetaDecks")
        .where("provider", "=", provider)
        .where("eventExternalId", "=", key.eventExternalId)
        .where("externalId", "=", key.externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /** @returns Card id to display name, so an accepted deck is titled the way players read it. */
    async cardNamesByIds(cardIds: string[]): Promise<Map<string, string>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards")
        .leftJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select(["cards.id", "cards.name", cardTypesColumn(), "cards.tags"])
        .where("cards.id", "in", cardIds)
        .execute();
      return new Map(rows.map((row) => [row.id, legendDisplayName(row)]));
    },
  };
}
