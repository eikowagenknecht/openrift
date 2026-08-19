import type { MetaListStatus } from "@openrift/shared/types";
import type { Insertable, Kysely, Selectable, SqlBool, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  CandidateMetaDecksTable,
  CandidateMetaEventsTable,
  Database,
  MetaEventsTable,
} from "../db/index.js";

/** A candidate event exactly as stored. */
export type CandidateMetaEventRow = Selectable<CandidateMetaEventsTable>;

/** A candidate deck with its `cards` jsonb already parsed. */
export type CandidateMetaDeckRow = Selectable<CandidateMetaDecksTable>;

/**
 * A live event reached through one source's key, carrying that key so the caller
 * can index on the source's vocabulary.
 *
 * Migration 255 moved the source key off `meta_events` entirely, because a live
 * event is described by any number of sources; migration 256 settled where it
 * lives instead. The pairing is read from `meta_event_sources`, not from the
 * candidate row, so it survives the candidate being deleted by an ignore.
 */
export type LiveMetaEventRow = Selectable<MetaEventsTable> & { candidateExternalId: string };

/** A live archived deck with the fields a diff reads. */
export interface LiveMetaDeckRow {
  deckId: string;
  metaEventId: string;
  name: string;
  playerName: string;
  finishTier: number;
  record: string | null;
  /** How much of the list the archive holds for this deck. */
  listStatus: MetaListStatus;
  /**
   * The archived deck's permalink. Null while the deck is archetype-only, which
   * is the one case an archive deck has none.
   */
  shareToken: string | null;
}

/**
 * A live archived deck reached through one source's `meta_deck_sources` row,
 * carrying that event-scoped key. @see LiveMetaEventRow
 */
export interface LiveMetaDeckForCandidateRow extends LiveMetaDeckRow {
  candidateEventExternalId: string;
  candidateExternalId: string;
}

/** One card row of a live archived deck. */
export interface LiveMetaDeckCardRow {
  deckId: string;
  cardId: string;
  zone: string;
  quantity: number;
}

/** An ignored candidate event, keyed on the source's own event id. */
export interface IgnoredMetaCandidateRow {
  provider: string;
  externalId: string;
  createdAt: Date;
}

/**
 * An ignored candidate deck. Carries the source's event id too, because deck
 * external ids repeat across events.
 */
export interface IgnoredMetaCandidateDeckRow extends IgnoredMetaCandidateRow {
  eventExternalId: string;
}

/** The event-scoped key one candidate deck is ignored under. */
export interface MetaCandidateDeckKey {
  eventExternalId: string;
  externalId: string;
}

/**
 * Queries for the meta archive's candidate staging tables (ADR-014, migration
 * 236). Live `meta_events` / `meta_decks` writes stay in `metaRepo` — this repo
 * owns the candidate rows, the ignore lists, and the source-key lookups that
 * join the two worlds.
 *
 * @returns An object with candidate query methods bound to the given `db`.
 */
export function metaCandidatesRepo(db: Kysely<Database>) {
  /**
   * The live archived deck shape both the candidate-key and the id lookups
   * return: the satellite placement plus the deck's own name and permalink.
   * @returns The joined query, unfiltered.
   */
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

  /**
   * The one write behind link, relink and unlink at the event level.
   * @param id The candidate event.
   * @param metaEventId The live row to point at, or null to clear the link.
   * @param checkedAt Set when linking; omitted when unlinking, which is not a review.
   * @returns Whether the candidate existed.
   */
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

  /** @returns Whether the candidate existed. @see setEventLink */
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
    // ── Ingest reads ─────────────────────────────────────────────────────────

    /**
     * The provider's existing candidates for exactly the uploaded keys. Scoped
     * to the payload rather than the whole provider because ingest replaces per
     * event: rows the upload doesn't name are not read and not touched.
     * @param provider The uploading provider.
     * @param externalIds The event keys in the payload.
     * @returns The matching candidate events.
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

    /** @returns Every candidate deck under the given candidate events. */
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

    /** @returns The provider's ignored event keys. */
    async ignoredEventIds(provider: string): Promise<string[]> {
      const rows = await db
        .selectFrom("ignoredCandidateMetaEvents")
        .select("externalId")
        .where("provider", "=", provider)
        .execute();
      return rows.map((row) => row.externalId);
    },

    /** @returns The provider's ignored deck keys, each scoped to its source event. */
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
     * and later un-ignores a key. The citation survives that, and it carries
     * the same `(provider, external_id)` migration 255 took off `meta_events`.
     *
     * @param provider The uploading provider.
     * @param externalIds The event keys in the payload.
     * @returns The linked live events, each tagged with the source's key.
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
     * Same reasoning as {@link liveEventsByCandidateKeys}, and the same reason
     * migration 256 exists: an ignore deletes the candidate deck, so reading the
     * link off it would make un-ignoring the key archive a second copy of one
     * pilot's deck instead of finding the deck it already made.
     *
     * The two id lists are matched independently rather than as pairs, so the
     * result can hold a deck whose event and deck ids each appear in the
     * payload but not together. The caller keys its index on the pair, which
     * drops those.
     *
     * @param provider The uploading provider.
     * @param eventExternalIds The event keys in the payload.
     * @param deckExternalIds The deck keys in the payload.
     * @returns The linked live decks, each tagged with the source's event-scoped key.
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

    /** @returns The live archived decks with those ids, for the detail view's diffs. */
    liveDecksByIds(deckIds: string[]): Promise<LiveMetaDeckRow[]> {
      if (deckIds.length === 0) {
        return Promise.resolve([]);
      }
      return liveDeckQuery().where("md.deckId", "in", deckIds).execute();
    },

    /** @returns The live events with those ids, keyed lookups left to the caller. */
    liveEventsByIds(ids: string[]): Promise<Selectable<MetaEventsTable>[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("metaEvents").selectAll().where("id", "in", ids).execute();
    },

    /** @returns The card rows of the given live decks, for the card-list diff. */
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

    // ── Ingest writes ────────────────────────────────────────────────────────

    /** @returns The new candidate event's id. */
    async insertEvent(values: Insertable<CandidateMetaEventsTable>): Promise<string> {
      const row = await db
        .insertInto("candidateMetaEvents")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /** Applies a partial candidate-event update. */
    async updateEvent(id: string, updates: Updateable<CandidateMetaEventsTable>): Promise<void> {
      await db.updateTable("candidateMetaEvents").set(updates).where("id", "=", id).execute();
    },

    /** @returns The new candidate deck's id. */
    async insertDeck(values: Insertable<CandidateMetaDecksTable>): Promise<string> {
      const row = await db
        .insertInto("candidateMetaDecks")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /** Applies a partial candidate-deck update. */
    async updateDeck(id: string, updates: Updateable<CandidateMetaDecksTable>): Promise<void> {
      await db.updateTable("candidateMetaDecks").set(updates).where("id", "=", id).execute();
    },

    /** Removes candidate decks the upload no longer carries. */
    async deleteDecks(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidateMetaDecks").where("id", "in", ids).execute();
    },

    // ── Queue reads ──────────────────────────────────────────────────────────

    /** @returns Every candidate event, newest event date first. */
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
     * Every candidate event linked to one live event, so the review screen can
     * put one column per source next to the live values. Ordered by provider so
     * the columns keep the same places between visits.
     * @param metaEventId The live event.
     * @returns The candidates citing it.
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
     * The candidate decks hanging off live events directly — user submissions
     * (ADR-036), which target an event the archive already has rather than a
     * candidate event of their own.
     * @param metaEventIds The live events.
     * @returns Their directly-attached candidate decks.
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

    /** @returns The candidate event with that id, or `undefined`. */
    async eventById(id: string): Promise<CandidateMetaEventRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    /** @returns The candidate deck with that id, or `undefined`. */
    async deckById(id: string): Promise<CandidateMetaDeckRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    /**
     * Every candidate deck in the queue, for the list view's counts. The
     * archive is curated and small (ADR-014), so this is unpaginated like the
     * live archive reads next to it.
     * @returns All candidate decks.
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

    // ── Linking and review state ─────────────────────────────────────────────

    /**
     * Points a candidate event at a live row, and marks it reviewed. Used by an
     * accept that created the row, by an admin linking this source to an event
     * another source already produced, and by a relink moving it (ADR-014,
     * multi-source) — the three differ in what the *service* does around the
     * write, not in the write itself, so there is one method here.
     * @returns Whether the candidate existed.
     */
    linkEvent(id: string, metaEventId: string, checkedAt: Date): Promise<boolean> {
      return setEventLink(id, metaEventId, checkedAt);
    },

    /**
     * Clears a candidate event's link. `checked_at` is deliberately left
     * alone: unlinking does not un-review the row, and it is not a source
     * change either.
     * @returns Whether the candidate existed.
     */
    unlinkEvent(id: string): Promise<boolean> {
      return setEventLink(id, null);
    },

    /** @returns Whether the candidate existed. @see linkEvent */
    linkDeck(id: string, deckId: string, checkedAt: Date): Promise<boolean> {
      return setDeckLink(id, deckId, checkedAt);
    },

    /** @returns Whether the candidate existed. @see unlinkEvent */
    unlinkDeck(id: string): Promise<boolean> {
      return setDeckLink(id, null);
    },

    /**
     * Marks a candidate event reviewed (or un-reviews it), without accepting.
     * @returns Whether the candidate existed.
     */
    async setEventCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaEvents")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /** @returns Whether the candidate deck existed. @see setEventCheckedAt */
    async setDeckCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaDecks")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    // ── Rematch ──────────────────────────────────────────────────────────────

    /**
     * Candidate decks holding at least one card name that resolved to nothing —
     * the rows a rematch pass has any reason to revisit. The predicate runs in
     * the database so an archive of fully-resolved decks costs one cheap scan.
     * @returns The decks with unresolved card names.
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

    // ── Ignore lists ─────────────────────────────────────────────────────────

    /** @returns Both ignore lists, newest first. */
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
     * @returns Whether a candidate row was removed.
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

    /** @returns Whether the ignore entry existed. */
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
     * @param provider The source that pushed the deck.
     * @param key The deck's event-scoped source key.
     * @param deckId The staged row to drop.
     * @returns Whether a candidate row was removed.
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

    /** @returns Whether the ignore entry existed. */
    async unignoreDeck(provider: string, key: MetaCandidateDeckKey): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredCandidateMetaDecks")
        .where("provider", "=", provider)
        .where("eventExternalId", "=", key.eventExternalId)
        .where("externalId", "=", key.externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    // ── Catalog lookups ──────────────────────────────────────────────────────

    /** @returns Display names for the given cards, keyed by card id. */
    async cardNamesByIds(cardIds: string[]): Promise<Map<string, string>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("id", "in", cardIds)
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },
  };
}
