import { WellKnown, normalizeNameForMatching } from "@openrift/shared";
import type {
  DeckCheckCardLine,
  DeckCheckChangeSummary,
  DeckCheckClaimSource,
  DeckCheckEntryState,
  DeckCheckListLockMode,
  DeckCheckMatchStatus,
  DeckCheckReviewOutcome,
} from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckCheckEntriesTable,
  DeckCheckEntryCardsTable,
  DeckCheckEventsTable,
  DeckCheckKeysTable,
} from "../db/index.js";
import { generateShareToken } from "../utils/share-token.js";

export type DeckCheckEvent = Selectable<DeckCheckEventsTable>;
export type DeckCheckEntry = Selectable<DeckCheckEntriesTable>;
export type DeckCheckEntryCard = Selectable<DeckCheckEntryCardsTable>;
export type DeckCheckKey = Selectable<DeckCheckKeysTable>;

export interface DeckCheckEventWithCounts extends DeckCheckEvent {
  entryCount: number;
  checkedCount: number;
}

export interface DeckCheckEntrySummary extends DeckCheckEntry {
  checkedByName: string | null;
  approvedByName: string | null;
  claimedUserName: string | null;
  copyCount: number;
  verifiedCopyCount: number;
  unmatchedLineCount: number;
}

export interface NewDeckCheckEvent {
  groupId: string;
  name: string;
  eventDate: string | null;
  format: string | null;
  allowedSets: string[] | null;
}

export interface DeckCheckEventPatch {
  name?: string;
  eventDate?: string | null;
  format?: string | null;
  allowedSets?: string[] | null;
  status?: "active" | "archived";
  listLockMode?: DeckCheckListLockMode;
}

export interface NewDeckCheckEntry {
  eventId: string;
  externalId: string;
  playerName: string;
  playerEmail: string | null;
  riotId: string | null;
  submittedAt: Date | null;
  /** Omitted on insert = the column default (true, opt-out model). */
  allowDeckPublishing?: boolean;
  allowNameSharing?: boolean;
  allowRiotIdSharing?: boolean;
  contentHash: string;
  withdrawnAt: Date | null;
  state?: DeckCheckEntryState;
  claimedUserId?: string | null;
  claimSource?: DeckCheckClaimSource | null;
  claimedAt?: Date | null;
  /** Omitted = minted here (ADR-026 amendment); every entry is born with one. */
  claimToken?: string;
}

/** One row of the player's "My tournament decks" list (ADR-026). */
export interface PlayerDeckCheckEntryRow extends DeckCheckEntry {
  eventName: string;
  eventDate: Date | string | null;
  eventStatus: string;
  submissionsCloseAt: Date | null;
  groupName: string;
  groupSlug: string;
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
 * postgres.js can hand jsonb back as a string under Bun; parse defensively.
 * @returns The parsed value, or null when absent.
 */
function parseJsonb<T>(value: T | string | null): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

/**
 * Normalizes the jsonb columns of an event row.
 * @returns The row with `allowedSets` guaranteed parsed.
 */
function parseEventRow<T extends { allowedSets: unknown }>(
  row: T,
): T & { allowedSets: string[] | null } {
  return { ...row, allowedSets: parseJsonb<string[]>(row.allowedSets as string[] | string | null) };
}

/**
 * Normalizes the jsonb columns of an entry row.
 * @returns The row with `changeSummary` and `preEditLines` guaranteed parsed.
 */
function parseEntryRow<T extends { changeSummary: unknown; preEditLines: unknown }>(
  row: T,
): T & { changeSummary: DeckCheckChangeSummary | null; preEditLines: DeckCheckCardLine[] | null } {
  return {
    ...row,
    changeSummary: parseJsonb<DeckCheckChangeSummary>(
      row.changeSummary as DeckCheckChangeSummary | string | null,
    ),
    preEditLines: parseJsonb<DeckCheckCardLine[]>(
      row.preEditLines as DeckCheckCardLine[] | string | null,
    ),
  };
}

/**
 * Data access for the deck-check subsystem (ADR-025): group-owned events,
 * entrant entries with their card lines, push keys, and catalog resolution.
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
// oxlint-disable-next-line max-lines-per-function -- repository factory, one method per query
export function deckCheckRepo(db: Kysely<Database>) {
  return {
    // ── Events ──────────────────────────────────────────────────────────────

    async getEvent(groupId: string, eventId: string): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .selectFrom("deckCheckEvents")
        .selectAll()
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    async listEventsForGroup(groupId: string): Promise<DeckCheckEventWithCounts[]> {
      const rows = await db
        .selectFrom("deckCheckEvents as e")
        .selectAll("e")
        .select((eb) => [
          eb
            .selectFrom("deckCheckEntries as en")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("en.eventId", "=", "e.id")
            .where("en.state", "!=", "withdrawn")
            .as("entryCount"),
          eb
            .selectFrom("deckCheckEntries as en")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("en.eventId", "=", "e.id")
            .where("en.state", "=", "checked")
            .as("checkedCount"),
        ])
        .where("e.groupId", "=", groupId)
        .orderBy("e.createdAt", "desc")
        .execute();
      return rows.map((row) =>
        parseEventRow({
          ...row,
          entryCount: Number(row.entryCount ?? 0),
          checkedCount: Number(row.checkedCount ?? 0),
        }),
      );
    },

    async createEvent(input: NewDeckCheckEvent): Promise<DeckCheckEvent> {
      const row = await db
        .insertInto("deckCheckEvents")
        .values({
          groupId: input.groupId,
          name: input.name,
          eventDate: input.eventDate,
          format: input.format,
          allowedSets: input.allowedSets ? JSON.stringify(input.allowedSets) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return parseEventRow(row);
    },

    async updateEvent(
      groupId: string,
      eventId: string,
      patch: DeckCheckEventPatch,
    ): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .updateTable("deckCheckEvents")
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.eventDate === undefined ? {} : { eventDate: patch.eventDate }),
          ...(patch.format === undefined ? {} : { format: patch.format }),
          ...(patch.allowedSets === undefined
            ? {}
            : { allowedSets: patch.allowedSets ? JSON.stringify(patch.allowedSets) : null }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          ...(patch.listLockMode === undefined ? {} : { listLockMode: patch.listLockMode }),
        })
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    async deleteEvent(groupId: string, eventId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("deckCheckEvents")
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    // ── Entries ─────────────────────────────────────────────────────────────

    async listEntriesForEvent(eventId: string): Promise<DeckCheckEntrySummary[]> {
      const rows = await db
        .selectFrom("deckCheckEntries as en")
        .leftJoin("users as u", "u.id", "en.checkedBy")
        .leftJoin("users as au", "au.id", "en.approvedBy")
        .leftJoin("users as cu", "cu.id", "en.claimedUserId")
        .selectAll("en")
        .select((eb) => [
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
        .where("en.eventId", "=", eventId)
        .orderBy("en.playerName", "asc")
        .execute();
      return rows.map((row) =>
        parseEntryRow({
          ...row,
          checkedByName: row.checkedByName ?? null,
          approvedByName: row.approvedByName ?? null,
          claimedUserName: row.claimedUserName ?? null,
          copyCount: Number(row.copyCount ?? 0),
          verifiedCopyCount: Number(row.verifiedCopyCount ?? 0),
          unmatchedLineCount: Number(row.unmatchedLineCount ?? 0),
        }),
      );
    },

    async getEntry(eventId: string, entryId: string): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("id", "=", entryId)
        .where("eventId", "=", eventId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    async getEntryByExternalId(
      eventId: string,
      externalId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("eventId", "=", eventId)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Resolves a claim token to its entry (ADR-026 amendment). The claim
     * precedence runs in the player service against this row.
     * @returns The entry, or undefined when the token matches nothing.
     */
    async getEntryByClaimToken(token: string): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("claimToken", "=", token)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * The pre-claim landing data: only the event and owning group, never the
     * entrant or the deck, since any holder of the link reaches it unauthenticated.
     * @returns The event and group names, or undefined when the token is unknown.
     */
    async getClaimLandingByToken(
      token: string,
    ): Promise<{ eventName: string; groupName: string } | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("deckCheckEvents as ev", "ev.id", "en.eventId")
        .innerJoin("friendGroups as g", "g.id", "ev.groupId")
        .select((eb) => [eb.ref("ev.name").as("eventName"), eb.ref("g.name").as("groupName")])
        .where("en.claimToken", "=", token)
        .executeTakeFirst();
      return row ?? undefined;
    },

    /**
     * Mints a claim token for an entry that lacks one (an entry created before
     * the amendment and not yet backfilled, defensively). No-op when set.
     * @param entryId The entry to stamp.
     * @param token The token to write.
     */
    async setClaimTokenIfMissing(entryId: string, token: string): Promise<void> {
      await db
        .updateTable("deckCheckEntries")
        .set({ claimToken: token })
        .where("id", "=", entryId)
        .where("claimToken", "is", null)
        .execute();
    },

    /**
     * Looks up the display name of whoever checked an entry.
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

    async createEntry(input: NewDeckCheckEntry): Promise<DeckCheckEntry> {
      const row = await db
        .insertInto("deckCheckEntries")
        .values({ ...input, claimToken: input.claimToken ?? generateShareToken() })
        .returningAll()
        .executeTakeFirstOrThrow();
      return parseEntryRow(row);
    },

    async updateEntry(
      entryId: string,
      patch: Partial<{
        playerName: string;
        playerEmail: string | null;
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
        /** Written pre-stringified, like every jsonb column. */
        preEditLines: string | null;
        notes: string | null;
        changeSummary: string | null;
        withdrawnAt: Date | null;
        claimedUserId: string | null;
        claimSource: DeckCheckClaimSource | null;
        claimedAt: Date | null;
        claimBlockedAt: Date | null;
        playerMessage: string | null;
      }>,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .updateTable("deckCheckEntries")
        .set(patch)
        .where("id", "=", entryId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    async deleteEntry(eventId: string, entryId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("deckCheckEntries")
        .where("id", "=", entryId)
        .where("eventId", "=", eventId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    // ── Account links and player access (ADR-026) ───────────────────────────

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
     * Looks up a verified account by email for auto-match; the comparison is
     * case-insensitive on both sides.
     * @returns The user id, or undefined when no verified account matches.
     */
    async findVerifiedUserByEmail(email: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("users")
        .select("id")
        .where(sql`lower(email)`, "=", email.trim().toLowerCase())
        .where("emailVerified", "=", true)
        .executeTakeFirst();
      return row?.id;
    },

    /**
     * Links one entry to an account unless it is already linked or a judge
     * blocked it (the unlink tombstone). Used by the ingest-time auto-match.
     * @returns True when the link was written.
     */
    async linkEntryIfUnclaimed(
      entryId: string,
      userId: string,
      source: DeckCheckClaimSource,
    ): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckEntries")
        .set({ claimedUserId: userId, claimSource: source, claimedAt: new Date() })
        .where("id", "=", entryId)
        .where("claimedUserId", "is", null)
        .where("claimBlockedAt", "is", null)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    /**
     * The lazy auto-match: links every unclaimed, unblocked entry whose
     * `player_email` matches the viewer's verified email. Runs when a player
     * loads "My tournament decks" or opens a submission link, covering
     * accounts created after the provider pushed.
     * @returns The number of entries linked.
     */
    async autoMatchEntriesByEmail(userId: string, email: string): Promise<number> {
      const result = await db
        .updateTable("deckCheckEntries")
        .set({ claimedUserId: userId, claimSource: "email_auto", claimedAt: new Date() })
        .where(sql`lower(player_email)`, "=", email.trim().toLowerCase())
        .where("claimedUserId", "is", null)
        .where("claimBlockedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Judge manual link; overrides and clears any unlink block.
     * @returns The updated entry, or undefined when it does not exist.
     */
    async linkEntry(entryId: string, userId: string): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .updateTable("deckCheckEntries")
        .set({
          claimedUserId: userId,
          claimSource: "judge_manual",
          claimedAt: new Date(),
          claimBlockedAt: null,
        })
        .where("id", "=", entryId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Judge unlink: clears the claim columns and sets the block so no
     * auto-match path (ingest, lazy, backfill) ever restores the bad link.
     * @returns The updated entry, or undefined when it does not exist.
     */
    async unlinkEntry(entryId: string): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .updateTable("deckCheckEntries")
        .set({
          claimedUserId: null,
          claimSource: null,
          claimedAt: null,
          claimBlockedAt: new Date(),
        })
        .where("id", "=", entryId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Account candidates for the judge link search: exact email match or
     * name prefix, capped small. Judges already see entrant emails, so this
     * exposes nothing beyond their existing view.
     * @returns Up to ten matching accounts.
     */
    listAccountsForLinkSearch(
      query: string,
    ): Promise<{ id: string; name: string | null; email: string }[]> {
      const trimmed = query.trim();
      return db
        .selectFrom("users")
        .select(["id", "name", "email"])
        .where((eb) =>
          eb.or([
            eb(sql`lower(email)`, "=", trimmed.toLowerCase()),
            eb("name", "ilike", `${trimmed.replaceAll(/[%_]/gu, "")}%`),
          ]),
        )
        .orderBy("name", "asc")
        .limit(10)
        .execute();
    },

    /**
     * The caller's own entries across all events, withdrawn included.
     * @returns The entries with their event and group names, newest first.
     */
    async listEntriesForPlayer(userId: string): Promise<PlayerDeckCheckEntryRow[]> {
      const rows = await db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("deckCheckEvents as ev", "ev.id", "en.eventId")
        .innerJoin("friendGroups as g", "g.id", "ev.groupId")
        .selectAll("en")
        .select((eb) => [
          eb.ref("ev.name").as("eventName"),
          eb.ref("ev.eventDate").as("eventDate"),
          eb.ref("ev.status").as("eventStatus"),
          eb.ref("ev.submissionsCloseAt").as("submissionsCloseAt"),
          eb.ref("g.name").as("groupName"),
          eb.ref("g.slug").as("groupSlug"),
        ])
        .where("en.claimedUserId", "=", userId)
        .orderBy("en.updatedAt", "desc")
        .execute();
      return rows.map((row) => parseEntryRow(row));
    },

    /**
     * One entry, guarded by ownership: returns nothing unless the entry is
     * linked to the caller. The 404-vs-403 distinction happens in the route.
     * @returns The entry with its event and group names, or undefined.
     */
    async getEntryForPlayer(
      entryId: string,
      userId: string,
    ): Promise<PlayerDeckCheckEntryRow | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries as en")
        .innerJoin("deckCheckEvents as ev", "ev.id", "en.eventId")
        .innerJoin("friendGroups as g", "g.id", "ev.groupId")
        .selectAll("en")
        .select((eb) => [
          eb.ref("ev.name").as("eventName"),
          eb.ref("ev.eventDate").as("eventDate"),
          eb.ref("ev.status").as("eventStatus"),
          eb.ref("ev.submissionsCloseAt").as("submissionsCloseAt"),
          eb.ref("g.name").as("groupName"),
          eb.ref("g.slug").as("groupSlug"),
        ])
        .where("en.id", "=", entryId)
        .where("en.claimedUserId", "=", userId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Loads an event without group scoping (player paths know no group).
     * @returns The event, or undefined when it does not exist.
     */
    async getEventById(eventId: string): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .selectFrom("deckCheckEvents")
        .selectAll()
        .where("id", "=", eventId)
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    /**
     * Resolves a submission link's token to its event.
     * @returns The event with its group name, or undefined.
     */
    async getEventBySubmissionToken(
      token: string,
    ): Promise<(DeckCheckEvent & { groupName: string }) | undefined> {
      const row = await db
        .selectFrom("deckCheckEvents as ev")
        .innerJoin("friendGroups as g", "g.id", "ev.groupId")
        .selectAll("ev")
        .select((eb) => eb.ref("g.name").as("groupName"))
        .where("ev.submissionToken", "=", token)
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    /**
     * The caller's linked entry within one event, for submission-as-edit.
     * @returns The entry, or undefined when none is linked.
     */
    async getLinkedEntryForUser(
      eventId: string,
      userId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("eventId", "=", eventId)
        .where("claimedUserId", "=", userId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Updates the per-event self-submission settings (admin action).
     * @returns The updated event, or undefined when it does not exist.
     */
    async updateEventSubmission(
      eventId: string,
      patch: Partial<{
        allowSelfSubmission: boolean;
        submissionToken: string | null;
        submissionsCloseAt: Date | null;
      }>,
    ): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .updateTable("deckCheckEvents")
        .set(patch)
        .where("id", "=", eventId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
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
    async moveCardCopies(
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
      const source = await db
        .selectFrom("deckCheckEntryCards")
        .select(["quantity", "foundCopies", "zone"])
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
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
        await db
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
          ? await db
              .selectFrom("deckCheckEntryCards")
              .select(["id", "quantity", "foundCopies"])
              .where("entryId", "=", entryId)
              .where("zone", "=", zone)
              .where("resolvedCardId", "=", resolution.resolvedCardId)
              .where("id", "!=", cardId)
              .executeTakeFirst()
          : undefined;

      if (mergeTarget) {
        await db
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
          await db
            .deleteFrom("deckCheckEntryCards")
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }
        await db
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
        await db
          .updateTable("deckCheckEntryCards")
          .set({ ...resolutionColumns, section, zone })
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .execute();
        return true;
      }

      // Partial move into a fresh line in the target zone.
      await db
        .updateTable("deckCheckEntryCards")
        .set({
          ...resolutionColumns,
          quantity: source.quantity - moveCount,
          foundCopies: foundArray(denseFound(source.foundCopies, source.quantity - moveCount)),
        })
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .execute();
      const last = await db
        .selectFrom("deckCheckEntryCards")
        .select("sortOrder")
        .where("entryId", "=", entryId)
        .orderBy("sortOrder", "desc")
        .limit(1)
        .executeTakeFirst();
      await db
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
     * @returns False when the row or copy no longer exists.
     */
    async deleteEntryCardCopy(
      entryId: string,
      cardId: string,
      copyIndex: number,
    ): Promise<boolean> {
      const position = copyIndex + 1;
      const card = await db
        .selectFrom("deckCheckEntryCards")
        .select(["quantity"])
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      if (!card || position > card.quantity) {
        return false;
      }
      if (card.quantity === 1) {
        const result = await db
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
      `.execute(db);
      return (result.numAffectedRows ?? 0n) > 0n;
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
     * Card lines of an event still unmatched or ambiguous, for the re-resolve action.
     * @returns The unresolved card rows across all of the event's entries.
     */
    listUnresolvedCardsForEvent(eventId: string): Promise<DeckCheckEntryCard[]> {
      return (
        db
          .selectFrom("deckCheckEntryCards as c")
          .innerJoin("deckCheckEntries as en", "en.id", "c.entryId")
          .selectAll("c")
          .where("en.eventId", "=", eventId)
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
    ): Promise<Map<string, { cardId: string; name: string; type: string }>> {
      if (shortCodes.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select(["p.shortCode", "c.id", "c.name", "c.type"])
        .where("p.shortCode", "in", [...new Set(shortCodes)])
        .execute();
      const byShortCode = new Map<string, { cardId: string; name: string; type: string }>();
      for (const row of rows) {
        if (!byShortCode.has(row.shortCode)) {
          byShortCode.set(row.shortCode, { cardId: row.id, name: row.name, type: row.type });
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
          superTypes: string[];
          domains: string[];
          tags: string[];
          keywords: string[];
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
          "mca.superTypes",
          "mca.domains",
          "c.tags",
          "c.keywords",
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
            superTypes: row.superTypes ?? [],
            domains: row.domains ?? [],
            tags: row.tags ?? [],
            keywords: row.keywords ?? [],
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

    // ── Push keys ───────────────────────────────────────────────────────────

    async listKeysForGroup(
      groupId: string,
    ): Promise<(DeckCheckKey & { createdByName: string | null })[]> {
      const rows = await db
        .selectFrom("deckCheckKeys as k")
        .leftJoin("users as u", "u.id", "k.createdBy")
        .selectAll("k")
        .select((eb) => eb.ref("u.name").as("createdByName"))
        .where("k.groupId", "=", groupId)
        .orderBy("k.createdAt", "desc")
        .execute();
      return rows.map((row) => ({ ...row, createdByName: row.createdByName ?? null }));
    },

    createKey(input: {
      groupId: string;
      tokenHash: string;
      tokenPrefix: string;
      label: string | null;
      createdBy: string;
    }): Promise<DeckCheckKey> {
      return db.insertInto("deckCheckKeys").values(input).returningAll().executeTakeFirstOrThrow();
    },

    updateKeyLabel(
      groupId: string,
      keyId: string,
      label: string,
    ): Promise<DeckCheckKey | undefined> {
      return db
        .updateTable("deckCheckKeys")
        .set({ label })
        .where("id", "=", keyId)
        .where("groupId", "=", groupId)
        .returningAll()
        .executeTakeFirst();
    },

    async revokeKey(groupId: string, keyId: string): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckKeys")
        .set({ revokedAt: new Date() })
        .where("id", "=", keyId)
        .where("groupId", "=", groupId)
        .where("revokedAt", "is", null)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    /**
     * Resolves a presented token's hash to its group; revoked keys do not match.
     * @returns The key id and group id, or undefined when no active key matches.
     */
    findActiveKeyByHash(tokenHash: string): Promise<{ id: string; groupId: string } | undefined> {
      return db
        .selectFrom("deckCheckKeys")
        .select(["id", "groupId"])
        .where("tokenHash", "=", tokenHash)
        .where("revokedAt", "is", null)
        .executeTakeFirst();
    },

    async touchKeyUsage(keyId: string): Promise<void> {
      await db
        .updateTable("deckCheckKeys")
        .set({ lastUsedAt: new Date() })
        .where("id", "=", keyId)
        .execute();
    },
  };
}
