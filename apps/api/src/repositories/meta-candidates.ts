import { legendDisplayName } from "@openrift/shared";
import type { MetaEventTier } from "@openrift/shared";
import type { Insertable, Kysely, Selectable, SqlBool, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  CandidateMetaEventsTable,
  CandidateMetaMatchesTable,
  CandidateMetaPlayersTable,
  Database,
  MetaEventsTable,
} from "../db/index.js";
import { UVSGAMES_PROVIDER } from "../lib/uvsgames-catalog.js";
import { cardTypesColumn } from "./query-helpers.js";

export type CandidateMetaEventRow = Selectable<CandidateMetaEventsTable>;

/** What the classification rules recompute for one candidate. */
export interface MetaCandidateClassification {
  id: string;
  tier: MetaEventTier;
  country: string | null;
  location: string | null;
}

export type CandidateMetaPlayerRow = Selectable<CandidateMetaPlayersTable>;

export type CandidateMetaMatchRow = Selectable<CandidateMetaMatchesTable>;

export type NewCandidateMetaMatch = Insertable<CandidateMetaMatchesTable>;

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

/** Carries the source's event id too, because player external ids repeat across events. */
export interface IgnoredMetaCandidatePlayerRow extends IgnoredMetaCandidateRow {
  eventExternalId: string;
}

export interface MetaCandidatePlayerKey {
  eventExternalId: string;
  externalId: string;
}

/** One candidate feeding a live event, as the admin event list links back to it. */
export interface MetaEventSourceLinkRow {
  metaEventId: string;
  candidateEventId: string;
  provider: string;
}

/**
 * One uvsgames candidate with the source facts the tier and country rules read,
 * plus the linked live row's current values so the reclassify pass can tell a
 * pipeline-written value from a human edit.
 */
export interface MetaClassificationRow {
  candidateEventId: string;
  name: string;
  playerCount: number | null;
  tier: string | null;
  country: string | null;
  location: string | null;
  sourceLocation: string | null;
  /** The admin-mapped tier of the candidate's template; null when unmapped or template-less. */
  templateTier: MetaEventTier | null;
  metaEventId: string | null;
  liveTier: string | null;
  liveCountry: string | null;
  liveLocation: string | null;
}

/**
 * How many rows one batched write carries. A Regional's field is a couple of
 * thousand players, and the parameter list has to stay well inside Postgres'
 * per-statement limit.
 */
const WRITE_CHUNK = 500;

function chunked<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    out.push(rows.slice(index, index + size));
  }
  return out;
}

/**
 * Queries for the meta archive's candidate staging tables. Live `meta_events` /
 * `meta_event_players` writes stay in `metaRepo` — this repo owns the candidate
 * rows and the ignore lists.
 *
 * An ignore marks the key and leaves the candidate row in place, live link
 * included (ADR-014, second revision). So every read the review queue uses
 * filters ignored keys out with a join, and only the by-id reads — which the
 * accept, link, and un-ignore paths need — return them.
 */
export function metaCandidatesRepo(db: Kysely<Database>) {
  /**
   * The ignore key names the *source's* event, which lives on the candidate's
   * parent rather than on the player row. A user submission has no parent, so
   * the join yields NULL and the row is never ignored — which is correct: a
   * submission has no source-event key and is turned down through its ledger.
   */
  const notIgnoredPlayer = sql<SqlBool>`not exists (
    select 1 from ignored_candidate_meta_players i
     where i.provider = pe.provider
       and i.event_external_id = pe.external_id
       and i.external_id = p.external_id
  )`;

  const notIgnoredEvent = sql<SqlBool>`not exists (
    select 1 from ignored_candidate_meta_events i
     where i.provider = e.provider and i.external_id = e.external_id
  )`;

  function visiblePlayerQuery() {
    return db
      .selectFrom("candidateMetaPlayers as p")
      .leftJoin("candidateMetaEvents as pe", "pe.id", "p.candidateEventId")
      .selectAll("p")
      .where(notIgnoredPlayer);
  }

  function visibleEventQuery() {
    return db.selectFrom("candidateMetaEvents as e").selectAll("e").where(notIgnoredEvent);
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

  async function setPlayerLink(
    id: string,
    metaEventPlayerId: string | null,
    checkedAt?: Date,
  ): Promise<boolean> {
    const result = await db
      .updateTable("candidateMetaPlayers")
      .set(checkedAt === undefined ? { metaEventPlayerId } : { metaEventPlayerId, checkedAt })
      .where("id", "=", id)
      .executeTakeFirst();
    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  return {
    /**
     * Scoped to the uploaded keys rather than the whole provider because ingest
     * replaces per event: rows the upload doesn't name are not read and not
     * touched. Unfiltered by the ignore list — ingest has to find an ignored
     * row to leave it alone rather than staging a second copy of it.
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

    async playersByCandidateEventIds(eventIds: string[]): Promise<CandidateMetaPlayerRow[]> {
      if (eventIds.length === 0) {
        return [];
      }
      const rows = await visiblePlayerQuery()
        .where("p.candidateEventId", "in", eventIds)
        .orderBy("p.rank", "asc")
        .orderBy("p.playerName", "asc")
        .execute();
      return rows;
    },

    /** Ingest's view: ignored rows included, so a replace never deletes one. */
    async allPlayersByCandidateEventIds(eventIds: string[]): Promise<CandidateMetaPlayerRow[]> {
      if (eventIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("candidateMetaPlayers")
        .selectAll()
        .where("candidateEventId", "in", eventIds)
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

    async ignoredPlayerKeys(provider: string): Promise<MetaCandidatePlayerKey[]> {
      const rows = await db
        .selectFrom("ignoredCandidateMetaPlayers")
        .select(["eventExternalId", "externalId"])
        .where("provider", "=", provider)
        .execute();
      return rows.map((row) => ({
        eventExternalId: row.eventExternalId,
        externalId: row.externalId,
      }));
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

    /**
     * Writes the recomputed classification onto many candidates at once, for the
     * reclassify pass over the whole mirror.
     */
    async setClassifications(rows: readonly MetaCandidateClassification[]): Promise<void> {
      for (const chunk of chunked(rows, WRITE_CHUNK)) {
        const values = sql.join(
          chunk.map(
            (row) =>
              sql`(${row.id}::uuid, ${row.tier}::text, ${row.country}::text, ${row.location}::text)`,
          ),
        );
        await sql`
          update candidate_meta_events as c
             set tier = v.tier, country = v.country, location = v.location
            from (values ${values}) as v(id, tier, country, location)
           where c.id = v.id
        `.execute(db);
      }
    },

    async updateEvent(id: string, updates: Updateable<CandidateMetaEventsTable>): Promise<void> {
      await db.updateTable("candidateMetaEvents").set(updates).where("id", "=", id).execute();
    },

    /**
     * One page of uvsgames candidates with their source facts and live values,
     * for the reclassify pass. The mirror runs to six figures, so the pass walks
     * the table on the candidate id rather than materializing it: `afterId` is
     * the last id of the page before. `templateId` narrows the pass to one
     * template's events, which is what a mapping edit reapplies to.
     */
    classificationRows(params: {
      templateId?: string;
      afterId?: string;
      limit: number;
    }): Promise<MetaClassificationRow[]> {
      let query = db
        .selectFrom("candidateMetaEvents as c")
        .innerJoin("uvsgamesEvents as e", "e.externalId", "c.externalId")
        .leftJoin("uvsgamesEventTemplates as t", "t.templateId", "e.eventConfigurationTemplate")
        .leftJoin("metaEvents as m", "m.id", "c.metaEventId")
        .where("c.provider", "=", UVSGAMES_PROVIDER)
        .select([
          "c.id as candidateEventId",
          "c.name",
          "c.playerCount",
          "c.tier",
          "c.country",
          "c.location",
          "e.location as sourceLocation",
          "t.tier as templateTier",
          "c.metaEventId",
          "m.tier as liveTier",
          "m.country as liveCountry",
          "m.location as liveLocation",
        ])
        .orderBy("c.id", "asc")
        .limit(params.limit);
      if (params.templateId !== undefined) {
        query = query.where("e.eventConfigurationTemplate", "=", params.templateId);
      }
      if (params.afterId !== undefined) {
        query = query.where("c.id", ">", params.afterId);
      }
      return query.execute();
    },

    async insertPlayer(values: Insertable<CandidateMetaPlayersTable>): Promise<string> {
      const row = await db
        .insertInto("candidateMetaPlayers")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    async updatePlayer(id: string, updates: Updateable<CandidateMetaPlayersTable>): Promise<void> {
      await db.updateTable("candidateMetaPlayers").set(updates).where("id", "=", id).execute();
    },

    /** The rounds already staged for one candidate, which are never refetched. */
    async matchRoundIds(candidateEventId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("candidateMetaMatches")
        .select("roundId")
        .distinct()
        .where("candidateEventId", "=", candidateEventId)
        .execute();
      return rows.map((row) => row.roundId);
    },

    /**
     * Replaces one round's staged matches wholesale. The dead rows' live
     * matches go too — this touches `meta_event_matches` so both deletes and
     * the insert share one transaction, and a half-replaced round can never
     * survive a crash.
     */
    async replaceRoundMatches(
      candidateEventId: string,
      roundId: string,
      rows: NewCandidateMetaMatch[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        const dead = await trx
          .deleteFrom("candidateMetaMatches")
          .where("candidateEventId", "=", candidateEventId)
          .where("roundId", "=", roundId)
          .returning("metaEventMatchId")
          .execute();
        const liveIds = dead
          .map((row) => row.metaEventMatchId)
          .filter((id): id is string => id !== null);
        if (liveIds.length > 0) {
          await trx.deleteFrom("metaEventMatches").where("id", "in", liveIds).execute();
        }
        if (rows.length > 0) {
          await trx.insertInto("candidateMetaMatches").values(rows).execute();
        }
      });
    },

    /** The staged matches still waiting to go live, oldest staging first. */
    unmaterializedMatches(candidateEventId: string): Promise<CandidateMetaMatchRow[]> {
      return db
        .selectFrom("candidateMetaMatches")
        .selectAll()
        .where("candidateEventId", "=", candidateEventId)
        .where("metaEventMatchId", "is", null)
        .orderBy("id", "asc")
        .execute();
    },

    /** Stamps staged matches with the live rows the materialization wrote. */
    async setMatchLiveIds(liveIdsByMatchId: ReadonlyMap<string, string>): Promise<void> {
      for (const chunk of chunked([...liveIdsByMatchId], WRITE_CHUNK)) {
        const values = sql.join(chunk.map(([id, liveId]) => sql`(${id}::uuid, ${liveId}::uuid)`));
        await sql`
          update candidate_meta_matches as m
             set meta_event_match_id = v.live_id
            from (values ${values}) as v(id, live_id)
           where m.id = v.id
        `.execute(db);
      }
    },

    /**
     * Stamps the source's player id onto rows the ingest just staged, keyed by
     * the registration id they carry as `external_id`.
     *
     * A separate write rather than part of the ingest: that path takes the
     * shared upload shape, which has no field for one source's identity, and a
     * pushed candidate genuinely has none.
     *
     * @returns How many staged rows were stamped.
     */
    async setPlayerUvsIds(
      candidateEventId: string,
      idsByExternalId: ReadonlyMap<string, number>,
    ): Promise<number> {
      let stamped = 0;
      for (const chunk of chunked([...idsByExternalId], WRITE_CHUNK)) {
        const values = sql.join(
          chunk.map(([externalId, uvsId]) => sql`(${externalId}::text, ${uvsId}::integer)`),
        );
        const result = await sql`
          update candidate_meta_players as p
             set uvsgames_player_id = v.uvs_id
            from (values ${values}) as v(external_id, uvs_id)
           where p.candidate_event_id = ${candidateEventId}::uuid
             and p.external_id = v.external_id
        `.execute(db);
        stamped += Number(result.numAffectedRows ?? 0n);
      }
      return stamped;
    },

    async deletePlayers(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidateMetaPlayers").where("id", "in", ids).execute();
    },

    async listEvents(): Promise<CandidateMetaEventRow[]> {
      const rows = await visibleEventQuery()
        .orderBy("e.eventDate", "desc")
        .orderBy("e.name", "asc")
        .execute();
      return rows;
    },

    /**
     * The candidates citing one live event. Ordered by provider so the review
     * screen's per-source columns keep the same places between visits.
     */
    async eventsByMetaEventId(metaEventId: string): Promise<CandidateMetaEventRow[]> {
      const rows = await visibleEventQuery()
        .where("e.metaEventId", "=", metaEventId)
        .orderBy("e.provider", "asc")
        .orderBy("e.externalId", "asc")
        .execute();
      return rows;
    },

    /**
     * The candidates citing each of several live events, in one pass for the
     * admin event list. Ignored keys stay out, exactly as they do in the review
     * screen's source columns.
     */
    async sourcesByMetaEventIds(metaEventIds: string[]): Promise<MetaEventSourceLinkRow[]> {
      if (metaEventIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("candidateMetaEvents as e")
        .select(["e.metaEventId", "e.id as candidateEventId", "e.provider"])
        .where(notIgnoredEvent)
        .where("e.metaEventId", "in", metaEventIds)
        .orderBy("e.provider", "asc")
        .orderBy("e.externalId", "asc")
        .$narrowType<{ metaEventId: string }>()
        .execute();
      return rows;
    },

    /**
     * The candidate players hanging off live events directly — user
     * submissions, which target an event the archive already has rather than a
     * candidate event of their own.
     */
    async playersByMetaEventIds(metaEventIds: string[]): Promise<CandidateMetaPlayerRow[]> {
      if (metaEventIds.length === 0) {
        return [];
      }
      const rows = await visiblePlayerQuery()
        .where("p.metaEventId", "in", metaEventIds)
        .orderBy("p.rank", "asc")
        .orderBy("p.playerName", "asc")
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

    async playerById(id: string): Promise<CandidateMetaPlayerRow | undefined> {
      const row = await db
        .selectFrom("candidateMetaPlayers")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row;
    },

    /**
     * Unpaginated on purpose: the archive is curated and small, like the live
     * archive reads next to it.
     */
    async allPlayers(): Promise<CandidateMetaPlayerRow[]> {
      const rows = await visiblePlayerQuery()
        .orderBy("p.rank", "asc")
        .orderBy("p.playerName", "asc")
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

    linkPlayer(id: string, metaEventPlayerId: string, checkedAt: Date): Promise<boolean> {
      return setPlayerLink(id, metaEventPlayerId, checkedAt);
    },

    unlinkPlayer(id: string): Promise<boolean> {
      return setPlayerLink(id, null);
    },

    async setEventCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaEvents")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    async setPlayerCheckedAt(id: string, checkedAt: Date | null): Promise<boolean> {
      const result = await db
        .updateTable("candidateMetaPlayers")
        .set({ checkedAt })
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Candidate rows holding at least one name that resolved to nothing — a
     * card line or the legend — which are the rows a rematch pass has any
     * reason to revisit. The predicate runs in the database so an archive of
     * fully-resolved rows costs one cheap scan.
     */
    async playersWithUnresolvedNames(): Promise<CandidateMetaPlayerRow[]> {
      const rows = await db
        .selectFrom("candidateMetaPlayers")
        .selectAll()
        // raw sql: unnesting a jsonb array and testing a key of each element has
        // no Kysely expression form.
        .where(
          sql<SqlBool>`(
            (jsonb_typeof(cards) = 'array' AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(cards) AS card
              WHERE card ->> 'cardId' IS NULL
            ))
            OR (legend_name IS NOT NULL AND legend_card_id IS NULL)
            OR (champion_name IS NOT NULL AND champion_card_id IS NULL)
          )`,
        )
        .execute();
      return rows;
    },

    async listIgnored(): Promise<{
      events: IgnoredMetaCandidateRow[];
      players: IgnoredMetaCandidatePlayerRow[];
    }> {
      const [events, players] = await Promise.all([
        db
          .selectFrom("ignoredCandidateMetaEvents")
          .selectAll()
          .orderBy("createdAt", "desc")
          .execute(),
        db
          .selectFrom("ignoredCandidateMetaPlayers")
          .selectAll()
          .orderBy("createdAt", "desc")
          .execute(),
      ]);
      return { events, players };
    },

    /**
     * Writes the ignore key and leaves the candidate row where it is. The queue
     * reads join against this table, so the row drops out of view immediately,
     * and its live link survives — which is what makes ignore, un-ignore,
     * re-upload resolve back to the same live rows instead of archiving a
     * second copy of everything the source already produced.
     */
    async ignoreEvent(provider: string, externalId: string): Promise<void> {
      await db
        .insertInto("ignoredCandidateMetaEvents")
        .values({ provider, externalId })
        .onConflict((oc) => oc.columns(["provider", "externalId"]).doNothing())
        .execute();
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
     * The key names the source's event rather than the candidate row, so it
     * survives that event's candidate being replaced by a later upload.
     */
    async ignorePlayer(provider: string, key: MetaCandidatePlayerKey): Promise<void> {
      await db
        .insertInto("ignoredCandidateMetaPlayers")
        .values({ provider, ...key })
        .onConflict((oc) => oc.columns(["provider", "eventExternalId", "externalId"]).doNothing())
        .execute();
    },

    async unignorePlayer(provider: string, key: MetaCandidatePlayerKey): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredCandidateMetaPlayers")
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
