import { ERROR_CODES, SELF_SUBMIT_EXTERNAL_ID_PREFIX } from "@openrift/shared";
import type {
  DeckCheckClaimResultResponse,
  DeckCheckEntryCardResponse,
  DeckCheckSubmissionPageResponse,
  DeckCheckSubmissionResultResponse,
  PlayerDeckCheckEntryDetailResponse,
} from "@openrift/shared";
import { deckCheckPlayerContract } from "@openrift/shared/contracts/deck-check-player";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { isoDate, toDeckCheckEntryCardResponse } from "../../lib/deck-check-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type {
  DeckCheckEntry,
  DeckCheckEvent,
  NewDeckCheckEntryCard,
  PlayerDeckCheckEntryRow,
} from "../../repositories/deck-check.js";
import { buildEntryAdvisories } from "../../services/deck-check-advisories.js";
import type { PlayerSharingConsent } from "../../services/deck-check-player.js";
import {
  applyPlayerList,
  buildPlayerLines,
  claimParticipantByToken,
  createSelfSubmittedEntry,
  resolvePlayerCardRows,
} from "../../services/deck-check-player.js";
import {
  settleExpiredEditable,
  submissionWindowOpen,
  submitEntryList,
  unlockEntryToEditable,
} from "../../services/deck-check-states.js";

/**
 * The player projection of one entry: the deck by zone with the advisory
 * findings, and nothing the judging team owns (no other entrants, no
 * `checked_by`, no judge notes).
 */
async function buildPlayerDetail(
  repos: Repos,
  row: PlayerDeckCheckEntryRow,
  event: DeckCheckEvent,
): Promise<PlayerDeckCheckEntryDetailResponse> {
  const cards = await repos.deckCheck.listCardsForEntry(row.id);
  const advisories = await buildEntryAdvisories(repos, event, cards);
  const windowOpen = submissionWindowOpen(event);
  // In 'on_submit' mode submitting is the delivery (TR 401.3): the player can
  // only ever request an unlock. In 'at_deadline' mode a not-yet-reviewed
  // submission unlocks self-service until the window closes.
  const canUnlock = windowOpen && row.state === "submitted" && event.listLockMode === "at_deadline";
  const canRequestUnlock =
    windowOpen &&
    row.unlockRequestedAt === null &&
    (row.state === "approved" || (row.state === "submitted" && !canUnlock));
  return {
    entry: {
      id: row.id,
      eventName: row.eventName,
      eventDate: isoDate(row.eventDate),
      groupName: row.groupName,
      format: event.format,
      allowedSets: event.allowedSets,
      state: row.state,
      reviewOutcome: row.reviewOutcome,
      unlockRequested: row.unlockRequestedAt !== null,
      playerMessage: row.playerMessage,
      allowDeckPublishing: row.allowDeckPublishing,
      allowNameSharing: row.allowNameSharing,
      allowRiotIdSharing: row.allowRiotIdSharing,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      submissionsCloseAt: event.submissionsCloseAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      windowOpen,
      canEdit: windowOpen && row.state === "editable",
      canUnlock,
      canRequestUnlock,
    },
    cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
    ...advisories,
  };
}

/**
 * The dry-run preview shape: not-yet-persisted rows get synthetic ids and
 * empty ticks so they render through the same card-line components.
 */
function toPreviewCards(cardRows: NewDeckCheckEntryCard[]): DeckCheckEntryCardResponse[] {
  return cardRows.map((row) => ({
    id: `preview-${row.sortOrder}`,
    sortOrder: row.sortOrder,
    rawName: row.rawName,
    section: row.section,
    zone: row.zone as DeckCheckEntryCardResponse["zone"],
    quantity: row.quantity,
    matchStatus: row.matchStatus,
    foundCopies: Array.from({ length: row.quantity }, () => false),
    resolvedCardId: row.resolvedCardId,
    resolvedPrintingId: row.resolvedPrintingId,
  }));
}

interface LoadedOwnEntry {
  row: PlayerDeckCheckEntryRow;
  event: DeckCheckEvent;
  justSettled: boolean;
}

/**
 * Loads one of the caller's entries with its event, settling the deadline
 * auto-submit on the way. Not-owned and missing entries are 404 (never 403),
 * so existence is not leaked.
 */
async function loadOwnEntry(
  repos: Repos,
  userId: string,
  entryId: string,
): Promise<LoadedOwnEntry> {
  return withSettledEvent(repos, await repos.deckCheck.getEntryForPlayer(entryId, userId));
}

/**
 * The same load keyed by tournament: the player's deck page is a section of the
 * tournament, so it addresses the entry through the tournament it belongs to.
 * A viewer with no entry there is a 404, exactly like a viewer asking for
 * someone else's.
 */
async function loadOwnEntryForTournament(
  repos: Repos,
  userId: string,
  tournamentId: string,
): Promise<LoadedOwnEntry> {
  return withSettledEvent(
    repos,
    await repos.deckCheck.getEntryForPlayerByTournament(tournamentId, userId),
  );
}

/**
 * Resolves a looked-up player row to its event and settles the deadline
 * auto-submit, 404-ing whenever either half is missing.
 *
 * `justSettled` reports whether this call was the one that performed the
 * deadline auto-submit, rather than finding the entry already settled. Loading
 * an entry writes in that case, so a caller that is about to reject on a closed
 * window needs to know whether the rejection would contradict a write it just
 * caused. Only `submit` acts on it: see the window guard there.
 */
async function withSettledEvent(
  repos: Repos,
  row: PlayerDeckCheckEntryRow | undefined,
): Promise<LoadedOwnEntry> {
  if (!row) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  const event = await repos.deckCheck.getEventById(row.tournamentId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  const settled = await settleExpiredEditable(repos, event, row);
  return {
    row: { ...row, ...settled },
    event,
    justSettled: row.state === "editable" && settled.state !== "editable",
  };
}

async function loadOpenSubmissionEvent(
  repos: Repos,
  token: string,
): Promise<DeckCheckEvent & { groupName: string }> {
  const event = await repos.deckCheck.getEventBySubmissionToken(token);
  // The submission token is the link's on/off switch (rotating or disabling it
  // clears the token, so the lookup misses). Self-registration is a separate
  // policy gate handled per-caller: turning it off keeps the link alive for
  // already-claimed participants.
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Submission link not found");
  }
  return event;
}

/**
 * Loads the submission event for a token and enforces the self-registration
 * gate. When self-registration is open, anyone with the link may submit
 * (creating their own spot). When it is closed, only a caller who already
 * holds a spot may submit; a stranger must claim their spot via the personal
 * claim link the organizer sent before the link will take a deck.
 */
async function loadSubmissionEventForUser(
  repos: Repos,
  token: string,
  userId: string,
): Promise<DeckCheckEvent & { groupName: string }> {
  const event = await loadOpenSubmissionEvent(repos, token);
  if (!event.allowSelfSubmission) {
    const participant = await repos.tournaments.findParticipantByUser(event.id, userId);
    if (!participant) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Self-registration is closed for this event. Claim your spot with the link the organizer sent you, then submit your deck.",
      );
    }
  }
  return event;
}

/**
 * Persists a submission: replaces and resubmits the caller's linked entry
 * while it is still in the player's hands (`editable` or `submitted` — the
 * latter being the self-service unlock, replace, and resubmit composed into
 * one step); creates a fresh self-submitted entry otherwise. An `approved` or
 * `checked` entry is locked (the deck page handles unlock requests), and a
 * withdrawn one blocks both paths so a pulled player cannot sidestep the
 * withdrawal through the token link.
 */
async function persistSubmission(
  repos: Repos,
  event: DeckCheckEvent,
  userId: string,
  lines: Awaited<ReturnType<typeof buildPlayerLines>>,
  cardRows: NewDeckCheckEntryCard[],
  consent: PlayerSharingConsent,
): Promise<DeckCheckEntry> {
  const linked = await repos.deckCheck.getLinkedEntryForUser(event.id, userId);
  if (linked) {
    if (linked.state === "withdrawn") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Your entry was withdrawn by the organizer. Contact a judge.",
      );
    }
    if (linked.state === "approved" || linked.state === "checked") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Your deck was already reviewed by a judge. Ask for it to be unlocked from your deck page.",
      );
    }
    if (linked.state === "submitted" && event.listLockMode === "on_submit") {
      // Submitting was the delivery (TR 401.3): the link cannot replace it.
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Your deck is already submitted. Ask for it to be unlocked from your deck page.",
      );
    }
    const replaced = await applyPlayerList(repos, linked, lines, cardRows, consent);
    return submitEntryList(repos, replaced);
  }

  // A judge-unlinked self-submitted entry still occupies the caller's
  // external id; re-creating it would violate the unique key, and silently
  // re-linking would override the judge. Both ways, a judge has to resolve it.
  const orphan = await repos.deckCheck.getEntryByExternalId(
    event.id,
    `${SELF_SUBMIT_EXTERNAL_ID_PREFIX}${userId}`,
  );
  if (orphan) {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "A judge detached your previous submission. Contact a judge.",
    );
  }

  const account = await repos.deckCheck.getUserAccount(userId);
  if (!account) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Account not found");
  }
  return createSelfSubmittedEntry(repos, event, account, lines, cardRows, consent);
}

const os = implement(deckCheckPlayerContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Player-facing deck-check contract, mounted at `/api/v1/deck-check`.
 * Not-found / conflict / validation states are thrown as `AppError` and
 * mapped to ORPCErrors by the handler's appErrorInterceptor.
 */
export const deckCheckPlayerRouter = {
  getMine: os.getMine.handler(
    async ({ input, context }): Promise<PlayerDeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const { row, event } = await loadOwnEntryForTournament(repos, userId, input.tournamentId);
      return buildPlayerDetail(repos, row, event);
    },
  ),

  editList: os.editList.handler(
    async ({ input, context }): Promise<DeckCheckSubmissionResultResponse> => {
      const repos = context.repos;
      const userId = context.userId;

      const { row, event } = await loadOwnEntry(repos, userId, input.entryId);
      if (!submissionWindowOpen(event)) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed. Contact a judge.");
      }
      if (row.state !== "editable" && !input.dryRun) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          row.state === "withdrawn"
            ? "Your entry was withdrawn by the organizer. Contact a judge."
            : "Your deck is locked. Unlock it before editing.",
        );
      }

      const lines = await buildPlayerLines(repos, userId, input);
      const cardRows = await resolvePlayerCardRows(repos, lines);
      const advisories = await buildEntryAdvisories(repos, event, cardRows);
      if (input.dryRun) {
        return {
          entryId: null,
          tournamentId: event.id,
          cards: toPreviewCards(cardRows),
          violations: advisories.violations,
        };
      }

      const entry = await context.transact(async (txRepos) => {
        // Re-load under the row lock: the state checked above may be stale by
        // now (a judge lock, a second tab), and the write must apply to the
        // entry as it is, not as it was.
        const fresh = await txRepos.deckCheck.getEntryForUpdate(event.id, row.id);
        if (!fresh || fresh.state !== "editable") {
          throw new AppError(
            409,
            ERROR_CODES.CONFLICT,
            "Your deck is locked. Unlock it before editing.",
          );
        }
        return applyPlayerList(txRepos, fresh, lines, cardRows, {
          allowDeckPublishing: input.allowDeckPublishing,
          allowNameSharing: input.allowNameSharing,
          allowRiotIdSharing: input.allowRiotIdSharing,
        });
      });
      const cards = await repos.deckCheck.listCardsForEntry(entry.id);
      return {
        entryId: entry.id,
        tournamentId: event.id,
        cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
        violations: advisories.violations,
      };
    },
  ),

  submit: os.submit.handler(
    async ({ input, context }): Promise<PlayerDeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const { row, event, justSettled } = await loadOwnEntry(repos, userId, input.entryId);
      if (!submissionWindowOpen(event)) {
        // Loading the entry auto-submits it when the deadline has passed
        // (settleExpiredEditable, via loadOwnEntry). Where that just happened,
        // the deck really did go in, backdated to the close time, so the
        // player got what they asked for and a 409 would contradict the write
        // this request itself caused. Only an entry that was already past the
        // deadline before this call is a genuine conflict.
        if (justSettled) {
          return buildPlayerDetail(repos, row, event);
        }
        throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed. Contact a judge.");
      }
      if (row.state !== "editable") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Only an editable deck can be submitted");
      }
      const submitted = await context.transact(async (txRepos) => {
        // Re-load under the row lock — the state above may be stale, and a
        // judge transition committed in the gap must not be overwritten.
        const fresh = await txRepos.deckCheck.getEntryForUpdate(event.id, row.id);
        if (!fresh || fresh.state !== "editable") {
          throw new AppError(409, ERROR_CODES.CONFLICT, "Only an editable deck can be submitted");
        }
        return submitEntryList(txRepos, fresh);
      });
      return buildPlayerDetail(repos, { ...row, ...submitted }, event);
    },
  ),

  unlock: os.unlock.handler(
    async ({ input, context }): Promise<PlayerDeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const { row, event } = await loadOwnEntry(repos, userId, input.entryId);
      if (!submissionWindowOpen(event)) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed. Contact a judge.");
      }
      if (row.state === "submitted" && event.listLockMode === "at_deadline") {
        // Self-service in the lenient mode: delivery only happens when the
        // window closes. An existing baseline is kept so repeated unlock/submit
        // cycles diff against the same reviewed list.
        const unlocked = await context.transact(async (txRepos) => {
          // Re-load under the row lock: an approval committed in the gap must
          // not be silently reverted by a stale self-unlock.
          const fresh = await txRepos.deckCheck.getEntryForUpdate(event.id, row.id);
          if (!fresh || fresh.state !== "submitted") {
            throw new AppError(
              409,
              ERROR_CODES.CONFLICT,
              "The deck's state changed in the meantime. Reload and try again.",
            );
          }
          return unlockEntryToEditable(txRepos, fresh, { keepExistingBaseline: true });
        });
        return buildPlayerDetail(repos, { ...row, ...unlocked }, event);
      }
      if (row.state === "submitted" || row.state === "approved") {
        // Judge-gated (TR 401.3): file (or refresh) the unlock request.
        const requested = await repos.deckCheck.updateEntry(row.id, {
          unlockRequestedAt: row.unlockRequestedAt ?? new Date(),
        });
        return buildPlayerDetail(repos, { ...row, ...requested }, event);
      }
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        row.state === "editable"
          ? "Your deck is already editable"
          : "Contact a judge to unlock this deck",
      );
    },
  ),

  cancelUnlock: os.cancelUnlock.handler(
    async ({ input, context }): Promise<PlayerDeckCheckEntryDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const { row, event } = await loadOwnEntry(repos, userId, input.entryId);
      const cleared = row.unlockRequestedAt
        ? await repos.deckCheck.updateEntry(row.id, { unlockRequestedAt: null })
        : undefined;
      return buildPlayerDetail(repos, { ...row, ...cleared }, event);
    },
  ),

  submissionPage: os.submissionPage.handler(
    async ({ input, context }): Promise<DeckCheckSubmissionPageResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const event = await loadSubmissionEventForUser(repos, input.token, userId);
      const linked = await repos.deckCheck.getLinkedEntryForUser(event.id, userId);
      return {
        eventName: event.name,
        eventDate: isoDate(event.eventDate),
        groupName: event.groupName,
        format: event.format,
        allowedSets: event.allowedSets,
        submissionsCloseAt: event.submissionsCloseAt?.toISOString() ?? null,
        submissionsOpen: submissionWindowOpen(event),
        linkedEntry: linked
          ? (() => {
              const state =
                linked.state === "editable" && !submissionWindowOpen(event)
                  ? ("submitted" as const)
                  : linked.state;
              return {
                id: linked.id,
                state,
                canReplace:
                  state === "editable" ||
                  (state === "submitted" && event.listLockMode === "at_deadline"),
                allowDeckPublishing: linked.allowDeckPublishing,
                allowNameSharing: linked.allowNameSharing,
                allowRiotIdSharing: linked.allowRiotIdSharing,
              };
            })()
          : null,
      };
    },
  ),

  submitToToken: os.submitToToken.handler(
    async ({ input, context }): Promise<DeckCheckSubmissionResultResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const event = await loadSubmissionEventForUser(repos, input.token, userId);

      const lines = await buildPlayerLines(repos, userId, input);
      const cardRows = await resolvePlayerCardRows(repos, lines);
      const advisories = await buildEntryAdvisories(repos, event, cardRows);
      if (input.dryRun) {
        return {
          entryId: null,
          tournamentId: event.id,
          cards: toPreviewCards(cardRows),
          violations: advisories.violations,
        };
      }

      if (!submissionWindowOpen(event)) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions are closed");
      }
      const entry = await context.transact((txRepos) =>
        persistSubmission(txRepos, event, userId, lines, cardRows, {
          allowDeckPublishing: input.allowDeckPublishing,
          allowNameSharing: input.allowNameSharing,
          allowRiotIdSharing: input.allowRiotIdSharing,
        }),
      );
      const cards = await repos.deckCheck.listCardsForEntry(entry.id);
      return {
        entryId: entry.id,
        tournamentId: event.id,
        cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
        violations: advisories.violations,
      };
    },
  ),

  claim: os.claim.handler(async ({ input, context }): Promise<DeckCheckClaimResultResponse> => {
    const userId = context.userId;
    const result = await context.transact((txRepos) =>
      claimParticipantByToken(txRepos, input.token, userId),
    );
    if (!result) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Claim link not found");
    }
    return result;
  }),
};
