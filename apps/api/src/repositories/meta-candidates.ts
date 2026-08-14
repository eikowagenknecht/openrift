import type { MetaListStatus } from "@openrift/shared/types";
import type { Insertable, Kysely, RawBuilder, Selectable, SqlBool, Updateable } from "kysely";
import { sql } from "kysely";

import { parseJsonb, parseJsonbRequired } from "../db/helpers.js";
import type {
  CandidateMetaDeckCard,
  CandidateMetaDecksTable,
  CandidateMetaEventsTable,
  Database,
  MetaEventsTable,
} from "../db/index.js";

/**
 * Binds a JSON-serialized value as real jsonb. postgres.js sends a plain
 * string parameter to a jsonb column as a jsonb *string scalar* (the JSON text
 * double-encoded), which SQL-side functions like `jsonb_array_elements` choke
 * on with "cannot extract elements from a scalar". The explicit text-to-jsonb
 * cast makes the database parse the text into the actual structure instead.
 *
 * @param value The JSON text, or null for a NULL column.
 * @returns A raw expression usable wherever the column's write type is string.
 */
function asJsonb(value: string): RawBuilder<string> {
  return sql<string>`${value}::jsonb`;
}

/**
 * Nullable companion of {@link asJsonb} for optional jsonb columns.
 * @param value The JSON text, or null/undefined for a NULL column.
 * @returns The cast expression, or null.
 */
function asJsonbNullable(value: string | null | undefined): RawBuilder<string> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asJsonb(value);
}

/** A candidate event exactly as stored. */
export type CandidateMetaEventRow = Selectable<CandidateMetaEventsTable>;

/** A candidate deck with its `cards` jsonb already parsed. */
export type CandidateMetaDeckRow = Selectable<CandidateMetaDecksTable>;

/** A live event reached through its source key, so `sourceExternalId` is known non-null. */
export type LiveMetaEventRow = Selectable<MetaEventsTable> & { sourceExternalId: string };

/** A live archived deck seen through its source key, with the fields a diff reads. */
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
  sourceEventExternalId: string | null;
  sourceExternalId: string | null;
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
 * `postgres.js` under Bun hands jsonb back as a string, so every read of the
 * `cards` column goes through this rather than trusting the Kysely row type.
 * @param row The raw candidate deck row.
 * @returns The row with `cards` parsed.
 */
function toDeckRow(row: CandidateMetaDeckRow): CandidateMetaDeckRow {
  return { ...row, cards: parseJsonbRequired<CandidateMetaDeckCard[]>(row.cards) };
}

/**
 * The same defensive jsonb read for the event's nullable `extra_data`.
 * @param row The raw candidate event row.
 * @returns The row with `extraData` parsed.
 */
function toEventRow(row: Selectable<CandidateMetaEventsTable>): CandidateMetaEventRow {
  return { ...row, extraData: parseJsonb(row.extraData) };
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
   * The live archived deck shape both source-key and id lookups return: the
   * satellite placement plus the deck's own name and permalink.
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
        "md.sourceEventExternalId",
        "md.sourceExternalId",
      ]);
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
      return rows.map((row) => toEventRow(row));
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
      return rows.map((row) => toDeckRow(row));
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
     * Live events this provider has already contributed, for the uploaded keys.
     * This is what re-links a candidate after an accept and what the in-sync
     * check diffs against.
     * @param provider The uploading provider.
     * @param externalIds The event keys in the payload.
     * @returns The matching live events.
     */
    liveEventsBySource(provider: string, externalIds: string[]): Promise<LiveMetaEventRow[]> {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("metaEvents")
        .selectAll()
        .where("sourceProvider", "=", provider)
        .where("sourceExternalId", "in", externalIds)
        .$narrowType<{ sourceExternalId: string }>()
        .execute();
    },

    /**
     * The live archived decks this provider contributed, within the uploaded
     * events and carrying one of the uploaded deck ids.
     *
     * The two id lists are matched independently rather than as pairs, so the
     * result can hold a deck whose event and deck ids each appear in the
     * payload but not together. The caller keys its index on the pair, which
     * drops those.
     *
     * @param provider The uploading provider.
     * @param eventExternalIds The event keys in the payload.
     * @param deckExternalIds The deck keys in the payload.
     * @returns The matching live decks, source key populated.
     */
    liveDecksBySource(
      provider: string,
      eventExternalIds: string[],
      deckExternalIds: string[],
    ): Promise<(LiveMetaDeckRow & { sourceEventExternalId: string; sourceExternalId: string })[]> {
      if (eventExternalIds.length === 0 || deckExternalIds.length === 0) {
        return Promise.resolve([]);
      }
      return liveDeckQuery()
        .where("md.sourceProvider", "=", provider)
        .where("md.sourceEventExternalId", "in", eventExternalIds)
        .where("md.sourceExternalId", "in", deckExternalIds)
        .$narrowType<{ sourceEventExternalId: string; sourceExternalId: string }>()
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
      const { extraData, ...rest } = values;
      const row = await db
        .insertInto("candidateMetaEvents")
        .values({ ...rest, extraData: asJsonbNullable(extraData) })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /** Applies a partial candidate-event update. */
    async updateEvent(id: string, updates: Updateable<CandidateMetaEventsTable>): Promise<void> {
      const { extraData, ...rest } = updates;
      await db
        .updateTable("candidateMetaEvents")
        .set(extraData === undefined ? rest : { ...rest, extraData: asJsonbNullable(extraData) })
        .where("id", "=", id)
        .execute();
    },

    /**
     * @param values The deck's columns; `cards` is serialized here so callers
     *   never hand-stringify jsonb.
     * @returns The new candidate deck's id.
     */
    async insertDeck(
      values: Omit<Insertable<CandidateMetaDecksTable>, "cards"> & {
        cards: CandidateMetaDeckCard[];
      },
    ): Promise<string> {
      const row = await db
        .insertInto("candidateMetaDecks")
        .values({ ...values, cards: asJsonb(JSON.stringify(values.cards)) })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /** Applies a partial candidate-deck update. @see insertDeck for the `cards` handling. */
    async updateDeck(
      id: string,
      updates: Omit<Updateable<CandidateMetaDecksTable>, "cards"> & {
        cards?: CandidateMetaDeckCard[];
      },
    ): Promise<void> {
      const { cards, ...rest } = updates;
      await db
        .updateTable("candidateMetaDecks")
        .set(cards === undefined ? rest : { ...rest, cards: asJsonb(JSON.stringify(cards)) })
        .where("id", "=", id)
        .execute();
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
      return rows.map((row) => toEventRow(row));
    },

    /** @returns The candidate event with that id, or `undefined`. */
    async eventById(id: string): Promise<CandidateMetaEventRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : toEventRow(row);
    },

    /** @returns The candidate deck with that id, or `undefined`. */
    async deckById(id: string): Promise<CandidateMetaDeckRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaDecks")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row === undefined ? undefined : toDeckRow(row);
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
      return rows.map((row) => toDeckRow(row));
    },

    // ── Linking and review state ─────────────────────────────────────────────

    /** Points a candidate event at the live row it was accepted into, and marks it reviewed. */
    async linkEvent(id: string, metaEventId: string, checkedAt: Date): Promise<void> {
      await db
        .updateTable("candidateMetaEvents")
        .set({ metaEventId, checkedAt })
        .where("id", "=", id)
        .execute();
    },

    /** Points a candidate deck at the live deck it was accepted into, and marks it reviewed. */
    async linkDeck(id: string, deckId: string, checkedAt: Date): Promise<void> {
      await db
        .updateTable("candidateMetaDecks")
        .set({ deckId, checkedAt })
        .where("id", "=", id)
        .execute();
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
        // no Kysely expression form. The CASE tolerates legacy rows written as
        // jsonb string scalars before asJsonbParam existed (see its comment).
        .where(
          sql<SqlBool>`EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(cards) = 'array' THEN cards
                   ELSE (cards #>> '{}')::jsonb END
            ) AS card
            WHERE card ->> 'cardId' IS NULL
          )`,
        )
        .execute();
      return rows.map((row) => toDeckRow(row));
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
