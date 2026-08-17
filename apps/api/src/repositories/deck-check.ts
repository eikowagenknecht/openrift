import { WellKnown, normalizeNameForMatching } from "@openrift/shared";
import type {
  DeckCheckCardLine,
  DeckCheckChangeSummary,
  DeckCheckClaimSource,
  DeckCheckEntryState,
  DeckCheckListLockMode,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
  TournamentHostType,
  TournamentParticipantStatus,
  TournamentPlayMode,
  TournamentStatus,
} from "@openrift/shared";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckCheckEntriesTable,
  DeckCheckEntryCardsTable,
  TournamentParticipantsTable,
  TournamentsTable,
} from "../db/index.js";
import { imageId, requireFrontImage } from "./query-helpers.js";

export type DeckCheckEntryCard = Selectable<DeckCheckEntryCardsTable>;

/** The host a deck-check integration key (and its tournaments) belongs to. */
export interface DeckCheckHost {
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
}

/**
 * The deck-check "event" view of a deck-check tournament (ADR-033): a
 * `tournaments` row that collects decklists (`deck_submission <> 'none'`). The
 * event fields map onto tournament columns (status active/archived ↔ running/
 * completed, format ↔ deck_format, allowSelfSubmission ↔ self_registration,
 * eventDate ↔ starts_at).
 */
export interface DeckCheckEvent {
  id: string;
  groupId: string | null;
  name: string;
  eventDate: Date | null;
  format: string | null;
  /** 1v1 or 2v2: a 2v2 event's decks are additionally checked against the 2v2 banlist. */
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
 * A deck-check entry plus the per-person identity it now sources from its
 * `tournament_participants` row (ADR-033). The identity/claim columns moved off
 * the entry; reads flatten them back onto the entry so the response mappers keep
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
  /** Owning participant's status, so the judge list can flag dropped players. */
  participantStatus: TournamentParticipantStatus | null;
  copyCount: number;
  verifiedCopyCount: number;
  unmatchedLineCount: number;
}

export interface NewDeckCheckEntry {
  tournamentId: string;
  /**
   * The roster participant that owns this deck. Entries always attach to an
   * existing participant (ADR-033) — resolve or create it (e.g. via
   * `tournaments.resolveOrCreateParticipant`) before calling.
   */
  participantId: string;
  externalId: string;
  submittedAt: Date | null;
  /** Sharing-consent flags; omitted on insert = the column default (true, opt-out model). */
  allowDeckPublishing?: boolean;
  allowNameSharing?: boolean;
  allowRiotIdSharing?: boolean;
  contentHash: string;
  withdrawnAt: Date | null;
  state?: DeckCheckEntryState;
}

/** An entry as its own player reads it, on the tournament's My deck page. */
export interface PlayerDeckCheckEntryRow extends DeckCheckEntry {
  eventName: string;
  eventDate: Date | string | null;
  eventStatus: string;
  submissionsCloseAt: Date | null;
  /** Null for a personally-hosted tournament with no owning friend group (ADR-033). */
  groupName: string | null;
  /** Null for a personally-hosted tournament with no owning friend group (ADR-033). */
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

export interface CardResolutionInput {
  name: string;
}

export interface CardResolution {
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

/**
 * The lookup key `resolveCards` results are keyed by.
 * @returns The normalized card name.
 */
export function cardResolutionKey(name: string): string {
  return normalizeNameForMatching(name);
}

/**
 * Maps each Legend's colloquial "Champion, Title" display name (e.g. "Azir,
 * Emperor of the Sands") back to its card id, keyed by the normalized form.
 * That combined name normalizes to `normalize(tag) + normName`, so the mapping
 * is derived at resolve time rather than stored as a name alias. Only norms in
 * `wanted` are emitted, keeping the result proportional to the input batch.
 *
 * @returns `[normalizedComboName, cardId]` pairs for the wanted norms.
 */
export function legendComboResolutions(
  legends: readonly { id: string; normName: string; tags: readonly string[] }[],
  wanted: ReadonlySet<string>,
): { norm: string; cardId: string }[] {
  const out: { norm: string; cardId: string }[] = [];
  for (const legend of legends) {
    for (const tag of legend.tags) {
      const norm = normalizeNameForMatching(tag) + legend.normName;
      if (wanted.has(norm)) {
        out.push({ norm, cardId: legend.id });
      }
    }
  }
  return out;
}

/**
 * Maps a deck-check tournament row onto the event view used by the rest of the
 * subsystem.
 * @returns The event projection.
 */
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
 * @returns The deck-check event status for a tournament's DB status.
 */
export function eventStatusForTournamentStatus(status: TournamentStatus): "active" | "archived" {
  return status === "completed" || status === "cancelled" ? "archived" : "active";
}

/** Identity fields a participant join contributes to a flattened entry. */
interface JoinedIdentity {
  playerName: string | null;
  riotId: string | null;
  claimedUserId: string | null;
  claimSource: DeckCheckClaimSource | null;
  claimedAt: Date | null;
  claimBlockedAt: Date | null;
  claimToken: string | null;
}

/**
 * Flattens an entry row joined to its participant onto the {@link DeckCheckEntry}
 * shape, so downstream response mappers keep their field names.
 * @returns The materialized entry.
 */
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
 * Data access for the deck-check subsystem (ADR-025), re-parented onto the
 * tournaments umbrella (ADR-033): deck-check tournaments, entries keyed off a
 * unified `tournament_participants` identity, and catalog resolution. The
 * host-scoped push keys live in `deck-check-keys.ts`.
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
// oxlint-disable-next-line max-lines-per-function -- repository factory, one method per query
export function deckCheckRepo(db: Kysely<Database>) {
  /**
   * Selects an entry with its participant identity flattened.
   * @returns The base query, ready for `.where()` clauses.
   */
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
   * The player projection's base select: the entry, its participant, and the
   * tournament/group labels the player's deck page shows. Callers add the
   * ownership predicate (always `p.userId`) plus whichever key they hold.
   * @returns The query builder.
   */
  function selectPlayerEntry() {
    return (
      db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("tournamentParticipants as p", "p.id", "en.participantId")
        .innerJoin("tournaments as ev", "ev.id", "en.tournamentId")
        // Left join: a personally-hosted tournament with no friend group (ADR-033)
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

  /**
   * Flattens a {@link selectPlayerEntry} row onto the player projection.
   * @returns The entry with its tournament and group labels.
   */
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

  /** @returns The flattened entry by id, or undefined. */
  async function loadEntryById(entryId: string): Promise<DeckCheckEntry | undefined> {
    const row = await selectEntryWithParticipant().where("en.id", "=", entryId).executeTakeFirst();
    return row ? materializeEntry(row) : undefined;
  }

  /** @returns The participant id owning an entry, or undefined. */
  async function participantIdForEntry(entryId: string): Promise<string | null | undefined> {
    const row = await db
      .selectFrom("deckCheckEntries")
      .select("participantId")
      .where("id", "=", entryId)
      .executeTakeFirst();
    return row?.participantId;
  }

  return {
    // ── Events (deck-check tournaments) ───────────────────────────────────────
    //
    // A deck-check event is just a tournament with `deckSubmission != 'none'`.
    // It is created and its lifecycle (setup, running, completed/cancelled) is
    // driven through the umbrella tournament CRUD (`repos.tournaments`), so there
    // are no create/update-event methods here. The event view is read-only.

    /**
     * Loads a deck-check tournament scoped to its host (the ingest path; the key
     * resolves to a host, not a group).
     * @returns The event, or undefined when it does not match the host.
     */
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

    /**
     * Loads a deck-check tournament without group scoping (player paths).
     * @returns The event, or undefined when it does not exist.
     */
    async getEventById(tournamentId: string): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", tournamentId)
        .where("deckSubmission", "!=", "none")
        .executeTakeFirst();
      return row ? tournamentToEvent(row) : undefined;
    },

    /**
     * Resolves a submission link's token to its deck-check tournament.
     * @returns The event with its group name, or undefined.
     */
    async getEventBySubmissionToken(
      token: string,
    ): Promise<(DeckCheckEvent & { groupName: string }) | undefined> {
      // Left join: a host without a friend group (ADR-033) still resolves its
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

    /**
     * Updates the self-submission settings (admin action).
     * @returns The updated event, or undefined when it does not exist.
     */
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

    // ── Entries ─────────────────────────────────────────────────────────────

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
            .select((inner) =>
              inner.fn.coalesce(inner.fn.sum<number>("c.quantity"), sql<number>`0`).as("count"),
            )
            .whereRef("c.entryId", "=", "en.id")
            .as("copyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(
              sql<number>`coalesce(sum((SELECT count(*) FROM unnest(c.found_copies) AS f(v) WHERE f.v)), 0)`.as(
                "count",
              ),
            )
            .whereRef("c.entryId", "=", "en.id")
            .as("verifiedCopyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(eb.fn.countAll<number>().as("count"))
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
        copyCount: Number(row.copyCount ?? 0),
        verifiedCopyCount: Number(row.verifiedCopyCount ?? 0),
        unmatchedLineCount: Number(row.unmatchedLineCount ?? 0),
      }));
    },

    /**
     * Legend art from publishing-consented, non-withdrawn entries, batched per
     * tournament: up to `limit` distinct legend cards each, in submission
     * order. Feeds the tournament-summary card fans; entries whose players did
     * not opt into deck publishing never surface here.
     *
     * @param tournamentIds The tournaments to collect legends for.
     * @param limit Max distinct legends per tournament.
     * @returns Cover rows grouped by tournament, in fan display order.
     */
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

    /**
     * The legend art of each participant's publishing-consented, non-withdrawn
     * entry, batched. Used for the winner chip on completed tournaments;
     * participants without consent (or without a resolved legend image) are
     * absent from the map.
     *
     * @param participantIds The participants to look up.
     * @returns A map from participant id to their legend's image id.
     */
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

    /**
     * Loads one entry for a judge state transition, taking a `FOR UPDATE` lock
     * on its row first. Two near-simultaneous judge requests against the same
     * entry now serialize on that lock instead of both reading the same
     * pre-transition state and the later commit silently overwriting the
     * earlier one (audit: stale-snapshot judge transitions). Callers must run
     * this inside a transaction so the lock is actually held.
     * @returns The freshly-locked entry, or undefined when it does not match
     * the tournament.
     */
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

    /**
     * The deck entry attached to a participant, if any (one deck per
     * participant). Used to route a just-claimed participant to their deck when
     * the tournament runs deck check.
     * @returns The entry id, or undefined when the participant has no deck.
     */
    async findEntryIdByParticipant(participantId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .select("id")
        .where("participantId", "=", participantId)
        .executeTakeFirst();
      return row?.id;
    },

    /**
     * Mints a claim token for a participant that lacks one (defensively). No-op
     * when set.
     * @param entryId The entry whose participant to stamp.
     * @param token The token to write.
     */
    async setClaimTokenIfMissing(entryId: string, token: string): Promise<void> {
      const participantId = await participantIdForEntry(entryId);
      if (!participantId) {
        return;
      }
      await db
        .updateTable("tournamentParticipants")
        .set({ claimToken: token })
        .where("id", "=", participantId)
        .where("claimToken", "is", null)
        .execute();
    },

    /**
     * Looks up the display name of an account.
     * @returns The user's display name, or null when unknown.
     */
    async getUserName(userId: string): Promise<string | null> {
      const row = await db
        .selectFrom("users")
        .select("name")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.name ?? null;
    },

    /** @returns Whether the participant already owns a deck-check entry. */
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
      // Identity / claim columns moved to the participant (ADR-033); route them
      // there. The sharing-consent flags stay on the entry (see entryPatch).
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
      // failure between them used to leave the participant renamed while the
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

    // ── Account links and player access (ADR-026, on participants) ───────────

    /**
     * One account's identity fields, for existence checks and for populating
     * a self-submitted entry's player fields from the account.
     * @returns The account row, or undefined when the user does not exist.
     */
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
     * @returns The updated entry, or undefined when it does not exist.
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
     * One entry, guarded by ownership: returns nothing unless the entry's
     * participant is linked to the caller. The 404-vs-403 distinction happens in
     * the route.
     * @returns The entry with its tournament and group names, or undefined.
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
     * The caller's own entry in one tournament — the read behind the player's
     * deck page, which is addressed by tournament rather than by entry id
     * (ADR-033). At most one row: a participant is unique per account per
     * tournament, and an entry belongs to exactly one participant.
     * @returns The entry with its tournament and group names, or undefined.
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

    /**
     * The caller's linked entry within one event, for submission-as-edit.
     * @returns The entry, or undefined when none is linked.
     */
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

    // ── Entry cards ─────────────────────────────────────────────────────────

    listCardsForEntry(entryId: string): Promise<DeckCheckEntryCard[]> {
      return db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entryId)
        .orderBy("sortOrder", "asc")
        .execute();
    },

    /**
     * Replaces an entry's card lines wholesale (re-import semantics).
     * @returns Nothing; old rows are deleted and the new lines inserted.
     */
    async replaceEntryCards(entryId: string, cards: NewDeckCheckEntryCard[]): Promise<void> {
      await db.deleteFrom("deckCheckEntryCards").where("entryId", "=", entryId).execute();
      if (cards.length > 0) {
        await db
          .insertInto("deckCheckEntryCards")
          .values(cards.map((card) => ({ ...card, entryId })))
          .execute();
      }
    },

    /**
     * Rewrites one card line's raw name plus its resolution (the on-site
     * typo fix); zone, quantity, and found ticks stay.
     * @returns False when the row no longer exists.
     */
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
     * Moves copies of a card line into another zone (the judge's per-copy fix),
     * renaming and re-resolving the line in the same step. Moving the whole line
     * just re-zones it in place; moving fewer than all copies splits the line,
     * leaving the remainder where it was. Copies landing in a zone that already
     * holds the same resolved card merge into that line. A re-zone to the line's
     * current zone is treated as a plain rename, never a split. Found ticks for
     * moved (or newly merged-in) copies reset to unfound.
     * @returns False when the source row no longer exists.
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
      // Wrapped in a transaction with a FOR UPDATE lock on the source line so a
      // concurrent split of the same line (two judges, or a double-click)
      // serializes instead of both reading the same quantity and issuing
      // conflicting shrink writes (audit #1). Every read/write below uses trx.
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
          // The source line is emptied by a full move, otherwise just shrunk.
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

        // Partial move into a fresh line in the target zone.
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

    /**
     * Moves one card line to a different zone (the bulk zone-fix action), also
     * overwriting its provider section string so the row stays coherent; name,
     * resolution, quantity, and found ticks stay.
     * @returns False when the row no longer exists.
     */
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

    /** Appends one card line after the entry's current highest sort order. */
    async addEntryCard(entryId: string, card: NewDeckCheckEntryCard): Promise<void> {
      await db
        .insertInto("deckCheckEntryCards")
        .values({ ...card, entryId })
        .execute();
    },

    /**
     * Removes one physical copy of a card line: the quantity drops by one and
     * the clicked copy's found tick is spliced out (other ticks keep their
     * cells). Removing the last copy deletes the line.
     *
     * Wrapped in a transaction with a FOR UPDATE lock on the line, for the same
     * reason as {@link moveCardCopies} (audit #1): two judges removing copies of
     * a quantity-2 line would otherwise both read 2 and take the decrement
     * branch, and the second write would drive quantity to 0 and trip the
     * `quantity > 0` CHECK as a 500 instead of deleting the line.
     *
     * @returns False when the row or copy no longer exists.
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
     * @returns False when the row no longer exists (replaced by a re-import)
     *   or the copy index is outside the line's quantity.
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
     * Marks every physical copy of every card line in an entry as found. Used
     * when a judge marks the list checked (ADR-033): concluding the check
     * implies the whole list was verified, so the found ticks are filled to
     * match. Each line's array is rewritten dense to its own `quantity`.
     * @returns Nothing; an entry with no card lines is a no-op.
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
     * Clears every found tick across an entry's card lines, back to the empty
     * default. Used when a judge re-opens a checked list (ADR-033): re-checking
     * starts from a clean slate so a stale auto-fill can't read as a fresh count.
     * @returns Nothing.
     */
    async clearAllCopiesFound(entryId: string): Promise<void> {
      await db
        .updateTable("deckCheckEntryCards")
        .set({ foundCopies: [] })
        .where("entryId", "=", entryId)
        .execute();
    },

    /**
     * Card lines of an event still unmatched or ambiguous, for the re-resolve action.
     * @returns The unresolved card rows across all of the event's entries.
     */
    listUnresolvedCardsForEvent(tournamentId: string): Promise<DeckCheckEntryCard[]> {
      return (
        db
          .selectFrom("deckCheckEntryCards as c")
          .innerJoin("deckCheckEntries as en", "en.id", "c.entryId")
          .selectAll("c")
          .where("en.tournamentId", "=", tournamentId)
          // An editable entry's list is invisible to officials (ADR-027), so the
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

    // ── Card resolution ─────────────────────────────────────────────────────

    /**
     * Resolves raw card names against the catalog by normalized name (cards
     * plus name aliases). Exactly one candidate is `matched`, several are
     * `ambiguous`, none is `unmatched`. For a match, the canonical printing is
     * picked purely to source a thumbnail.
     *
     * @param inputs Distinct or repeated raw names; resolved in one batch.
     * @returns Resolutions keyed by {@link cardResolutionKey}.
     */
    async resolveCards(inputs: CardResolutionInput[]): Promise<Map<string, CardResolution>> {
      const results = new Map<string, CardResolution>();
      const normNames = [...new Set(inputs.map((input) => cardResolutionKey(input.name)))];
      if (normNames.length === 0) {
        return results;
      }

      const [cardRows, aliasRows, legendRows] = await Promise.all([
        db
          .selectFrom("cards")
          .select(["id", "normName"])
          .where("normName", "in", normNames)
          .execute(),
        db
          .selectFrom("cardNameAliases")
          .select(["cardId", "normName"])
          .where("normName", "in", normNames)
          .execute(),
        // Legends also resolve by their colloquial "Azir, Emperor of the Sands"
        // form. The combined name isn't stored, so match it from the tag + name
        // at resolve time (see legendComboResolutions) without seeding aliases.
        db
          .selectFrom("cards")
          .select(["id", "normName", "tags"])
          .where("type", "=", WellKnown.cardType.LEGEND)
          .execute(),
      ]);

      const candidatesByNorm = new Map<string, Set<string>>();
      for (const row of cardRows) {
        const set = candidatesByNorm.get(row.normName) ?? new Set();
        set.add(row.id);
        candidatesByNorm.set(row.normName, set);
      }
      for (const row of aliasRows) {
        const set = candidatesByNorm.get(row.normName) ?? new Set();
        set.add(row.cardId);
        candidatesByNorm.set(row.normName, set);
      }
      for (const combo of legendComboResolutions(legendRows, new Set(normNames))) {
        const set = candidatesByNorm.get(combo.norm) ?? new Set();
        set.add(combo.cardId);
        candidatesByNorm.set(combo.norm, set);
      }

      const allCandidateIds = [
        ...new Set([...candidatesByNorm.values()].flatMap((ids) => [...ids])),
      ];
      const thumbnailByCard = new Map<string, string>();
      if (allCandidateIds.length > 0) {
        const printingRows = await db
          .selectFrom("printingsOrdered")
          .select(["id", "cardId"])
          .where("cardId", "in", allCandidateIds)
          .orderBy("canonicalRank", "asc")
          .execute();
        for (const row of printingRows) {
          if (!thumbnailByCard.has(row.cardId)) {
            thumbnailByCard.set(row.cardId, row.id);
          }
        }
      }

      for (const normName of normNames) {
        const candidates = [...(candidatesByNorm.get(normName) ?? [])];
        const cardId = candidates.length === 1 ? candidates[0] : undefined;
        results.set(
          normName,
          cardId
            ? {
                resolvedCardId: cardId,
                resolvedPrintingId: thumbnailByCard.get(cardId) ?? null,
                matchStatus: "matched",
              }
            : {
                resolvedCardId: null,
                resolvedPrintingId: null,
                matchStatus: candidates.length === 0 ? "unmatched" : "ambiguous",
              },
        );
      }

      return results;
    },

    /**
     * Maps printing short codes (as found in a pasted deck code) onto cards,
     * for the self-submission decode path (ADR-026).
     * @returns Card name and type keyed by short code.
     */
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

    /**
     * Denormalized card details for building a DeckState from resolved lines.
     * @returns Card details keyed by card id.
     */
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

    /**
     * Set slugs of the printings each card appears in, for the allowedSets check.
     * @returns Set slugs keyed by card id.
     */
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
