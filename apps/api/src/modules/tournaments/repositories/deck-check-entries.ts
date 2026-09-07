import type { DeckCheckCardLine } from "@openrift/shared/deck-check";
import type {
  DeckCheckChangeSummary,
  DeckCheckClaimSource,
  DeckCheckEntryState,
  DeckCheckReviewOutcome,
} from "@openrift/shared/types/api/deck-check";
import type { TournamentParticipantStatus } from "@openrift/shared/types/api/tournament";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  DeckCheckEntriesTable,
  TournamentParticipantsTable,
} from "../../../db/tables/tournaments.js";
import { eventStatusForTournamentStatus } from "./deck-check-shared.js";

/**
 * A deck-check entry plus the per-person identity it sources from its
 * `tournament_participants` row. The identity/claim columns live on the
 * participant; reads flatten them onto the entry so the response mappers keep
 * the same field names. The sharing-consent flags (`allowNameSharing` /
 * `allowRiotIdSharing` / `allowDeckPublishing`) stay on the entry itself.
 */
export type DeckCheckEntry = Selectable<DeckCheckEntriesTable> & {
  playerName: string;
  riotId: string | null;
  claimedUserId: string | null;
  claimSource: DeckCheckClaimSource | null;
  claimedAt: Date | null;
  claimBlockedAt: Date | null;
  claimToken: string | null;
};

export interface DeckCheckEntrySummary extends DeckCheckEntry {
  checkedByName: string | null;
  approvedByName: string | null;
  claimedUserName: string | null;
  participantStatus: TournamentParticipantStatus | null;
  copyCount: number;
  verifiedCopyCount: number;
  unmatchedLineCount: number;
}

export interface NewDeckCheckEntry {
  tournamentId: string;
  /**
   * Entries always attach to an existing participant — resolve or create it
   * (e.g. via `tournaments.resolveOrCreateParticipant`) before calling.
   */
  participantId: string;
  externalId: string;
  submittedAt: Date | null;
  /** Sharing-consent flags; omitted = the column default (true, opt-out model). */
  allowDeckPublishing?: boolean;
  allowNameSharing?: boolean;
  allowRiotIdSharing?: boolean;
  contentHash: string;
  withdrawnAt: Date | null;
  state?: DeckCheckEntryState;
}

export interface PlayerDeckCheckEntryRow extends DeckCheckEntry {
  eventName: string;
  eventDate: Date | string | null;
  eventStatus: string;
  submissionsCloseAt: Date | null;
  /** Null for a personally-hosted tournament with no owning friend group. */
  groupName: string | null;
  /** Null for a personally-hosted tournament with no owning friend group. */
  groupSlug: string | null;
}

interface JoinedIdentity {
  playerName: string | null;
  riotId: string | null;
  claimedUserId: string | null;
  claimSource: DeckCheckClaimSource | null;
  claimedAt: Date | null;
  claimBlockedAt: Date | null;
  claimToken: string | null;
}

function materializeEntry<
  T extends JoinedIdentity & { changeSummary: unknown; preEditLines: unknown },
>(row: T): DeckCheckEntry {
  const base = row;
  return {
    ...base,
    playerName: row.playerName ?? "",
    riotId: row.riotId ?? null,
    claimedUserId: row.claimedUserId ?? null,
    claimSource: row.claimSource ?? null,
    claimedAt: row.claimedAt ?? null,
    claimBlockedAt: row.claimBlockedAt ?? null,
    claimToken: row.claimToken ?? null,
  } as DeckCheckEntry;
}

export function deckCheckEntriesRepo(db: Kysely<Database>) {
  function selectEntryWithParticipant() {
    return db
      .selectFrom("deckCheckEntries as en")
      .leftJoin("tournamentParticipants as p", "p.id", "en.participantId")
      .selectAll("en")
      .select((eb) => [
        eb.ref("p.displayName").as("playerName"),
        eb.ref("p.riotId").as("riotId"),
        eb.ref("p.userId").as("claimedUserId"),
        eb.ref("p.claimSource").as("claimSource"),
        eb.ref("p.claimedAt").as("claimedAt"),
        eb.ref("p.claimBlockedAt").as("claimBlockedAt"),
        eb.ref("p.claimToken").as("claimToken"),
      ]);
  }

  /**
   * Callers add the ownership predicate (always `p.userId`) plus whichever
   * key they hold.
   */
  function selectPlayerEntry() {
    return (
      db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("tournamentParticipants as p", "p.id", "en.participantId")
        .innerJoin("tournaments as ev", "ev.id", "en.tournamentId")
        // Left join: a personally-hosted tournament with no friend group
        // still resolves; the group name/slug are only labels and stay null.
        .leftJoin("friendGroups as g", "g.id", "ev.groupId")
        .selectAll("en")
        .select((eb) => [
          eb.ref("p.displayName").as("playerName"),
          eb.ref("p.riotId").as("riotId"),
          eb.ref("p.userId").as("claimedUserId"),
          eb.ref("p.claimSource").as("claimSource"),
          eb.ref("p.claimedAt").as("claimedAt"),
          eb.ref("p.claimBlockedAt").as("claimBlockedAt"),
          eb.ref("p.claimToken").as("claimToken"),
          eb.ref("ev.name").as("eventName"),
          eb.ref("ev.startsAt").as("eventDate"),
          eb.ref("ev.status").as("eventStatusRaw"),
          eb.ref("ev.submissionsCloseAt").as("submissionsCloseAt"),
          eb.ref("g.name").as("groupName"),
          eb.ref("g.slug").as("groupSlug"),
        ])
    );
  }

  function materializePlayerEntry(
    row: Awaited<ReturnType<ReturnType<typeof selectPlayerEntry>["executeTakeFirstOrThrow"]>>,
  ): PlayerDeckCheckEntryRow {
    return {
      ...materializeEntry(row),
      eventName: row.eventName,
      eventDate: row.eventDate,
      eventStatus: eventStatusForTournamentStatus(row.eventStatusRaw),
      submissionsCloseAt: row.submissionsCloseAt,
      groupName: row.groupName,
      groupSlug: row.groupSlug,
    };
  }

  async function loadEntryById(entryId: string): Promise<DeckCheckEntry | undefined> {
    const row = await selectEntryWithParticipant().where("en.id", "=", entryId).executeTakeFirst();
    return row ? materializeEntry(row) : undefined;
  }

  async function participantIdForEntry(entryId: string): Promise<string | null | undefined> {
    const row = await db
      .selectFrom("deckCheckEntries")
      .select("participantId")
      .where("id", "=", entryId)
      .executeTakeFirst();
    return row?.participantId;
  }

  return {
    async listEntriesForEvent(tournamentId: string): Promise<DeckCheckEntrySummary[]> {
      const rows = await db
        .selectFrom("deckCheckEntries as en")
        .leftJoin("tournamentParticipants as p", "p.id", "en.participantId")
        .leftJoin("users as u", "u.id", "en.checkedBy")
        .leftJoin("users as au", "au.id", "en.approvedBy")
        .leftJoin("users as cu", "cu.id", "p.userId")
        .selectAll("en")
        .select((eb) => [
          eb.ref("p.displayName").as("playerName"),
          eb.ref("p.status").as("participantStatus"),
          eb.ref("p.riotId").as("riotId"),
          eb.ref("p.userId").as("claimedUserId"),
          eb.ref("p.claimSource").as("claimSource"),
          eb.ref("p.claimedAt").as("claimedAt"),
          eb.ref("p.claimBlockedAt").as("claimBlockedAt"),
          eb.ref("p.claimToken").as("claimToken"),
          eb.ref("u.name").as("checkedByName"),
          eb.ref("au.name").as("approvedByName"),
          eb.ref("cu.name").as("claimedUserName"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            // ::int because sum() yields int8, which the driver returns as a
            // string; the cast makes the declared number type true at runtime.
            .select(sql<number>`coalesce(sum(c.quantity), 0)::int`.as("count"))
            .whereRef("c.entryId", "=", "en.id")
            .as("copyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(
              sql<number>`coalesce(sum((SELECT count(*) FROM unnest(c.found_copies) AS f(v) WHERE f.v)), 0)::int`.as(
                "count",
              ),
            )
            .whereRef("c.entryId", "=", "en.id")
            .as("verifiedCopyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(sql<number>`count(*)::int`.as("count"))
            .whereRef("c.entryId", "=", "en.id")
            .where("c.matchStatus", "!=", "matched")
            .as("unmatchedLineCount"),
        ])
        .where("en.tournamentId", "=", tournamentId)
        .orderBy("p.displayName", "asc")
        .execute();
      return rows.map((row) => ({
        ...materializeEntry(row),
        checkedByName: row.checkedByName ?? null,
        approvedByName: row.approvedByName ?? null,
        claimedUserName: row.claimedUserName ?? null,
        participantStatus: row.participantStatus ?? null,
        copyCount: row.copyCount ?? 0,
        verifiedCopyCount: row.verifiedCopyCount ?? 0,
        unmatchedLineCount: row.unmatchedLineCount ?? 0,
      }));
    },

    async getEntry(tournamentId: string, entryId: string): Promise<DeckCheckEntry | undefined> {
      const row = await selectEntryWithParticipant()
        .where("en.id", "=", entryId)
        .where("en.tournamentId", "=", tournamentId)
        .executeTakeFirst();
      return row ? materializeEntry(row) : undefined;
    },

    /** Takes a `FOR UPDATE` lock on the row; callers must run this inside a transaction or the lock isn't held. */
    async getEntryForUpdate(
      tournamentId: string,
      entryId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const locked = await db
        .selectFrom("deckCheckEntries")
        .select("id")
        .where("id", "=", entryId)
        .where("tournamentId", "=", tournamentId)
        .forUpdate()
        .executeTakeFirst();
      if (!locked) {
        return undefined;
      }
      const row = await selectEntryWithParticipant()
        .where("en.id", "=", entryId)
        .where("en.tournamentId", "=", tournamentId)
        .executeTakeFirst();
      return row ? materializeEntry(row) : undefined;
    },

    async getEntryByExternalId(
      tournamentId: string,
      externalId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await selectEntryWithParticipant()
        .where("en.tournamentId", "=", tournamentId)
        .where("en.externalId", "=", externalId)
        .executeTakeFirst();
      return row ? materializeEntry(row) : undefined;
    },

    /** The deck entry attached to a participant, if any (one deck per participant). */
    async findEntryIdByParticipant(participantId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .select("id")
        .where("participantId", "=", participantId)
        .executeTakeFirst();
      return row?.id;
    },

    /**
     * Mints a claim token for a participant that lacks one. Returns the token
     * now stored on the participant — `token` when this call won the guarded
     * write, the existing one when a concurrent mint beat it (so callers never
     * report a token that was not stored), or null for an entry with no
     * participant.
     */
    async setClaimTokenIfMissing(entryId: string, token: string): Promise<string | null> {
      const participantId = await participantIdForEntry(entryId);
      if (!participantId) {
        return null;
      }
      const written = await db
        .updateTable("tournamentParticipants")
        .set({ claimToken: token })
        .where("id", "=", participantId)
        .where("claimToken", "is", null)
        .executeTakeFirst();
      if (written.numUpdatedRows === 1n) {
        return token;
      }
      const row = await db
        .selectFrom("tournamentParticipants")
        .select("claimToken")
        .where("id", "=", participantId)
        .executeTakeFirst();
      return row?.claimToken ?? null;
    },

    async getUserName(userId: string): Promise<string | null> {
      const row = await db
        .selectFrom("users")
        .select("name")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.name ?? null;
    },

    async participantHasDeck(participantId: string): Promise<boolean> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .select("id")
        .where("participantId", "=", participantId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async createEntry(input: NewDeckCheckEntry): Promise<DeckCheckEntry> {
      const participant = await db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("id", "=", input.participantId)
        .executeTakeFirstOrThrow();
      const entry = await db
        .insertInto("deckCheckEntries")
        .values({
          tournamentId: input.tournamentId,
          participantId: participant.id,
          externalId: input.externalId,
          submittedAt: input.submittedAt,
          contentHash: input.contentHash,
          withdrawnAt: input.withdrawnAt,
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.allowDeckPublishing === undefined
            ? {}
            : { allowDeckPublishing: input.allowDeckPublishing }),
          ...(input.allowNameSharing === undefined
            ? {}
            : { allowNameSharing: input.allowNameSharing }),
          ...(input.allowRiotIdSharing === undefined
            ? {}
            : { allowRiotIdSharing: input.allowRiotIdSharing }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...entry,
        playerName: participant.displayName,
        riotId: participant.riotId,
        claimedUserId: participant.userId,
        claimSource: participant.claimSource,
        claimedAt: participant.claimedAt,
        claimBlockedAt: participant.claimBlockedAt,
        claimToken: participant.claimToken,
      } as DeckCheckEntry;
    },

    async updateEntry(
      entryId: string,
      patch: Partial<{
        playerName: string;
        riotId: string | null;
        submittedAt: Date | null;
        allowDeckPublishing: boolean;
        allowNameSharing: boolean;
        allowRiotIdSharing: boolean;
        contentHash: string;
        state: DeckCheckEntryState;
        reviewOutcome: DeckCheckReviewOutcome | null;
        checkedBy: string | null;
        checkedAt: Date | null;
        approvedBy: string | null;
        approvedAt: Date | null;
        unlockRequestedAt: Date | null;
        preEditLines: DeckCheckCardLine[] | null;
        notes: string | null;
        changeSummary: DeckCheckChangeSummary | null;
        withdrawnAt: Date | null;
        claimedUserId: string | null;
        claimSource: DeckCheckClaimSource | null;
        claimedAt: Date | null;
        claimBlockedAt: Date | null;
        playerMessage: string | null;
      }>,
    ): Promise<DeckCheckEntry | undefined> {
      // Identity / claim columns live on the participant; route them there.
      // The sharing-consent flags stay on the entry (see entryPatch).
      const participantPatch: Updateable<TournamentParticipantsTable> = {};
      if (patch.playerName !== undefined) {
        participantPatch.displayName = patch.playerName;
      }
      if (patch.riotId !== undefined) {
        participantPatch.riotId = patch.riotId;
      }
      if (patch.claimedUserId !== undefined) {
        participantPatch.userId = patch.claimedUserId;
      }
      if (patch.claimSource !== undefined) {
        participantPatch.claimSource = patch.claimSource;
      }
      if (patch.claimedAt !== undefined) {
        participantPatch.claimedAt = patch.claimedAt;
      }
      if (patch.claimBlockedAt !== undefined) {
        participantPatch.claimBlockedAt = patch.claimBlockedAt;
      }

      const entryPatch = {
        ...(patch.submittedAt === undefined ? {} : { submittedAt: patch.submittedAt }),
        ...(patch.allowDeckPublishing === undefined
          ? {}
          : { allowDeckPublishing: patch.allowDeckPublishing }),
        ...(patch.allowNameSharing === undefined
          ? {}
          : { allowNameSharing: patch.allowNameSharing }),
        ...(patch.allowRiotIdSharing === undefined
          ? {}
          : { allowRiotIdSharing: patch.allowRiotIdSharing }),
        ...(patch.contentHash === undefined ? {} : { contentHash: patch.contentHash }),
        ...(patch.state === undefined ? {} : { state: patch.state }),
        ...(patch.reviewOutcome === undefined ? {} : { reviewOutcome: patch.reviewOutcome }),
        ...(patch.checkedBy === undefined ? {} : { checkedBy: patch.checkedBy }),
        ...(patch.checkedAt === undefined ? {} : { checkedAt: patch.checkedAt }),
        ...(patch.approvedBy === undefined ? {} : { approvedBy: patch.approvedBy }),
        ...(patch.approvedAt === undefined ? {} : { approvedAt: patch.approvedAt }),
        ...(patch.unlockRequestedAt === undefined
          ? {}
          : { unlockRequestedAt: patch.unlockRequestedAt }),
        ...(patch.preEditLines === undefined ? {} : { preEditLines: patch.preEditLines }),
        ...(patch.notes === undefined ? {} : { notes: patch.notes }),
        ...(patch.changeSummary === undefined ? {} : { changeSummary: patch.changeSummary }),
        ...(patch.withdrawnAt === undefined ? {} : { withdrawnAt: patch.withdrawnAt }),
        ...(patch.playerMessage === undefined ? {} : { playerMessage: patch.playerMessage }),
      };

      const writesParticipant = Object.keys(participantPatch).length > 0;
      const writesEntry = Object.keys(entryPatch).length > 0;

      // One patch spans two tables, so the two writes share a transaction: a
      // failure between them would leave the participant renamed while the
      // entry kept its old state, which the checked/approved columns make
      // visible to judges immediately.
      const applyPatches = async (trx: Kysely<Database>): Promise<boolean> => {
        if (writesParticipant) {
          const row = await trx
            .selectFrom("deckCheckEntries")
            .select("participantId")
            .where("id", "=", entryId)
            .executeTakeFirst();
          if (row === undefined) {
            return false;
          }
          if (row.participantId) {
            await trx
              .updateTable("tournamentParticipants")
              .set(participantPatch)
              .where("id", "=", row.participantId)
              .execute();
          }
        }

        if (writesEntry) {
          const updated = await trx
            .updateTable("deckCheckEntries")
            .set(entryPatch)
            .where("id", "=", entryId)
            .returning("id")
            .executeTakeFirst();
          if (!updated) {
            return false;
          }
        }
        return true;
      };

      if (writesParticipant || writesEntry) {
        const applied = db.isTransaction
          ? await applyPatches(db)
          : await db.transaction().execute(applyPatches);
        if (!applied) {
          return undefined;
        }
      }

      return loadEntryById(entryId);
    },

    async deleteEntry(tournamentId: string, entryId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("deckCheckEntries")
        .where("id", "=", entryId)
        .where("tournamentId", "=", tournamentId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    getUserAccount(
      userId: string,
    ): Promise<
      { id: string; name: string | null; email: string; riotId: string | null } | undefined
    > {
      return db
        .selectFrom("users")
        .select(["id", "name", "email", "riotId"])
        .where("id", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Judge unlink: clears the participant's claim columns and sets the block so
     * no auto-match path (ingest, lazy, backfill) ever restores the bad link.
     */
    async unlinkEntry(entryId: string): Promise<DeckCheckEntry | undefined> {
      const participantId = await participantIdForEntry(entryId);
      if (!participantId) {
        return undefined;
      }
      await db
        .updateTable("tournamentParticipants")
        .set({
          userId: null,
          claimSource: null,
          claimedAt: null,
          claimBlockedAt: new Date(),
        })
        .where("id", "=", participantId)
        .execute();
      return loadEntryById(entryId);
    },

    /**
     * Guarded by ownership: returns nothing unless the entry's participant is
     * linked to the caller. The 404-vs-403 distinction happens in the route.
     */
    async getEntryForPlayer(
      entryId: string,
      userId: string,
    ): Promise<PlayerDeckCheckEntryRow | undefined> {
      const row = await selectPlayerEntry()
        .where("en.id", "=", entryId)
        .where("p.userId", "=", userId)
        .executeTakeFirst();
      return row ? materializePlayerEntry(row) : undefined;
    },

    /**
     * At most one row: a participant is unique per account per tournament, and
     * an entry belongs to exactly one participant.
     */
    async getEntryForPlayerByTournament(
      tournamentId: string,
      userId: string,
    ): Promise<PlayerDeckCheckEntryRow | undefined> {
      const row = await selectPlayerEntry()
        .where("en.tournamentId", "=", tournamentId)
        .where("p.userId", "=", userId)
        .executeTakeFirst();
      return row ? materializePlayerEntry(row) : undefined;
    },

    async getLinkedEntryForUser(
      tournamentId: string,
      userId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await selectEntryWithParticipant()
        .where("en.tournamentId", "=", tournamentId)
        .where("p.userId", "=", userId)
        .executeTakeFirst();
      return row ? materializeEntry(row) : undefined;
    },
  };
}
