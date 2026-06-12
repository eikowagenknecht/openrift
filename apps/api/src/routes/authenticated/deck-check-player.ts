import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES, SELF_SUBMIT_EXTERNAL_ID_PREFIX } from "@openrift/shared";
import type {
  DeckCheckEntryCardResponse,
  DeckCheckSubmissionResultResponse,
  PlayerDeckCheckEntryDetailResponse,
  PlayerDeckCheckEntrySummaryResponse,
} from "@openrift/shared";
import {
  deckCheckSubmissionPageResponseSchema,
  deckCheckSubmissionResultResponseSchema,
  playerDeckCheckEntriesResponseSchema,
  playerDeckCheckEntryDetailResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  deckCheckSubmissionTokenParamSchema,
  playerDeckCheckEntryParamSchema,
  playerDeckCheckSubmissionSchema,
} from "@openrift/shared/schemas";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import type {
  DeckCheckEntry,
  DeckCheckEvent,
  NewDeckCheckEntryCard,
  PlayerDeckCheckEntryRow,
} from "../../repositories/deck-check.js";
import {
  buildEntryAdvisories,
  toDeckCheckEntryCardResponse,
} from "../../services/deck-check-advisories.js";
import type { PlayerSharingConsent } from "../../services/deck-check-player.js";
import {
  applyPlayerList,
  buildPlayerLines,
  createSelfSubmittedEntry,
  lazyMatchEntriesForUser,
  resolvePlayerCardRows,
} from "../../services/deck-check-player.js";
import {
  settleExpiredEditable,
  submissionWindowOpen,
  submitEntryList,
  unlockEntryToEditable,
} from "../../services/deck-check-states.js";

// ─── Mappers ────────────────────────────────────────────────────────────────

function isoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function toPlayerSummary(row: PlayerDeckCheckEntryRow): PlayerDeckCheckEntrySummaryResponse {
  // The list view shows the effective state without persisting the deadline
  // settle: an editable entry past the close date reads as submitted; the
  // actual transition happens when the entry (or its event) is next loaded.
  const windowOpen = submissionWindowOpen({
    status: row.eventStatus,
    submissionsCloseAt: row.submissionsCloseAt,
  });
  return {
    id: row.id,
    eventName: row.eventName,
    eventDate: isoDate(row.eventDate),
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    state: row.state === "editable" && !windowOpen ? "submitted" : row.state,
    reviewOutcome: row.reviewOutcome,
    unlockRequested: row.unlockRequestedAt !== null,
    playerMessage: row.playerMessage,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Builds the player projection of one entry: the deck by zone with the
 * advisory findings, and nothing the judging team owns (no other entrants, no
 * `checked_by`, no judge notes).
 * @returns The player entry-detail response.
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
 * @returns Card-line responses for the preview.
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

/**
 * Loads one of the caller's entries with its event, settling the deadline
 * auto-submit on the way (ADR-027). Not-owned and missing entries are 404
 * (never 403), so existence is not leaked.
 * @returns The (possibly settled) row and its event.
 */
async function loadOwnEntry(
  repos: Repos,
  userId: string,
  entryId: string,
): Promise<{ row: PlayerDeckCheckEntryRow; event: DeckCheckEvent }> {
  const row = await repos.deckCheck.getEntryForPlayer(entryId, userId);
  if (!row) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  const event = await repos.deckCheck.getEventById(row.eventId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  const settled = await settleExpiredEditable(repos, event, row);
  return { row: { ...row, ...settled }, event };
}

async function loadOpenSubmissionEvent(
  repos: Repos,
  token: string,
): Promise<DeckCheckEvent & { groupName: string }> {
  const event = await repos.deckCheck.getEventBySubmissionToken(token);
  // A disabled flag makes the link dead, not just read-only: the flag is
  // checked on every request, never the token alone (ADR-026).
  if (!event || !event.allowSelfSubmission) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Submission link not found");
  }
  return event;
}

/**
 * Persists a submission: replaces and resubmits the caller's linked entry
 * while it is still in the player's hands (`editable` or `submitted` — the
 * latter being the self-service unlock, replace, and resubmit composed into
 * one step, ADR-027); creates a fresh self-submitted entry otherwise. An
 * `approved` or `checked` entry is locked (the deck page handles unlock
 * requests), and a withdrawn one blocks both paths so a pulled player cannot
 * sidestep the withdrawal through the token link.
 * @returns The written entry.
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
        "Your entry was withdrawn by the organizer; contact a judge",
      );
    }
    if (linked.state === "approved" || linked.state === "checked") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Your deck was already reviewed by a judge; ask for it to be unlocked from your deck page",
      );
    }
    if (linked.state === "submitted" && event.listLockMode === "on_submit") {
      // Submitting was the delivery (TR 401.3): the link cannot replace it.
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Your deck is already submitted; ask for it to be unlocked from your deck page",
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
      "A judge detached your previous submission; contact a judge",
    );
  }

  const account = await repos.deckCheck.getUserAccount(userId);
  if (!account) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Account not found");
  }
  return createSelfSubmittedEntry(repos, event, account, lines, cardRows, consent);
}

// ─── Route definitions (OpenAPI) ────────────────────────────────────────────

const listMyEntries = createRoute({
  method: "get",
  path: "/deck-check/mine",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    'The caller\'s "My tournament decks" list (ADR-026): every entry linked ' +
    "to their account, withdrawn ones included. Loading the list also runs " +
    "the lazy email auto-match.",
  responses: {
    200: {
      content: { "application/json": { schema: playerDeckCheckEntriesResponseSchema } },
      description: "The caller's entries",
    },
    ...errorResponses(401),
  },
});

const getMyEntry = createRoute({
  method: "get",
  path: "/deck-check/mine/{entryId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "One of the caller's entries, rendered for the player. An entry not " +
    "linked to the caller is a 404 (not 403), so existence is not leaked.",
  request: { params: playerDeckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: playerDeckCheckEntryDetailResponseSchema } },
      description: "The player entry payload",
    },
    ...errorResponses(401, 404),
  },
});

const editMyEntry = createRoute({
  method: "put",
  path: "/deck-check/mine/{entryId}/list",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Replaces the caller's entry list from an own deck or a deck code. Only " +
    "allowed while the entry is editable (ADR-027); submitting it for review " +
    "is the separate submit action. Independent of the self-submission flag.",
  request: {
    params: playerDeckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: playerDeckCheckSubmissionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckSubmissionResultResponseSchema } },
      description: "The replaced (or previewed) list with advisory findings",
    },
    ...errorResponses(400, 401, 404, 409, 422),
  },
});

const submitMyEntry = createRoute({
  method: "post",
  path: "/deck-check/mine/{entryId}/submit",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Sends the caller's editable entry for review (ADR-027): the list locks " +
    "and the judge sees a diff against the version they last reviewed.",
  request: { params: playerDeckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: playerDeckCheckEntryDetailResponseSchema } },
      description: "The updated player entry payload",
    },
    ...errorResponses(401, 404, 409),
  },
});

const unlockMyEntry = createRoute({
  method: "post",
  path: "/deck-check/mine/{entryId}/unlock",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Unlocks the caller's entry for editing (ADR-027). A submitted entry " +
    "unlocks immediately only in the event's at_deadline lock mode; otherwise " +
    "(and always for an approved entry) this files an unlock request a judge " +
    "grants or declines.",
  request: { params: playerDeckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: playerDeckCheckEntryDetailResponseSchema } },
      description: "The updated player entry payload",
    },
    ...errorResponses(401, 404, 409),
  },
});

const cancelMyUnlockRequest = createRoute({
  method: "delete",
  path: "/deck-check/mine/{entryId}/unlock",
  tags: ["Deck Check"],
  security: cookieAuth,
  description: "Cancels the caller's pending unlock request (ADR-027).",
  request: { params: playerDeckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: playerDeckCheckEntryDetailResponseSchema } },
      description: "The updated player entry payload",
    },
    ...errorResponses(401, 404),
  },
});

const getSubmissionPage = createRoute({
  method: "get",
  path: "/deck-check/submissions/{token}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "What a logged-in holder of a submission link sees before submitting " +
    "(ADR-026). A disabled or unknown token is a 404.",
  request: { params: deckCheckSubmissionTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckSubmissionPageResponseSchema } },
      description: "The submission page payload",
    },
    ...errorResponses(401, 404),
  },
});

const submitDeck = createRoute({
  method: "post",
  path: "/deck-check/submissions/{token}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Submits a deck to an event (ADR-026). Edits the caller's linked entry " +
    "when one exists; otherwise creates a self-submitted entry keyed by the " +
    "caller's account. `dryRun` previews the resolved lines and advisory " +
    "legality findings without writing.",
  request: {
    params: deckCheckSubmissionTokenParamSchema,
    body: {
      content: { "application/json": { schema: playerDeckCheckSubmissionSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckSubmissionResultResponseSchema } },
      description: "The submitted (or previewed) list with advisory findings",
    },
    ...errorResponses(400, 401, 404, 409, 422),
  },
});

// ─── App ────────────────────────────────────────────────────────────────────

const deckCheckPlayerApp = createApiApp();
deckCheckPlayerApp.use("/deck-check/*", requireAuth);

export const deckCheckPlayerRoute = deckCheckPlayerApp
  .openapi(listMyEntries, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    await lazyMatchEntriesForUser(repos, userId);
    const rows = await repos.deckCheck.listEntriesForPlayer(userId);
    return c.json({ items: rows.map((row) => toPlayerSummary(row)) }, 200);
  })

  .openapi(getMyEntry, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { entryId } = c.req.valid("param");
    const { row, event } = await loadOwnEntry(repos, userId, entryId);
    return c.json(await buildPlayerDetail(repos, row, event), 200);
  })

  .openapi(editMyEntry, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { entryId } = c.req.valid("param");
    const body = c.req.valid("json");

    const { row, event } = await loadOwnEntry(repos, userId, entryId);
    if (!submissionWindowOpen(event)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed; contact a judge");
    }
    if (row.state !== "editable" && !body.dryRun) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        row.state === "withdrawn"
          ? "Your entry was withdrawn by the organizer; contact a judge"
          : "Your deck is locked; unlock it before editing",
      );
    }

    const lines = await buildPlayerLines(repos, userId, body);
    const cardRows = await resolvePlayerCardRows(repos, lines);
    const advisories = await buildEntryAdvisories(repos, event, cardRows);
    if (body.dryRun) {
      return c.json(
        {
          entryId: null,
          cards: toPreviewCards(cardRows),
          violations: advisories.violations,
        } satisfies DeckCheckSubmissionResultResponse,
        200,
      );
    }

    const entry = await c.get("transact")((txRepos) =>
      applyPlayerList(txRepos, row, lines, cardRows, {
        allowDeckPublishing: body.allowDeckPublishing,
        allowNameSharing: body.allowNameSharing,
        allowRiotIdSharing: body.allowRiotIdSharing,
      }),
    );
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    return c.json(
      {
        entryId: entry.id,
        cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
        violations: advisories.violations,
      } satisfies DeckCheckSubmissionResultResponse,
      200,
    );
  })

  .openapi(submitMyEntry, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { entryId } = c.req.valid("param");
    const { row, event } = await loadOwnEntry(repos, userId, entryId);
    if (!submissionWindowOpen(event)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed; contact a judge");
    }
    if (row.state !== "editable") {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Only an editable deck can be submitted");
    }
    const submitted = await c.get("transact")((txRepos) => submitEntryList(txRepos, row));
    return c.json(await buildPlayerDetail(repos, { ...row, ...submitted }, event), 200);
  })

  .openapi(unlockMyEntry, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { entryId } = c.req.valid("param");
    const { row, event } = await loadOwnEntry(repos, userId, entryId);
    if (!submissionWindowOpen(event)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions closed; contact a judge");
    }
    if (row.state === "submitted" && event.listLockMode === "at_deadline") {
      // Self-service in the lenient mode: delivery only happens when the
      // window closes. An existing baseline is kept so repeated unlock/submit
      // cycles diff against the same reviewed list.
      const unlocked = await c.get("transact")((txRepos) =>
        unlockEntryToEditable(txRepos, row, { keepExistingBaseline: true }),
      );
      return c.json(await buildPlayerDetail(repos, { ...row, ...unlocked }, event), 200);
    }
    if (row.state === "submitted" || row.state === "approved") {
      // Judge-gated (TR 401.3): file (or refresh) the unlock request.
      const requested = await repos.deckCheck.updateEntry(row.id, {
        unlockRequestedAt: row.unlockRequestedAt ?? new Date(),
      });
      return c.json(await buildPlayerDetail(repos, { ...row, ...requested }, event), 200);
    }
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      row.state === "editable"
        ? "Your deck is already editable"
        : "Contact a judge to unlock this deck",
    );
  })

  .openapi(cancelMyUnlockRequest, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const { entryId } = c.req.valid("param");
    const { row, event } = await loadOwnEntry(repos, userId, entryId);
    const cleared = row.unlockRequestedAt
      ? await repos.deckCheck.updateEntry(row.id, { unlockRequestedAt: null })
      : undefined;
    return c.json(await buildPlayerDetail(repos, { ...row, ...cleared }, event), 200);
  })

  .openapi(getSubmissionPage, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const event = await loadOpenSubmissionEvent(repos, c.req.valid("param").token);
    await lazyMatchEntriesForUser(repos, userId);
    const linked = await repos.deckCheck.getLinkedEntryForUser(event.id, userId);
    return c.json(
      {
        eventName: event.name,
        eventDate: event.eventDate
          ? event.eventDate instanceof Date
            ? event.eventDate.toISOString().slice(0, 10)
            : String(event.eventDate)
          : null,
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
      },
      200,
    );
  })

  .openapi(submitDeck, async (c) => {
    const repos = c.get("repos");
    const userId = getUserId(c);
    const body = c.req.valid("json");
    const event = await loadOpenSubmissionEvent(repos, c.req.valid("param").token);
    await lazyMatchEntriesForUser(repos, userId);

    const lines = await buildPlayerLines(repos, userId, body);
    const cardRows = await resolvePlayerCardRows(repos, lines);
    const advisories = await buildEntryAdvisories(repos, event, cardRows);
    if (body.dryRun) {
      return c.json(
        {
          entryId: null,
          cards: toPreviewCards(cardRows),
          violations: advisories.violations,
        } satisfies DeckCheckSubmissionResultResponse,
        200,
      );
    }

    if (!submissionWindowOpen(event)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Submissions are closed");
    }
    const entry = await c.get("transact")((txRepos) =>
      persistSubmission(txRepos, event, userId, lines, cardRows, {
        allowDeckPublishing: body.allowDeckPublishing,
        allowNameSharing: body.allowNameSharing,
        allowRiotIdSharing: body.allowRiotIdSharing,
      }),
    );
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    return c.json(
      {
        entryId: entry.id,
        cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
        violations: advisories.violations,
      } satisfies DeckCheckSubmissionResultResponse,
      200,
    );
  });
