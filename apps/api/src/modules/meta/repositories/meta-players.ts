import type { CardType, MetaEntryStatus, MetaListStatus } from "@openrift/shared/types/enums";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database, MetaEventPlayersTable } from "../../../db/index.js";
import type { MetaArchivedDeckInput } from "./meta-decks.js";
import { insertDeckForPlayer } from "./meta-decks.js";
import { resolvedPlayerName } from "./meta-shared.js";

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

export function metaPlayersRepo(db: Kysely<Database>) {
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

  return {
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
  };
}
