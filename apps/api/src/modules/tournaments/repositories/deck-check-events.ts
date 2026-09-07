import type { DeckCheckListLockMode } from "@openrift/shared/types/api/deck-check";
import type { TournamentPlayMode } from "@openrift/shared/types/api/tournament";
import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { TournamentsTable } from "../../../db/tables/tournaments.js";
import type { DeckCheckHost } from "./deck-check-shared.js";
import { eventStatusForTournamentStatus } from "./deck-check-shared.js";

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

export function deckCheckEventsRepo(db: Kysely<Database>) {
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
  };
}
