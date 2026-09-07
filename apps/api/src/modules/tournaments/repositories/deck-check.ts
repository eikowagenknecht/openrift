import type { DeckCheckCardLine } from "@openrift/shared/deck-check";
import type {
  DeckCheckChangeSummary,
  DeckCheckClaimSource,
  DeckCheckEntryState,
  DeckCheckListLockMode,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
} from "@openrift/shared/types/api/deck-check";
import type {
  TournamentHostType,
  TournamentParticipantStatus,
  TournamentPlayMode,
  TournamentStatus,
} from "@openrift/shared/types/api/tournament";
import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckCheckEntriesTable,
  DeckCheckEntryCardsTable,
  TournamentParticipantsTable,
  TournamentsTable,
} from "../../../db/index.js";
import { imageId, requireFrontImage } from "../../../repositories/query-helpers.js";

export type DeckCheckEntryCard = Selectable<DeckCheckEntryCardsTable>;

export interface DeckCheckHost {
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
}

/**
 * The deck-check "event" view of a deck-check tournament: a `tournaments` row
 * that collects decklists (`deck_submission <> 'none'`), its fields mapped
 * onto tournament columns by `tournamentToEvent`.
 */
export interface DeckCheckEvent {
  id: string;
  groupId: string | null;
  name: string;
  eventDate: Date | null;
  format: string | null;
  /** A 2v2 event's decks are additionally checked against the 2v2 banlist. */
  playMode: TournamentPlayMode;
  allowedSets: string[] | null;
  status: "active" | "archived";
  listLockMode: DeckCheckListLockMode;
  allowSelfSubmission: boolean;
  submissionToken: string | null;
  submissionsCloseAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeckCheckEventWithCounts extends DeckCheckEvent {
  entryCount: number;
  approvedCount: number;
  checkedCount: number;
}

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

export interface NewDeckCheckEntryCard {
  sortOrder: number;
  rawName: string;
  section: string;
  zone: string;
  quantity: number;
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

/**
 * How one decklist line resolved. Row-shaped, so it lives with the repository
 * that writes it; the resolving itself is
 * `services/deck-check-card-resolution.ts`.
 */
export interface CardResolution {
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

function tournamentToEvent(row: Selectable<TournamentsTable>): DeckCheckEvent {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    eventDate: row.startsAt,
    format: row.deckFormat,
    playMode: row.playMode,
    status: eventStatusForTournamentStatus(row.status),
    listLockMode: row.listLockMode,
    allowSelfSubmission: row.selfRegistration,
    submissionToken: row.submissionToken,
    submissionsCloseAt: row.submissionsCloseAt,
    allowedSets: row.allowedSets,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Deck-check treats an event as active for its whole pre-tournament and running
 * life. Decks are handed in *before* the tournament starts, so `setup` (the
 * state a wizard-created tournament sits in until round 1 is generated, which
 * never happens when OpenRift is used only for deck check) is a valid push
 * window. Only a finished (`completed`) or called-off (`cancelled`) event is
 * archived and refuses pushes.
 */
export function eventStatusForTournamentStatus(status: TournamentStatus): "active" | "archived" {
  return status === "completed" || status === "cancelled" ? "archived" : "active";
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

/**
 * Data access for the deck-check subsystem: deck-check tournaments, entries
 * keyed off a unified `tournament_participants` identity, and catalog
 * resolution. The host-scoped push keys live in `deck-check-keys.ts`.
 */
// oxlint-disable-next-line max-lines-per-function -- repository factory, one method per query
export function deckCheckRepo(db: Kysely<Database>) {
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
    // A deck-check event is created and its lifecycle driven through the
    // umbrella tournament CRUD (`repos.tournaments`), so there are no
    // create/update-event methods here. The event view is read-only.

    /** The ingest path's read: the push key resolves to a host, not a group. */
    async getEventForHost(
      host: DeckCheckHost,
      tournamentId: string,
    ): Promise<DeckCheckEvent | undefined> {
      let query = db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", tournamentId)
        .where("deckSubmission", "!=", "none");
      query =
        host.hostType === "user"
          ? query.where("hostType", "=", "user").where("hostUserId", "=", host.hostUserId)
          : query.where("hostType", "=", "organization").where("hostOrgId", "=", host.hostOrgId);
      const row = await query.executeTakeFirst();
      return row ? tournamentToEvent(row) : undefined;
    },

    async getEventById(tournamentId: string): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", tournamentId)
        .where("deckSubmission", "!=", "none")
        .executeTakeFirst();
      return row ? tournamentToEvent(row) : undefined;
    },

    async getEventBySubmissionToken(
      token: string,
    ): Promise<(DeckCheckEvent & { groupName: string }) | undefined> {
      // Left join: a host without a friend group still resolves its
      // submission token; the group name is only used as a label.
      const row = await db
        .selectFrom("tournaments as ev")
        .leftJoin("friendGroups as g", "g.id", "ev.groupId")
        .selectAll("ev")
        .select((eb) => eb.ref("g.name").as("groupName"))
        .where("ev.submissionToken", "=", token)
        .where("ev.deckSubmission", "!=", "none")
        .executeTakeFirst();
      return row ? { ...tournamentToEvent(row), groupName: row.groupName ?? "" } : undefined;
    },

    async updateEventSubmission(
      tournamentId: string,
      patch: Partial<{
        allowSelfSubmission: boolean;
        submissionToken: string | null;
        submissionsCloseAt: Date | null;
      }>,
    ): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .updateTable("tournaments")
        .set({
          ...(patch.allowSelfSubmission === undefined
            ? {}
            : { selfRegistration: patch.allowSelfSubmission }),
          ...(patch.submissionToken === undefined
            ? {}
            : { submissionToken: patch.submissionToken }),
          ...(patch.submissionsCloseAt === undefined
            ? {}
            : { submissionsCloseAt: patch.submissionsCloseAt }),
        })
        .where("id", "=", tournamentId)
        .where("deckSubmission", "!=", "none")
        .returningAll()
        .executeTakeFirst();
      return row ? tournamentToEvent(row) : undefined;
    },

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

    async coverLegendsAcross(
      tournamentIds: string[],
      limit: number,
    ): Promise<{ tournamentId: string; printingId: string; imageId: string }[]> {
      if (tournamentIds.length === 0) {
        return [];
      }
      // One row per (tournament, legend card): the earliest-submitted entry's
      // printing, so one popular legend can't fill the fan several times.
      const bestPerCard = requireFrontImage(
        db
          .selectFrom("deckCheckEntries as en")
          .innerJoin("deckCheckEntryCards as c", "c.entryId", "en.id"),
        "c.resolvedPrintingId",
      )
        .select([
          "en.tournamentId",
          "c.resolvedPrintingId as printingId",
          imageId("imgf").as("imageId"),
          "en.submittedAt",
          "en.createdAt",
          "c.sortOrder",
          sql<number>`(row_number() over (
            partition by en.tournament_id, c.resolved_card_id
            order by en.submitted_at nulls last, en.created_at, c.sort_order
          ))::int`.as("printingRank"),
        ])
        .where("en.tournamentId", "in", tournamentIds)
        .where("en.allowDeckPublishing", "=", true)
        .where("en.withdrawnAt", "is", null)
        .where("c.zone", "=", WellKnown.deckZone.LEGEND)
        .where("c.resolvedPrintingId", "is not", null)
        .where(sql`${imageId("imgf")}`, "is not", null);
      // Fan slots are ranked over the deduped rows only, so a repeat legend
      // never burns a slot that a distinct one should get.
      const rankedPerTournament = db
        .selectFrom(bestPerCard.as("best"))
        .select([
          "best.tournamentId",
          "best.printingId",
          "best.imageId",
          sql<number>`(row_number() over (
            partition by best.tournament_id
            order by best.submitted_at nulls last, best.created_at, best.sort_order
          ))::int`.as("coverRank"),
        ])
        .where("best.printingRank", "=", 1);
      const rows = await db
        .selectFrom(rankedPerTournament.as("ranked"))
        .select(["ranked.tournamentId", "ranked.printingId", "ranked.imageId"])
        .where("ranked.coverRank", "<=", limit)
        .orderBy("ranked.tournamentId")
        .orderBy("ranked.coverRank")
        .execute();
      // The IS NOT NULL filters guarantee printingId/imageId here.
      return rows as { tournamentId: string; printingId: string; imageId: string }[];
    },

    async legendImagesForParticipants(participantIds: string[]): Promise<Map<string, string>> {
      if (participantIds.length === 0) {
        return new Map();
      }
      const rows = await requireFrontImage(
        db
          .selectFrom("deckCheckEntries as en")
          .innerJoin("deckCheckEntryCards as c", "c.entryId", "en.id"),
        "c.resolvedPrintingId",
      )
        .select([
          "en.participantId",
          imageId("imgf").as("imageId"),
          sql<number>`(row_number() over (
            partition by en.participant_id
            order by en.submitted_at nulls last, en.created_at, c.sort_order
          ))::int`.as("rank"),
        ])
        .where("en.participantId", "in", participantIds)
        .where("en.allowDeckPublishing", "=", true)
        .where("en.withdrawnAt", "is", null)
        .where("c.zone", "=", WellKnown.deckZone.LEGEND)
        .where(sql`${imageId("imgf")}`, "is not", null)
        .execute();
      const images = new Map<string, string>();
      for (const row of rows) {
        if (row.rank === 1 && row.participantId && row.imageId) {
          images.set(row.participantId, row.imageId);
        }
      }
      return images;
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

    listCardsForEntry(entryId: string): Promise<DeckCheckEntryCard[]> {
      return db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entryId)
        .orderBy("sortOrder", "asc")
        .execute();
    },

    async replaceEntryCards(entryId: string, cards: NewDeckCheckEntryCard[]): Promise<void> {
      await db.deleteFrom("deckCheckEntryCards").where("entryId", "=", entryId).execute();
      if (cards.length > 0) {
        await db
          .insertInto("deckCheckEntryCards")
          .values(cards.map((card) => ({ ...card, entryId })))
          .execute();
      }
    },

    async updateCardName(
      entryId: string,
      cardId: string,
      rawName: string,
      resolution: CardResolution,
    ): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckEntryCards")
        .set({
          rawName,
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        })
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    /**
     * Moves copies of a card line into another zone, renaming and re-resolving
     * the line in the same step. Moving fewer than all copies splits the line,
     * leaving the remainder where it was; copies landing in a zone that already
     * holds the same resolved card merge into that line. A re-zone to the line's
     * current zone is treated as a plain rename, never a split. Found ticks for
     * moved (or newly merged-in) copies reset to unfound.
     */
    moveCardCopies(
      entryId: string,
      cardId: string,
      params: {
        name: string;
        resolution: CardResolution;
        section: string;
        zone: string;
        copies?: number;
      },
    ): Promise<boolean> {
      // FOR UPDATE lock on the source line serializes concurrent splits of the same line.
      // Every read/write below must use trx.
      return db.transaction().execute(async (trx) => {
        const source = await trx
          .selectFrom("deckCheckEntryCards")
          .select(["quantity", "foundCopies", "zone"])
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .forUpdate()
          .executeTakeFirst();
        if (!source) {
          return false;
        }

        const { name, resolution, section, zone } = params;
        const resolutionColumns = {
          rawName: name,
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        };

        // Re-zoning to the same zone is just a rename — never split into self.
        if (zone === source.zone) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({ ...resolutionColumns, section })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        const moveCount = Math.min(Math.max(params.copies ?? source.quantity, 1), source.quantity);
        const fullMove = moveCount >= source.quantity;
        // Dense, exact-length found arrays: the driver can't store the sparse,
        // non-1-based arrays raw subscript assignment would produce.
        const denseFound = (found: (boolean | null)[], length: number): boolean[] =>
          Array.from({ length }, (_copy, index) => Boolean(found[index]));
        // Bind the boolean[] as a typed array literal. Passing the raw JS array as
        // a Kysely value makes postgres.js bind it as a scalar boolean, so the
        // assignment fails with "column is of type boolean[] but expression is of
        // type boolean" (42804).
        const foundArray = (values: boolean[]) =>
          sql<boolean[]>`${`{${values.map((value) => (value ? "t" : "f")).join(",")}}`}::bool[]`;

        // A line already holding the same resolved card in the target zone absorbs
        // the move (matches the name+zone identity the content hash uses).
        const mergeTarget =
          resolution.matchStatus === "matched" && resolution.resolvedCardId
            ? await trx
                .selectFrom("deckCheckEntryCards")
                .select(["id", "quantity", "foundCopies"])
                .where("entryId", "=", entryId)
                .where("zone", "=", zone)
                .where("resolvedCardId", "=", resolution.resolvedCardId)
                .where("id", "!=", cardId)
                // Locked like the source line: the quantity is recomputed in
                // JS, so a concurrent merge into the same line must serialize
                // or one merge's copies are lost.
                .forUpdate()
                .executeTakeFirst()
            : undefined;

        if (mergeTarget) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({
              quantity: mergeTarget.quantity + moveCount,
              foundCopies: foundArray([
                ...denseFound(mergeTarget.foundCopies, mergeTarget.quantity),
                ...denseFound([], moveCount),
              ]),
            })
            .where("id", "=", mergeTarget.id)
            .execute();
          if (fullMove) {
            await trx
              .deleteFrom("deckCheckEntryCards")
              .where("id", "=", cardId)
              .where("entryId", "=", entryId)
              .execute();
            return true;
          }
          await trx
            .updateTable("deckCheckEntryCards")
            .set({
              ...resolutionColumns,
              quantity: source.quantity - moveCount,
              foundCopies: foundArray(denseFound(source.foundCopies, source.quantity - moveCount)),
            })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        if (fullMove) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({ ...resolutionColumns, section, zone })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        await trx
          .updateTable("deckCheckEntryCards")
          .set({
            ...resolutionColumns,
            quantity: source.quantity - moveCount,
            foundCopies: foundArray(denseFound(source.foundCopies, source.quantity - moveCount)),
          })
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .execute();
        const last = await trx
          .selectFrom("deckCheckEntryCards")
          .select("sortOrder")
          .where("entryId", "=", entryId)
          .orderBy("sortOrder", "desc")
          .limit(1)
          .executeTakeFirst();
        await trx
          .insertInto("deckCheckEntryCards")
          .values({
            entryId,
            sortOrder: (last?.sortOrder ?? -1) + 1,
            rawName: name,
            section,
            zone,
            quantity: moveCount,
            resolvedCardId: resolution.resolvedCardId,
            resolvedPrintingId: resolution.resolvedPrintingId,
            matchStatus: resolution.matchStatus,
          })
          .execute();
        return true;
      });
    },

    async updateCardZone(
      entryId: string,
      cardId: string,
      section: string,
      zone: string,
    ): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckEntryCards")
        .set({ section, zone })
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async addEntryCard(entryId: string, card: NewDeckCheckEntryCard): Promise<void> {
      await db
        .insertInto("deckCheckEntryCards")
        .values({ ...card, entryId })
        .execute();
    },

    /**
     * Removes one physical copy of a card line; removing the last copy deletes
     * the line.
     *
     * FOR UPDATE lock on the line, for the same reason as {@link moveCardCopies}:
     * without it, a concurrent decrement can drive quantity to 0 and trip the `quantity > 0` CHECK.
     */
    deleteEntryCardCopy(entryId: string, cardId: string, copyIndex: number): Promise<boolean> {
      const position = copyIndex + 1;
      const run = async (trx: Kysely<Database>): Promise<boolean> => {
        const card = await trx
          .selectFrom("deckCheckEntryCards")
          .select(["quantity"])
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .forUpdate()
          .executeTakeFirst();
        if (!card || position > card.quantity) {
          return false;
        }
        if (card.quantity === 1) {
          const result = await trx
            .deleteFrom("deckCheckEntryCards")
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .executeTakeFirst();
          return result.numDeletedRows > 0n;
        }
        const result = await sql`
          UPDATE deck_check_entry_cards
             SET quantity = quantity - 1,
                 found_copies = (
                   SELECT COALESCE(
                     array_agg(COALESCE(found_copies[gs.i], false) ORDER BY gs.i),
                     '{}'
                   )
                   FROM generate_series(1, quantity) AS gs(i)
                   WHERE gs.i <> ${position}
                 )
           WHERE id = ${cardId} AND entry_id = ${entryId} AND ${position} <= quantity
        `.execute(trx);
        return (result.numAffectedRows ?? 0n) > 0n;
      };
      return db.isTransaction ? run(db) : db.transaction().execute(run);
    },

    /**
     * Stores one physical copy's found tick. Always rewrites the whole array
     * as a dense, 1-based array of exactly `quantity` elements: sparse
     * subscript assignment (`found_copies[2] = true` on `{}`) would create an
     * array with a non-1 lower bound, which the postgres.js driver cannot
     * represent. The rewrite is computed from the row's current value inside
     * one UPDATE, so concurrent judges ticking different copies both land.
     */
    async setCardCopyFound(
      entryId: string,
      cardId: string,
      copyIndex: number,
      found: boolean,
    ): Promise<boolean> {
      const position = copyIndex + 1;
      const result = await sql`
        UPDATE deck_check_entry_cards
           SET found_copies = (
             SELECT array_agg(
               CASE
                 WHEN gs.i = ${position} THEN ${found}
                 ELSE COALESCE(found_copies[gs.i], false)
               END
               ORDER BY gs.i
             )
             FROM generate_series(1, quantity) AS gs(i)
           )
         WHERE id = ${cardId} AND entry_id = ${entryId} AND ${position} <= quantity
      `.execute(db);
      return (result.numAffectedRows ?? 0n) > 0n;
    },

    /**
     * Marks every physical copy of every card line in an entry as found, when
     * a judge marks the list checked: concluding the check implies the whole
     * list was verified, so the found ticks are filled to match.
     */
    async markAllCopiesFound(entryId: string): Promise<void> {
      await sql`
        UPDATE deck_check_entry_cards
           SET found_copies = (
             SELECT array_agg(true ORDER BY gs.i)
             FROM generate_series(1, quantity) AS gs(i)
           )
         WHERE entry_id = ${entryId} AND quantity > 0
      `.execute(db);
    },

    /**
     * Clears every found tick across an entry's card lines, when a judge
     * re-opens a checked list: re-checking starts from a clean slate so a
     * stale auto-fill can't read as a fresh count.
     */
    async clearAllCopiesFound(entryId: string): Promise<void> {
      await db
        .updateTable("deckCheckEntryCards")
        .set({ foundCopies: [] })
        .where("entryId", "=", entryId)
        .execute();
    },

    listUnresolvedCardsForEvent(tournamentId: string): Promise<DeckCheckEntryCard[]> {
      return (
        db
          .selectFrom("deckCheckEntryCards as c")
          .innerJoin("deckCheckEntries as en", "en.id", "c.entryId")
          .selectAll("c")
          .where("en.tournamentId", "=", tournamentId)
          // An editable entry's list is invisible to officials, so the
          // event-wide re-resolve leaves its lines alone too.
          .where("en.state", "!=", "editable")
          .where("c.matchStatus", "!=", "matched")
          .execute()
      );
    },

    async updateCardResolution(cardId: string, resolution: CardResolution): Promise<void> {
      await db
        .updateTable("deckCheckEntryCards")
        .set({
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        })
        .where("id", "=", cardId)
        .execute();
    },
    /**
     * The canonical printing of each given card, purely to source a thumbnail
     * for a resolved decklist line. Name resolution itself is not here: it runs
     * against the shared in-memory lookup index
     * (`services/card-lookup-index.ts`), so a decklist name reaches the same
     * card the pickers, the chat lookup and the Discord bot reach.
     */
    async canonicalPrintingByCard(cardIds: string[]): Promise<Map<string, string>> {
      const thumbnailByCard = new Map<string, string>();
      if (cardIds.length === 0) {
        return thumbnailByCard;
      }
      const printingRows = await db
        .selectFrom("printingsOrdered")
        .select(["id", "cardId"])
        .where("cardId", "in", cardIds)
        .orderBy("canonicalRank", "asc")
        .execute();
      for (const row of printingRows) {
        if (!thumbnailByCard.has(row.cardId)) {
          thumbnailByCard.set(row.cardId, row.id);
        }
      }
      return thumbnailByCard;
    },

    async getCardsByShortCodes(
      shortCodes: string[],
    ): Promise<Map<string, { cardId: string; name: string; types: string[] }>> {
      if (shortCodes.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select(["p.shortCode", "c.id", "c.name", "mca.types"])
        .where("p.shortCode", "in", [...new Set(shortCodes)])
        .execute();
      const byShortCode = new Map<string, { cardId: string; name: string; types: string[] }>();
      for (const row of rows) {
        if (!byShortCode.has(row.shortCode)) {
          byShortCode.set(row.shortCode, { cardId: row.id, name: row.name, types: row.types });
        }
      }
      return byShortCode;
    },

    async getCardDetails(cardIds: string[]): Promise<
      Map<
        string,
        {
          id: string;
          name: string;
          type: string;
          types: string[];
          superTypes: string[];
          domains: string[];
          tags: string[];
          keywords: string[];
          maxCopiesOverride: number | null;
        }
      >
    > {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards as c")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select([
          "c.id",
          "c.name",
          "c.type",
          "mca.types",
          "mca.superTypes",
          "mca.domains",
          "c.tags",
          "c.keywords",
          "c.maxCopiesOverride",
        ])
        .where("c.id", "in", cardIds)
        .execute();
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            type: row.type,
            types: row.types,
            superTypes: row.superTypes ?? [],
            domains: row.domains ?? [],
            tags: row.tags ?? [],
            keywords: row.keywords ?? [],
            maxCopiesOverride: row.maxCopiesOverride,
          },
        ]),
      );
    },

    async getCardSetSlugs(cardIds: string[]): Promise<Map<string, string[]>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "s.slug"])
        .where("p.cardId", "in", cardIds)
        .groupBy(["p.cardId", "s.slug"])
        .execute();
      const bySets = new Map<string, string[]>();
      for (const row of rows) {
        const list = bySets.get(row.cardId) ?? [];
        list.push(row.slug);
        bySets.set(row.cardId, list);
      }
      return bySets;
    },
  };
}
