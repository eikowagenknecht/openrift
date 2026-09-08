import type {
  TournamentClaimSource,
  TournamentParticipantStatus,
} from "@openrift/shared/types/api/tournament";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { generateShareToken } from "../../../lib/share-token.js";
import type { TournamentParticipant } from "./tournaments-shared.js";

export interface TournamentParticipantWithUser extends TournamentParticipant {
  /** Linked account's display name; null for walk-ins. */
  userName: string | null;
}

export interface NewTournamentParticipant {
  tournamentId: string;
  displayName: string;
  /** Region tag slug (custom-tag category `region`); validated by the route. */
  region?: string | null;
  /** Fixed (physical) table number; soft, steers table assignment only. */
  fixedTable?: number | null;
  riotId?: string | null;
  userId?: string | null;
  claimSource?: TournamentClaimSource | null;
  claimToken?: string | null;
  claimedAt?: Date | null;
  status?: TournamentParticipantStatus;
}

export interface TournamentParticipantPatch {
  displayName?: string;
  region?: string | null;
  fixedTable?: number | null;
  riotId?: string | null;
  userId?: string | null;
  claimSource?: TournamentClaimSource | null;
  claimToken?: string | null;
  claimedAt?: Date | null;
  claimBlockedAt?: Date | null;
  status?: TournamentParticipantStatus;
  seed?: number | null;
  droppedAfterRound?: number | null;
}

export function tournamentParticipantsRepo(db: Kysely<Database>) {
  return {
    /**
     * Mirrors `participantCount`'s population (every status), so the facepile
     * never disagrees with the count next to it.
     */
    participantPreviewAcross(
      tournamentIds: string[],
      limit: number,
    ): Promise<
      { tournamentId: string; displayName: string; image: string | null; email: string | null }[]
    > {
      if (tournamentIds.length === 0) {
        return Promise.resolve([]);
      }
      const ranked = db
        .selectFrom("tournamentParticipants as p")
        .leftJoin("users as u", "u.id", "p.userId")
        .select([
          "p.tournamentId",
          "p.displayName",
          "u.image",
          "u.email",
          sql<number>`(row_number() over (
            partition by p.tournament_id order by p.created_at, p.id
          ))::int`.as("previewRank"),
        ])
        .where("p.tournamentId", "in", tournamentIds);
      return db
        .selectFrom(ranked.as("ranked"))
        .select(["ranked.tournamentId", "ranked.displayName", "ranked.image", "ranked.email"])
        .where("ranked.previewRank", "<=", limit)
        .orderBy("ranked.tournamentId")
        .orderBy("ranked.previewRank")
        .execute();
    },

    listParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("createdAt", "asc")
        .execute();
    },

    findParticipantById(participantId: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("id", "=", participantId)
        .executeTakeFirst();
    },

    findParticipantByClaimToken(token: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("claimToken", "=", token)
        .executeTakeFirst();
    },

    async getClaimLandingByToken(token: string): Promise<
      | {
          tournamentId: string;
          tournamentName: string;
          startsAt: Date;
          hostName: string;
          hostType: "user" | "organization";
          groupName: string | null;
          deckSubmission: "none" | "optional" | "required";
          participantName: string;
        }
      | undefined
    > {
      const row = await db
        .selectFrom("tournamentParticipants as p")
        .innerJoin("tournaments as t", "t.id", "p.tournamentId")
        .leftJoin("friendGroups as g", "g.id", "t.groupId")
        .leftJoin("organizations as o", "o.id", "t.hostOrgId")
        .leftJoin("users as hu", "hu.id", "t.hostUserId")
        .select((eb) => [
          eb.ref("t.id").as("tournamentId"),
          eb.ref("t.name").as("tournamentName"),
          eb.ref("t.startsAt").as("startsAt"),
          eb.ref("t.hostType").as("hostType"),
          eb.ref("t.deckSubmission").as("deckSubmission"),
          eb.ref("o.name").as("orgName"),
          eb.ref("hu.name").as("hostUserName"),
          eb.ref("g.name").as("groupName"),
          eb.ref("p.displayName").as("participantName"),
        ])
        .where("p.claimToken", "=", token)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }
      const hostName =
        row.hostType === "organization"
          ? (row.orgName ?? "Organization")
          : (row.hostUserName ?? "User");
      return {
        tournamentId: row.tournamentId,
        tournamentName: row.tournamentName,
        startsAt: row.startsAt,
        hostName,
        hostType: row.hostType,
        groupName: row.groupName ?? null,
        deckSubmission: row.deckSubmission,
        participantName: row.participantName,
      };
    },

    /**
     * Links only while the spot is unclaimed and not judge-blocked. The guard
     * re-checks atomically, so a race resolves to no update (a refusal), never
     * a steal.
     */
    linkParticipantByClaimTokenIfUnclaimed(
      token: string,
      userId: string,
      source: TournamentClaimSource,
    ): Promise<TournamentParticipant | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({ userId, claimSource: source, claimedAt: new Date(), updatedAt: new Date() })
        .where("claimToken", "=", token)
        .where("userId", "is", null)
        .where("claimBlockedAt", "is", null)
        .returningAll()
        .executeTakeFirst();
    },

    findParticipantByUser(
      tournamentId: string,
      userId: string,
    ): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Matches by linked account only, never by name; without a userId a fresh walk-in is created.
     * Manual entry passes a participant id directly and never goes through here.
     */
    async resolveOrCreateParticipant(input: {
      tournamentId: string;
      userId?: string | null;
      riotId?: string | null;
      displayName: string;
      claimSource?: TournamentClaimSource | null;
      claimedAt?: Date | null;
      /** Status for a newly created participant only; ignored on a match by linked account. */
      status?: TournamentParticipantStatus;
    }): Promise<TournamentParticipant> {
      if (input.userId) {
        const byUser = await this.findParticipantByUser(input.tournamentId, input.userId);
        if (byUser) {
          return byUser;
        }
      }
      return this.createParticipant({
        tournamentId: input.tournamentId,
        displayName: input.displayName,
        riotId: input.riotId ?? null,
        userId: input.userId ?? null,
        claimSource: input.claimSource ?? null,
        claimedAt: input.claimedAt ?? null,
        claimToken: generateShareToken(),
        status: input.status ?? "active",
      });
    },

    /**
     * Every participant gets a claim token so the spot can be claimed by link,
     * with or without deck check.
     */
    createParticipant(input: NewTournamentParticipant): Promise<TournamentParticipant> {
      const { status, claimToken, ...rest } = input;
      return db
        .insertInto("tournamentParticipants")
        .values({
          ...rest,
          claimToken: claimToken ?? generateShareToken(),
          status,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    updateParticipant(
      participantId: string,
      patch: TournamentParticipantPatch,
    ): Promise<TournamentParticipant | undefined> {
      const { status, ...rest } = patch;
      return db
        .updateTable("tournamentParticipants")
        .set({
          ...rest,
          ...(status === undefined ? {} : { status }),
          updatedAt: new Date(),
        })
        .where("id", "=", participantId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Clears the claim block an unlink left behind and rotates the claim
     * token, so the correct player can claim the spot through a fresh link.
     */
    reissueClaim(participantId: string): Promise<TournamentParticipant | undefined> {
      return db
        .updateTable("tournamentParticipants")
        .set({
          userId: null,
          claimSource: null,
          claimedAt: null,
          claimBlockedAt: null,
          claimToken: generateShareToken(),
          updatedAt: new Date(),
        })
        .where("id", "=", participantId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Locks the participant row (`SELECT … FOR UPDATE`). Call inside a
     * transaction before a check-then-mutate on the participant (deck-entry
     * creation, removal): a concurrent pairing holds `FOR KEY SHARE` on this
     * row through its pod_members FK inserts, so the lock serializes the two
     * and the re-check after it sees the committed truth.
     */
    async lockParticipant(participantId: string): Promise<boolean> {
      const row = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("id", "=", participantId)
        .forUpdate()
        .executeTakeFirst();
      return row !== undefined;
    },

    async deleteParticipant(participantId: string): Promise<void> {
      // The decklist is discarded too, via the deck_check_entries
      // participant_id ON DELETE CASCADE FK — no code path can leave an
      // orphaned entry. Claim/link/re-submit never delete a participant, so
      // the cascade only fires on an explicit removal.
      await db.deleteFrom("tournamentParticipants").where("id", "=", participantId).execute();
    },

    /**
     * A participant in a pod or holding a bye cannot be hard-deleted; the host
     * drops it instead, mirroring the pod player guard.
     */
    async participantHasMemberships(participantId: string): Promise<boolean> {
      const member = await db
        .selectFrom("podMembers")
        .select("podId")
        .where("playerId", "=", participantId)
        .executeTakeFirst();
      if (member !== undefined) {
        return true;
      }
      const bye = await db
        .selectFrom("podByes")
        .select("roundId")
        .where("playerId", "=", participantId)
        .executeTakeFirst();
      return bye !== undefined;
    },

    listParticipantsWithUser(tournamentId: string): Promise<TournamentParticipantWithUser[]> {
      return db
        .selectFrom("tournamentParticipants as p")
        .leftJoin("users as u", "u.id", "p.userId")
        .selectAll("p")
        .select((eb) => eb.ref("u.name").as("userName"))
        .where("p.tournamentId", "=", tournamentId)
        .orderBy("p.createdAt", "asc")
        .execute();
    },

    async participantTournamentIdsAcross(
      tournamentIds: string[],
      userId: string,
    ): Promise<string[]> {
      if (tournamentIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("tournamentParticipants")
        .select("tournamentId")
        .where("tournamentId", "in", tournamentIds)
        .where("userId", "=", userId)
        .execute();
      return rows.map((row) => row.tournamentId);
    },
  };
}
