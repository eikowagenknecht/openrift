import type {
  PodScoringScheme,
  PodTournamentStatus,
  TournamentClaimSource,
  TournamentDeckPhase,
  TournamentDeckSubmission,
  TournamentHostType,
  TournamentListLockMode,
  TournamentParticipantStatus,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentStaffRole,
  TournamentStatus,
} from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, TournamentParticipantsTable, TournamentsTable } from "../db/index.js";
import { generateShareToken } from "../utils/share-token.js";

export type Tournament = Selectable<TournamentsTable>;
export type TournamentParticipant = Selectable<TournamentParticipantsTable>;

// The DB CHECKs permit the full umbrella lifecycle, but the Kysely Insertable
// type for tournaments is intentionally narrowed to the pod subset (see
// tables.ts). Cast the wide ADR-033 statuses through `unknown` so writes
// compile without touching the generated table types.
function asTournamentStatus(status: TournamentStatus): PodTournamentStatus {
  return status as unknown as PodTournamentStatus;
}

/**
 * postgres.js can hand the `allowedSets` jsonb back as a string under Bun, so
 * the `string[] | null` Selectable type is a runtime lie. Parse defensively.
 * @returns The parsed set-slug array, or null when absent.
 */
function parseAllowedSets(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as string[];
}

/**
 * Normalizes a raw tournament row so `allowedSets` is always a parsed array (or
 * null), regardless of how the driver hands the jsonb back.
 * @returns The row with `allowedSets` parsed.
 */
function mapTournament<T extends Tournament>(row: T): T {
  return { ...row, allowedSets: parseAllowedSets(row.allowedSets) };
}

/** The full set of wizard-written columns for a new umbrella tournament. */
export interface NewTournament {
  hostType: TournamentHostType;
  hostUserId?: string | null;
  hostOrgId?: string | null;
  groupId?: string | null;
  name: string;
  status?: TournamentStatus;
  /** Omit to fall back to the DB default of now(); the wizard always sets it. */
  startsAt?: Date;
  /** Optional end instant: a multi-day close, or null for a single-day event. */
  endsAt?: Date | null;
  pairingStyle: TournamentPairingStyle;
  scoringScheme?: PodScoringScheme;
  byePoints?: number;
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  regionsEnabled?: boolean;
  deckSubmission: TournamentDeckSubmission;
  deckPhase?: TournamentDeckPhase;
  submissionsCloseAt?: Date | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  selfRegistration?: boolean;
}

/** Editable umbrella settings (re-validated against the CHECK invariants by the route). */
export interface TournamentPatch {
  name?: string;
  status?: TournamentStatus;
  /** Host reassignment. Set all three together to keep the host CHECK satisfied. */
  hostType?: TournamentHostType;
  hostUserId?: string | null;
  hostOrgId?: string | null;
  /** The pairing engine. The route guards that it only changes before any round. */
  pairingStyle?: TournamentPairingStyle;
  startsAt?: Date;
  endsAt?: Date | null;
  groupId?: string | null;
  scoringScheme?: PodScoringScheme;
  byePoints?: number;
  /** The Swiss result-entry format. The route guards that it only changes before any round. */
  matchFormat?: TournamentMatchFormat;
  winPoints?: number;
  drawPoints?: number;
  regionsEnabled?: boolean;
  deckSubmission?: TournamentDeckSubmission;
  deckPhase?: TournamentDeckPhase;
  submissionsCloseAt?: Date | null;
  listLockMode?: TournamentListLockMode;
  deckFormat?: string | null;
  allowedSets?: string[] | null;
  selfRegistration?: boolean;
}

/** A tournament summary row with the participant / pending-request counts folded in. */
export interface TournamentSummaryRow extends Tournament {
  participantCount: number;
  pendingRequestCount: number;
}

/** A staff grant joined to the user's display name. */
export interface TournamentStaffWithName {
  userId: string;
  name: string | null;
  role: TournamentStaffRole;
  addedAt: Date;
}

/** A participant joined to its linked account's display name (null for walk-ins). */
export interface TournamentParticipantWithUser extends TournamentParticipant {
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

/**
 * The tournaments umbrella (ADR-033): hosts, staff authorization, and the
 * unified participant identity that the re-parented deck-check flow keys off.
 * Authorization composes host authority (the hosting user, or an organization's
 * owner/manager) with per-tournament `tournament_staff` grants. The repo is
 * naive about who is calling; the route composes the checks.
 *
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
export function tournamentsRepo(db: Kysely<Database>) {
  return {
    /** @returns The tournament row, or undefined when no tournament has that id. */
    async findById(id: string): Promise<Tournament | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return row && mapTournament(row);
    },

    /** @returns The group's tournaments (any module), by tournament date, most recent first. */
    async listForGroup(groupId: string): Promise<Tournament[]> {
      const rows = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("groupId", "=", groupId)
        .orderBy("startsAt", "desc")
        .orderBy("createdAt", "desc")
        .execute();
      return rows.map((row) => mapTournament(row));
    },

    /**
     * The group's tournaments with the participant / pending-request counts
     * folded in (the group "Events" lens, ADR-033), by tournament date, most
     * recent first.
     * @returns Matching tournaments with folded counts.
     */
    async listForGroupWithCounts(groupId: string): Promise<TournamentSummaryRow[]> {
      const rows = await db
        .selectFrom("tournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where("t.groupId", "=", groupId)
        .orderBy("t.startsAt", "desc")
        .orderBy("t.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...mapTournament(row),
        participantCount: Number(row.participantCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
      }));
    },

    /**
     * The first `limit` participants per tournament (registration order) with
     * their linked account's avatar data, batched for the summary facepiles.
     * Mirrors `participantCount`'s population (every status), so the facepile
     * never disagrees with the count next to it.
     *
     * @param tournamentIds The tournaments to preview.
     * @param limit Max participants per tournament.
     * @returns Preview rows grouped by tournament, in registration order.
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

    /**
     * Resolves a friend group's owner, the host of its migrated/created
     * deck-check tournaments and integration keys (ADR-033).
     * @returns The owner's user id, or undefined when the group has no owner.
     */
    async getGroupOwnerUserId(groupId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("friendGroupMembers")
        .select("userId")
        .where("groupId", "=", groupId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      return row?.userId;
    },

    // ── Staff / authorization ─────────────────────────────────────────────────

    /** @returns The user's `tournament_staff` roles for this tournament. */
    async getStaffRoles(tournamentId: string, userId: string): Promise<TournamentStaffRole[]> {
      const rows = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .execute();
      return rows.map((row) => row.role);
    },

    /** Grants a staff role; idempotent on the (tournament, user, role) primary key. */
    async addStaff(tournamentId: string, userId: string, role: TournamentStaffRole): Promise<void> {
      await db
        .insertInto("tournamentStaff")
        .values({ tournamentId, userId, role })
        .onConflict((oc) => oc.columns(["tournamentId", "userId", "role"]).doNothing())
        .execute();
    },

    /** Removes one staff grant. */
    async removeStaff(
      tournamentId: string,
      userId: string,
      role: TournamentStaffRole,
    ): Promise<void> {
      await db
        .deleteFrom("tournamentStaff")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .where("role", "=", role)
        .execute();
    },

    /**
     * People a host may grant staff to without typing an email: members of the
     * linked friend group plus anyone already on the roster with a linked
     * account. Existing staff (explicit grants) are excluded so the picker only
     * offers fresh additions; the row's `source` says where the candidate came
     * from. Deduped by user id, preferring the group label.
     * @returns The eligible candidates, name-sorted (NULL names last).
     */
    async listStaffCandidates(
      tournamentId: string,
      groupId: string | null,
    ): Promise<{ userId: string; name: string | null; source: "group" | "participant" }[]> {
      const groupMembers = groupId
        ? await db
            .selectFrom("friendGroupMembers as m")
            .innerJoin("users as u", "u.id", "m.userId")
            .select(["m.userId as userId", "u.name as name"])
            .where("m.groupId", "=", groupId)
            .execute()
        : [];
      const participants = await db
        .selectFrom("tournamentParticipants as p")
        .innerJoin("users as u", "u.id", "p.userId")
        .select(["p.userId as userId", "u.name as name"])
        .where("p.tournamentId", "=", tournamentId)
        .where("p.userId", "is not", null)
        .execute();
      const existingStaff = await db
        .selectFrom("tournamentStaff")
        .select("userId")
        .where("tournamentId", "=", tournamentId)
        .execute();
      const taken = new Set(existingStaff.map((row) => row.userId));
      const byUser = new Map<
        string,
        { userId: string; name: string | null; source: "group" | "participant" }
      >();
      for (const member of groupMembers) {
        if (member.userId && !taken.has(member.userId)) {
          byUser.set(member.userId, { userId: member.userId, name: member.name, source: "group" });
        }
      }
      for (const participant of participants) {
        if (
          participant.userId &&
          !taken.has(participant.userId) &&
          !byUser.has(participant.userId)
        ) {
          byUser.set(participant.userId, {
            userId: participant.userId,
            name: participant.name,
            source: "participant",
          });
        }
      }
      return [...byUser.values()].sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿"));
    },

    /**
     * Whether the user is eligible to be granted staff by the picker: a member
     * of the linked friend group, or an account-linked participant. This is the
     * server-side gate behind {@link listStaffCandidates}, so a forged user id
     * can't grant staff to an unrelated account.
     * @returns True when the user may be added as staff by id.
     */
    async isStaffCandidate(
      tournamentId: string,
      groupId: string | null,
      userId: string,
    ): Promise<boolean> {
      if (groupId) {
        const member = await db
          .selectFrom("friendGroupMembers")
          .select("userId")
          .where("groupId", "=", groupId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (member) {
          return true;
        }
      }
      const participant = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return participant !== undefined;
    },

    /**
     * Whether the user has host authority or one of the accepted staff roles on
     * the tournament. Host authority is the hosting user, or — for an
     * organization host — an `organization_members` row mapped to an implicit
     * staff role: `owner`/`manager` are implicit organizers, `judge` an implicit
     * judge. Explicit `tournament_staff` grants delegate the listed roles too
     * (so an org judge can still be granted organizer on a single tournament).
     * @returns True when the user passes the host-or-staff check.
     */
    async isHostOrStaff(
      tournamentId: string,
      userId: string,
      roles: TournamentStaffRole[] = ["organizer", "judge"],
    ): Promise<boolean> {
      const tournament = await db
        .selectFrom("tournaments")
        .select(["hostType", "hostUserId", "hostOrgId"])
        .where("id", "=", tournamentId)
        .executeTakeFirst();
      if (!tournament) {
        return false;
      }
      if (tournament.hostType === "user" && tournament.hostUserId === userId) {
        return true;
      }
      if (tournament.hostType === "organization" && tournament.hostOrgId) {
        const orgMember = await db
          .selectFrom("organizationMembers")
          .select("role")
          .where("orgId", "=", tournament.hostOrgId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (orgMember) {
          const effectiveRole: TournamentStaffRole =
            orgMember.role === "judge" ? "judge" : "organizer";
          if (roles.includes(effectiveRole)) {
            return true;
          }
          // Otherwise fall through: an explicit grant may still match.
        }
      }
      const staff = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .where("role", "in", roles)
        .executeTakeFirst();
      return staff !== undefined;
    },

    // ── Participants ──────────────────────────────────────────────────────────

    /** @returns The tournament's participants, oldest first. */
    listParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("tournamentId", "=", tournamentId)
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** @returns The participant, or undefined when no participant has that id. */
    findParticipantById(participantId: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("id", "=", participantId)
        .executeTakeFirst();
    },

    /** @returns The participant a claim token resolves to, or undefined. */
    findParticipantByClaimToken(token: string): Promise<TournamentParticipant | undefined> {
      return db
        .selectFrom("tournamentParticipants")
        .selectAll()
        .where("claimToken", "=", token)
        .executeTakeFirst();
    },

    /**
     * The pre-claim landing for a participant claim link: the tournament (start,
     * organizer, owning group, and whether decks are submitted) and the spot's
     * name. Rooted on the participant, so it works with or without deck check.
     * The organizer name is resolved from the host org or host user inline
     * (ADR-033).
     * @returns The landing fields, or undefined when no participant has that token.
     */
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
     * Links the participant a claim token resolves to, but only while it is
     * unclaimed and not judge-blocked. The guard re-checks atomically, so a race
     * resolves to no update (a refusal), never a steal.
     * @returns The linked participant, or undefined when the guard rejected it.
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

    /** @returns The participant linked to a user within a tournament, or undefined. */
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
     * Finds the roster participant a deck submission belongs to, or creates one.
     * Matching is by linked account only (never by name); without a userId a
     * fresh walk-in is created. This is how a self-submitted list attaches to an
     * already-claimed entrant instead of spawning a duplicate (ADR-033). Manual
     * entry passes a participant id directly and never goes through here.
     * @returns The resolved or newly created participant row.
     */
    async resolveOrCreateParticipant(input: {
      tournamentId: string;
      userId?: string | null;
      riotId?: string | null;
      displayName: string;
      claimSource?: TournamentClaimSource | null;
      claimedAt?: Date | null;
      /**
       * Status for a *newly created* participant. Defaults to `active` for
       * trusted callers (provider push via API key). The open self-submission
       * link passes `requested` so a stranger lands in the approval queue
       * instead of straight onto the roster (ADR-033 decisions 18/19). Ignored
       * when an existing participant is matched by linked account.
       */
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
     * Creates a participant. Every participant gets a claim token (minted here
     * when not supplied) so it can be claimed by link, with or without deck
     * check (ADR-033).
     * @returns The created participant row.
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

    /** @returns The updated participant, or undefined when it does not exist. */
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
     * Clears the claim block an unlink left behind and rotates the claim token,
     * so the correct player can claim the spot through a fresh link (ADR-033).
     * Also drops any stale link fields, leaving the spot fully unclaimed.
     * @returns The updated participant, or undefined when it does not exist.
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

    /** Removes one participant row outright (deny / remove). */
    async deleteParticipant(participantId: string): Promise<void> {
      // Their decklist is discarded too, enforced by the deck_check_entries
      // participant_id ON DELETE CASCADE FK (migration 174) — no code path can
      // leave an orphaned entry. Claim/link/re-submit never delete a participant,
      // so the cascade only fires on an explicit removal.
      await db.deleteFrom("tournamentParticipants").where("id", "=", participantId).execute();
    },

    /**
     * Whether the participant is referenced by any pod (so it cannot be hard-
     * deleted; the host drops it instead, mirroring the pod player guard).
     * @returns True when the participant sits in a pod or holds a bye.
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

    /** @returns The tournament's participants joined to the linked account name, oldest first. */
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

    // ── Umbrella tournament CRUD ──────────────────────────────────────────────

    /** @returns The created tournament row (all wizard columns). */
    async create(values: NewTournament): Promise<Tournament> {
      const { status, allowedSets, ...rest } = values;
      const row = await db
        .insertInto("tournaments")
        .values({
          ...rest,
          ...(status === undefined ? {} : { status: asTournamentStatus(status) }),
          allowedSets: allowedSets === undefined ? undefined : JSON.stringify(allowedSets),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return mapTournament(row);
    },

    /** @returns The updated tournament, or undefined when it does not exist. */
    async updateSettings(id: string, patch: TournamentPatch): Promise<Tournament | undefined> {
      const { status, allowedSets, ...rest } = patch;
      const row = await db
        .updateTable("tournaments")
        .set({
          ...rest,
          ...(status === undefined ? {} : { status: asTournamentStatus(status) }),
          ...(allowedSets === undefined ? {} : { allowedSets: JSON.stringify(allowedSets) }),
          updatedAt: new Date(),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row && mapTournament(row);
    },

    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("tournaments").where("id", "=", id).execute();
    },

    /**
     * Sets (rotate/enable) or clears (`null`) the open self-submission token.
     * @returns The updated tournament, or undefined when it does not exist.
     */
    async setSubmissionToken(id: string, token: string | null): Promise<Tournament | undefined> {
      const row = await db
        .updateTable("tournaments")
        .set({ submissionToken: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row && mapTournament(row);
    },

    /** @returns The tournament whose submission token matches, or undefined. */
    async findBySubmissionToken(token: string): Promise<Tournament | undefined> {
      const row = await db
        .selectFrom("tournaments")
        .selectAll()
        .where("submissionToken", "=", token)
        .executeTakeFirst();
      return row && mapTournament(row);
    },

    /**
     * Sets (rotate/enable) or clears (`null`) the reusable staff-invite link for
     * one role. The two roles live in separate columns, so enabling one never
     * disturbs the other.
     * @returns The updated tournament, or undefined when it does not exist.
     */
    async setStaffInviteToken(
      id: string,
      role: TournamentStaffRole,
      token: string | null,
    ): Promise<Tournament | undefined> {
      const column = role === "organizer" ? "organizerInviteToken" : "judgeInviteToken";
      const row = await db
        .updateTable("tournaments")
        .set({ [column]: token, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
      return row && mapTournament(row);
    },

    /**
     * Resolves a staff-invite token to its tournament and the role it grants.
     * Either invite column may hold it; the matching column names the role.
     * @returns The tournament and granted role, or undefined when no token matches.
     */
    async findByStaffInviteToken(
      token: string,
    ): Promise<{ tournament: Tournament; role: TournamentStaffRole } | undefined> {
      const tournament = await db
        .selectFrom("tournaments")
        .selectAll()
        .where((eb) =>
          eb.or([eb("organizerInviteToken", "=", token), eb("judgeInviteToken", "=", token)]),
        )
        .executeTakeFirst();
      if (!tournament) {
        return undefined;
      }
      const role: TournamentStaffRole =
        tournament.organizerInviteToken === token ? "organizer" : "judge";
      return { tournament: mapTournament(tournament), role };
    },

    /** @returns The participant / pending-request counts for one tournament. */
    async getCounts(
      tournamentId: string,
    ): Promise<{ participantCount: number; pendingRequestCount: number }> {
      const row = await db
        .selectFrom("tournaments as t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where("t.id", "=", tournamentId)
        .executeTakeFirst();
      return {
        participantCount: Number(row?.participantCount ?? 0),
        pendingRequestCount: Number(row?.pendingRequestCount ?? 0),
      };
    },

    /** @returns True once the tournament has any round (then the pairing engine is fixed). */
    async hasRounds(tournamentId: string): Promise<boolean> {
      const row = await db
        .selectFrom("podRounds")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Tournaments the user relates to: host (user), member of the host org (via
     * the `orgIds` the caller resolved), tournament staff, or a participant.
     * @returns Matching tournaments with folded counts, by tournament date, most recent first.
     */
    async listForUser(userId: string, orgIds: string[]): Promise<TournamentSummaryRow[]> {
      const rows = await db
        .selectFrom("tournaments as t")
        .selectAll("t")
        .select((eb) => [
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .as("participantCount"),
          eb
            .selectFrom("tournamentParticipants as p")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("p.tournamentId", "=", "t.id")
            .where("p.status", "=", "requested")
            .as("pendingRequestCount"),
        ])
        .where((eb) =>
          eb.or([
            eb.and([eb("t.hostType", "=", "user"), eb("t.hostUserId", "=", userId)]),
            orgIds.length > 0 ? eb("t.hostOrgId", "in", orgIds) : eb.val(false),
            eb.exists(
              eb
                .selectFrom("tournamentStaff as s")
                .select("s.userId")
                .whereRef("s.tournamentId", "=", "t.id")
                .where("s.userId", "=", userId),
            ),
            eb.exists(
              eb
                .selectFrom("tournamentParticipants as p")
                .select("p.id")
                .whereRef("p.tournamentId", "=", "t.id")
                .where("p.userId", "=", userId),
            ),
          ]),
        )
        .orderBy("t.startsAt", "desc")
        .orderBy("t.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...mapTournament(row),
        participantCount: Number(row.participantCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
      }));
    },

    /** @returns The user's staff roles across the given tournaments. */
    staffRolesAcross(
      tournamentIds: string[],
      userId: string,
    ): Promise<{ tournamentId: string; role: TournamentStaffRole }[]> {
      if (tournamentIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("tournamentStaff")
        .select(["tournamentId", "role"])
        .where("tournamentId", "in", tournamentIds)
        .where("userId", "=", userId)
        .execute();
    },

    /** @returns The tournament ids (of those given) where the user is a participant. */
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

    /** @returns The tournament's staff grants joined to the user's display name. */
    listStaffWithNames(tournamentId: string): Promise<TournamentStaffWithName[]> {
      return db
        .selectFrom("tournamentStaff as s")
        .leftJoin("users as u", "u.id", "s.userId")
        .select(["s.userId", "u.name as name", "s.role", "s.addedAt"])
        .where("s.tournamentId", "=", tournamentId)
        .orderBy("s.addedAt", "asc")
        .execute();
    },

    /** @returns A map from friend-group id to its slug + name for the given groups. */
    async getGroupInfo(groupIds: string[]): Promise<Map<string, { slug: string; name: string }>> {
      const unique = [...new Set(groupIds)];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("friendGroups")
        .select(["id", "slug", "name"])
        .where("id", "in", unique)
        .execute();
      return new Map(rows.map((row) => [row.id, { slug: row.slug, name: row.name }]));
    },

    /** @returns A map from user id to display name for the given users. */
    async getUserNames(userIds: string[]): Promise<Map<string, string | null>> {
      const unique = [...new Set(userIds)];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("users")
        .select(["id", "name"])
        .where("id", "in", unique)
        .execute();
      return new Map(rows.map((row) => [row.id, row.name]));
    },

    /**
     * Whether the user has any relationship to the tournament (host, staff,
     * participant, or member of a linked friend group) — the in-app visibility
     * gate for the detail read.
     * @returns True when the user may see the tournament detail.
     */
    async hasRelationship(tournamentId: string, userId: string): Promise<boolean> {
      const tournament = await db
        .selectFrom("tournaments")
        .select(["hostType", "hostUserId", "hostOrgId", "groupId"])
        .where("id", "=", tournamentId)
        .executeTakeFirst();
      if (!tournament) {
        return false;
      }
      if (tournament.hostType === "user" && tournament.hostUserId === userId) {
        return true;
      }
      if (tournament.hostType === "organization" && tournament.hostOrgId) {
        const orgMember = await db
          .selectFrom("organizationMembers")
          .select("userId")
          .where("orgId", "=", tournament.hostOrgId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (orgMember) {
          return true;
        }
      }
      if (tournament.groupId) {
        const groupMember = await db
          .selectFrom("friendGroupMembers")
          .select("userId")
          .where("groupId", "=", tournament.groupId)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (groupMember) {
          return true;
        }
      }
      const staff = await db
        .selectFrom("tournamentStaff")
        .select("role")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      if (staff) {
        return true;
      }
      const participant = await db
        .selectFrom("tournamentParticipants")
        .select("id")
        .where("tournamentId", "=", tournamentId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return participant !== undefined;
    },
  };
}
