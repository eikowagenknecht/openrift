import type { MetaEventOverlayField, MetaOverlayStatus } from "@openrift/shared/types";
import type { Insertable, Kysely, Selectable, SqlBool } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  MetaEventOverlaysTable,
  MetaEventPlayerOverlayCardsTable,
  MetaEventPlayerOverlaysTable,
} from "../db/index.js";
import { keyBatches, rowBatches } from "../lib/bind-batches.js";

/**
 * Sparse patches applied on top of promotion. `claimedFields` distinguishes
 * "clear this field" from "say nothing about it"; a generated CHECK per
 * column refuses a value set without being claimed.
 */

export type MetaEventOverlayRow = Selectable<MetaEventOverlaysTable>;
export type MetaPlayerOverlayRow = Selectable<MetaEventPlayerOverlaysTable>;
/** An event overlay a push provider wrote; the key-shape CHECK makes both halves non-null together. */
export type MetaPushEventOverlayRow = MetaEventOverlayRow & {
  provider: string;
  externalId: string;
};
export type MetaOverlayCardRow = Selectable<MetaEventPlayerOverlayCardsTable>;

export interface MetaSourcePlayerKey {
  eventExternalId: string;
  externalId: string;
}

/** The `<length>:<eventExternalId>` half every one of an event's player keys starts with. */
export function sourceEventKeyPrefix(eventExternalId: string): string {
  return `${eventExternalId.length}:${eventExternalId}`;
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

export interface MetaPlayerOverlayWithCards extends MetaPlayerOverlayRow {
  cards: MetaOverlayCardRow[];
}

export function metaOverlaysRepo(db: Kysely<Database>) {
  return {
    eventOverlayById(id: string): Promise<MetaEventOverlayRow | undefined> {
      return db.selectFrom("metaEventOverlays").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /**
     * The accepted patches for one event, oldest first: promotion applies
     * them in this order, so a later correction wins on a shared field.
     */
    acceptedEventOverlays(metaEventId: string): Promise<MetaEventOverlayRow[]> {
      return db
        .selectFrom("metaEventOverlays")
        .selectAll()
        .where("metaEventId", "=", metaEventId)
        .where("status", "=", "accepted")
        .orderBy("acceptedAt", "asc")
        .orderBy("id", "asc")
        .execute();
    },

    /** The events an accepted overlay claims `field` on, deduplicated. */
    async eventIdsClaimingField(field: MetaEventOverlayField): Promise<string[]> {
      const rows = await db
        .selectFrom("metaEventOverlays")
        .select("metaEventId")
        .distinct()
        .where("status", "=", "accepted")
        .where("metaEventId", "is not", null)
        .where(sql<SqlBool>`${sql.lit(field)} = any(claimed_fields)`)
        .execute();
      return rows.flatMap((row) => (row.metaEventId === null ? [] : [row.metaEventId]));
    },

    pushOverlaysForEvent(metaEventId: string): Promise<MetaPushEventOverlayRow[]> {
      return db
        .selectFrom("metaEventOverlays")
        .selectAll()
        .where("metaEventId", "=", metaEventId)
        .where("provider", "is not", null)
        .$narrowType<{ provider: string; externalId: string }>()
        .orderBy("provider", "asc")
        .orderBy("externalId", "asc")
        .execute();
    },

    /** Pending event overlays, including the proposals that carry no live target yet. */
    pendingEventOverlays(): Promise<MetaEventOverlayRow[]> {
      return db
        .selectFrom("metaEventOverlays")
        .selectAll()
        .where("status", "=", "pending")
        .orderBy("createdAt", "asc")
        .execute();
    },

    async eventOverlaysBySourceKeys(
      provider: string,
      externalIds: readonly string[],
    ): Promise<MetaEventOverlayRow[]> {
      const rows: MetaEventOverlayRow[] = [];
      for (const batch of keyBatches(externalIds)) {
        rows.push(
          ...(await db
            .selectFrom("metaEventOverlays")
            .selectAll()
            .where("provider", "=", provider)
            .where("externalId", "in", batch)
            .execute()),
        );
      }
      return rows;
    },

    async insertEventOverlay(values: Insertable<MetaEventOverlaysTable>): Promise<string> {
      const row = await db
        .insertInto("metaEventOverlays")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    async updateEventOverlay(
      id: string,
      values: Partial<Insertable<MetaEventOverlaysTable>>,
    ): Promise<void> {
      await db.updateTable("metaEventOverlays").set(values).where("id", "=", id).execute();
    },

    /**
     * The one row an admin's field edits merge into: their own accepted,
     * sourceless, noteless overlay on this event.
     */
    adminEditOverlay(
      metaEventId: string,
      userId: string,
    ): Promise<MetaEventOverlayRow | undefined> {
      return db
        .selectFrom("metaEventOverlays")
        .selectAll()
        .where("metaEventId", "=", metaEventId)
        .where("submittedByUserId", "=", userId)
        .where("status", "=", "accepted")
        .where("provider", "is", null)
        .where("submissionNote", "is", null)
        .executeTakeFirst();
    },

    /**
     * Removes an overlay outright. Reserved for an admin's own merged edit
     * row whose last claim was released; a submission is settled by status.
     */
    async deleteEventOverlay(id: string): Promise<void> {
      await db.deleteFrom("metaEventOverlays").where("id", "=", id).execute();
    },

    async playerOverlayById(id: string): Promise<MetaPlayerOverlayWithCards | undefined> {
      const overlay = await db
        .selectFrom("metaEventPlayerOverlays")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (overlay === undefined) {
        return undefined;
      }
      const cards = await db
        .selectFrom("metaEventPlayerOverlayCards")
        .selectAll()
        .where("overlayId", "=", id)
        .orderBy("lineNumber", "asc")
        .execute();
      return { ...overlay, cards };
    },

    /** The accepted patches for one event's standings, oldest first. See {@link acceptedEventOverlays}. */
    acceptedPlayerOverlays(metaEventId: string): Promise<MetaPlayerOverlayRow[]> {
      return db
        .selectFrom("metaEventPlayerOverlays")
        .leftJoin(
          "metaEventPlayers",
          "metaEventPlayers.id",
          "metaEventPlayerOverlays.metaEventPlayerId",
        )
        .selectAll("metaEventPlayerOverlays")
        .where("metaEventPlayerOverlays.status", "=", "accepted")
        .where((eb) =>
          eb.or([
            eb("metaEventPlayerOverlays.metaEventId", "=", metaEventId),
            eb("metaEventPlayers.metaEventId", "=", metaEventId),
          ]),
        )
        .orderBy("metaEventPlayerOverlays.acceptedAt", "asc")
        .orderBy("metaEventPlayerOverlays.id", "asc")
        .execute();
    },

    pendingPlayerOverlays(): Promise<MetaPlayerOverlayRow[]> {
      return db
        .selectFrom("metaEventPlayerOverlays")
        .selectAll()
        .where("status", "=", "pending")
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** The claimed lines for a set of overlays, in one round trip for the queue. */
    async cardsByOverlayIds(
      overlayIds: readonly string[],
    ): Promise<Map<string, MetaOverlayCardRow[]>> {
      const rows: MetaOverlayCardRow[] = [];
      for (const batch of keyBatches(overlayIds)) {
        rows.push(
          ...(await db
            .selectFrom("metaEventPlayerOverlayCards")
            .selectAll()
            .where("overlayId", "in", batch)
            .orderBy("lineNumber", "asc")
            .execute()),
        );
      }
      return Map.groupBy(rows, (row) => row.overlayId);
    },

    /**
     * Keyed lookup for push providers' standings rows; the key survives the
     * overlay being re-anchored when its proposed event is accepted.
     */
    async playerOverlaysBySourceKeys(
      provider: string,
      sourcePlayerKeys: readonly string[],
    ): Promise<MetaPlayerOverlayRow[]> {
      const rows: MetaPlayerOverlayRow[] = [];
      for (const batch of keyBatches(sourcePlayerKeys)) {
        rows.push(
          ...(await db
            .selectFrom("metaEventPlayerOverlays")
            .selectAll()
            .where("provider", "=", provider)
            .where("sourcePlayerKey", "in", batch)
            .execute()),
        );
      }
      return rows;
    },

    async insertPlayerOverlay(
      values: Insertable<MetaEventPlayerOverlaysTable>,
      cards: readonly Omit<Insertable<MetaEventPlayerOverlayCardsTable>, "overlayId">[],
    ): Promise<string> {
      const run = async (trx: Kysely<Database>): Promise<string> => {
        const row = await trx
          .insertInto("metaEventPlayerOverlays")
          .values(values)
          .returning("id")
          .executeTakeFirstOrThrow();
        for (const batch of rowBatches(cards.map((card) => ({ ...card, overlayId: row.id })))) {
          await trx.insertInto("metaEventPlayerOverlayCards").values(batch).execute();
        }
        return row.id;
      };
      return db.isTransaction ? await run(db) : await db.transaction().execute(run);
    },

    /**
     * Re-points the players proposed under an event overlay at the live
     * event that overlay just minted.
     */
    async adoptProposedPlayers(eventOverlayId: string, metaEventId: string): Promise<void> {
      await db
        .updateTable("metaEventPlayerOverlays")
        .set({ eventOverlayId: null, metaEventId })
        .where("eventOverlayId", "=", eventOverlayId)
        .execute();
    },

    async updatePlayerOverlay(
      id: string,
      values: Partial<Insertable<MetaEventPlayerOverlaysTable>>,
      cards?: readonly Omit<Insertable<MetaEventPlayerOverlayCardsTable>, "overlayId">[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable("metaEventPlayerOverlays").set(values).where("id", "=", id).execute();
        if (cards === undefined) {
          return;
        }
        await trx.deleteFrom("metaEventPlayerOverlayCards").where("overlayId", "=", id).execute();
        for (const batch of rowBatches(cards.map((card) => ({ ...card, overlayId: id })))) {
          await trx.insertInto("metaEventPlayerOverlayCards").values(batch).execute();
        }
      });
    },

    /** The one row an admin's field edits on a standings row merge into. See {@link adminEditOverlay}. */
    adminPlayerEditOverlay(
      metaEventPlayerId: string,
      userId: string,
    ): Promise<MetaPlayerOverlayRow | undefined> {
      return db
        .selectFrom("metaEventPlayerOverlays")
        .selectAll()
        .where("metaEventPlayerId", "=", metaEventPlayerId)
        .where("submittedByUserId", "=", userId)
        .where("status", "=", "accepted")
        .where("provider", "is", null)
        .where("submissionNote", "is", null)
        .executeTakeFirst();
    },

    /** See {@link deleteEventOverlay}: reserved for an emptied admin edit row. */
    async deletePlayerOverlay(id: string): Promise<void> {
      await db.deleteFrom("metaEventPlayerOverlays").where("id", "=", id).execute();
    },

    /**
     * Anchors an overlay to the standings row it describes. The three anchors
     * are exclusive by CHECK, so the other two are cleared in the same write.
     */
    async linkPlayerOverlay(id: string, metaEventPlayerId: string): Promise<boolean> {
      const result = await db
        .updateTable("metaEventPlayerOverlays")
        .set({ metaEventPlayerId, metaEventId: null, eventOverlayId: null })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    /**
     * The reviewer's fix for an unmatched card name; settles the lines
     * already queued, while an alias table keeps future fetches from re-asking.
     */
    async resolveCardName(cardName: string, cardId: string): Promise<number> {
      const result = await db
        .updateTable("metaEventPlayerOverlayCards")
        .set({ cardId })
        .where("cardName", "=", cardName)
        .where("cardId", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    playerOverlaysForSourceEvent(
      provider: string,
      eventExternalId: string,
    ): Promise<MetaPlayerOverlayRow[]> {
      return db
        .selectFrom("metaEventPlayerOverlays")
        .selectAll()
        .where("provider", "=", provider)
        .where("sourcePlayerKey", "like", `${escapeLike(sourceEventKeyPrefix(eventExternalId))}%`)
        .execute();
    },

    /** The standings overlays of several uploads in one query; group them by {@link sourceEventKeyPrefix}. */
    playerOverlaysForSourceEvents(
      keys: readonly { provider: string; externalId: string }[],
    ): Promise<MetaPlayerOverlayRow[]> {
      if (keys.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("metaEventPlayerOverlays")
        .selectAll()
        .where((eb) =>
          eb.or(
            keys.map((key) =>
              eb.and([
                eb("provider", "=", key.provider),
                eb(
                  "sourcePlayerKey",
                  "like",
                  `${escapeLike(sourceEventKeyPrefix(key.externalId))}%`,
                ),
              ]),
            ),
          ),
        )
        .execute();
    },

    async reanchorPlayerOverlays(
      provider: string,
      eventExternalId: string,
      metaEventId: string,
    ): Promise<number> {
      const result = await db
        .updateTable("metaEventPlayerOverlays")
        .set({ metaEventId, metaEventPlayerId: null, eventOverlayId: null })
        .where("provider", "=", provider)
        .where("sourcePlayerKey", "like", `${escapeLike(sourceEventKeyPrefix(eventExternalId))}%`)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Frees the overlays anchored to a row about to be deleted, parking them
     * on the event: a rejected overlay must outlive the row it minted.
     */
    async unanchorPlayerOverlays(metaEventPlayerId: string, metaEventId: string): Promise<number> {
      const result = await db
        .updateTable("metaEventPlayerOverlays")
        .set({ metaEventPlayerId: null, metaEventId })
        .where("metaEventPlayerId", "=", metaEventPlayerId)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Settling an overlay is a status change, never a delete: a rejected
     * patch stays visible to its submitter, and an accepted one survives re-promotes.
     */
    async setPlayerOverlayStatuses(
      ids: readonly string[],
      status: MetaOverlayStatus,
      now: Date,
    ): Promise<number> {
      let updated = 0;
      for (const batch of keyBatches(ids)) {
        const result = await db
          .updateTable("metaEventPlayerOverlays")
          .set({ status, acceptedAt: status === "accepted" ? now : null })
          .where("id", "in", batch)
          .executeTakeFirst();
        updated += Number(result.numUpdatedRows);
      }
      return updated;
    },

    async setEventOverlayStatus(
      id: string,
      status: MetaOverlayStatus,
      now: Date,
    ): Promise<boolean> {
      const result = await db
        .updateTable("metaEventOverlays")
        .set({ status, acceptedAt: status === "accepted" ? now : null })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async setPlayerOverlayStatus(
      id: string,
      status: MetaOverlayStatus,
      now: Date,
    ): Promise<boolean> {
      const result = await db
        .updateTable("metaEventPlayerOverlays")
        .set({ status, acceptedAt: status === "accepted" ? now : null })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async ignoredEventIds(provider: string): Promise<string[]> {
      const rows = await db
        .selectFrom("ignoredMetaSourceEvents")
        .select("externalId")
        .where("provider", "=", provider)
        .execute();
      return rows.map((row) => row.externalId);
    },

    async ignoredPlayerKeys(provider: string): Promise<MetaSourcePlayerKey[]> {
      return await db
        .selectFrom("ignoredMetaSourcePlayers")
        .select(["eventExternalId", "externalId"])
        .where("provider", "=", provider)
        .execute();
    },

    async ignoreEvent(provider: string, externalId: string): Promise<void> {
      await db
        .insertInto("ignoredMetaSourceEvents")
        .values({ provider, externalId })
        .onConflict((oc) => oc.columns(["provider", "externalId"]).doNothing())
        .execute();
    },

    async unignoreEvent(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredMetaSourceEvents")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    async ignorePlayer(provider: string, key: MetaSourcePlayerKey): Promise<void> {
      await db
        .insertInto("ignoredMetaSourcePlayers")
        .values({ provider, ...key })
        .onConflict((oc) => oc.columns(["provider", "eventExternalId", "externalId"]).doNothing())
        .execute();
    },

    async unignorePlayer(provider: string, key: MetaSourcePlayerKey): Promise<boolean> {
      const result = await db
        .deleteFrom("ignoredMetaSourcePlayers")
        .where("provider", "=", provider)
        .where("eventExternalId", "=", key.eventExternalId)
        .where("externalId", "=", key.externalId)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    async listIgnored(): Promise<{
      events: { provider: string; externalId: string; createdAt: Date }[];
      players: { provider: string; eventExternalId: string; externalId: string; createdAt: Date }[];
    }> {
      const events = await db
        .selectFrom("ignoredMetaSourceEvents")
        .select(["provider", "externalId", "createdAt"])
        .orderBy("createdAt", "desc")
        .execute();
      const players = await db
        .selectFrom("ignoredMetaSourcePlayers")
        .select(["provider", "eventExternalId", "externalId", "createdAt"])
        .orderBy("createdAt", "desc")
        .execute();
      return { events, players };
    },
  };
}
