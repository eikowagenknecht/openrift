// oxlint-disable-next-line import/no-nodejs-modules -- server-side key minting, never reaches the browser
import { createHash, randomBytes } from "node:crypto";

import { createRoute } from "@hono/zod-openapi";
import { deckCheckEntrySource, ERROR_CODES, mapSectionToZone } from "@openrift/shared";
import type {
  DeckCheckEntryDetailResponse,
  DeckCheckEntryResponse,
  DeckCheckEntrySummaryResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyResponse,
} from "@openrift/shared";
import {
  deckCheckAccountSearchResponseSchema,
  deckCheckEntryDetailResponseSchema,
  deckCheckEventDetailResponseSchema,
  deckCheckEventListResponseSchema,
  deckCheckEventSummaryResponseSchema,
  deckCheckKeyMintedResponseSchema,
  deckCheckKeyResponseSchema,
  deckCheckKeysResponseSchema,
  deckCheckReResolveResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  addDeckCheckCardSchema,
  applyDeckCheckZoneFixesSchema,
  createDeckCheckEntrySchema,
  createDeckCheckEventSchema,
  deckCheckAccountSearchSchema,
  deckCheckCardCopyParamSchema,
  deckCheckEntryCardParamSchema,
  deckCheckEntryParamSchema,
  deckCheckEntryStateChangeSchema,
  deckCheckEventParamSchema,
  deckCheckKeyParamSchema,
  deckCheckLinkSchema,
  deckCheckTickSchema,
  friendGroupSlugParamSchema,
  mintDeckCheckKeySchema,
  updateDeckCheckCardSchema,
  updateDeckCheckEntrySchema,
  updateDeckCheckEventSchema,
  updateDeckCheckKeySchema,
} from "@openrift/shared/schemas";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { loadGroupForMember, requireRole } from "../../lib/group-access.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
import { cardResolutionKey } from "../../repositories/deck-check.js";
import type {
  DeckCheckEntry,
  DeckCheckEntrySummary,
  DeckCheckEvent,
  DeckCheckEventWithCounts,
  DeckCheckKey,
} from "../../repositories/deck-check.js";
import {
  buildEntryAdvisories,
  computeZoneSuggestions,
  toDeckCheckEntryCardResponse,
} from "../../services/deck-check-advisories.js";
import {
  createManualDeckCheckEntry,
  recomputeEntryHash,
} from "../../services/deck-check-ingest.js";
import {
  applyJudgeTransition,
  settleExpiredEditable,
  submissionWindowOpen,
} from "../../services/deck-check-states.js";
import { generateShareToken } from "../../utils/share-token.js";

// ─── Mappers ────────────────────────────────────────────────────────────────

function isoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function toEventSummary(
  row: DeckCheckEvent & Partial<Pick<DeckCheckEventWithCounts, "entryCount" | "checkedCount">>,
): DeckCheckEventSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    eventDate: isoDate(row.eventDate),
    format: row.format,
    allowedSets: row.allowedSets,
    status: row.status,
    entryCount: row.entryCount ?? 0,
    checkedCount: row.checkedCount ?? 0,
    listLockMode: row.listLockMode,
    allowSelfSubmission: row.allowSelfSubmission,
    submissionToken: row.allowSelfSubmission ? row.submissionToken : null,
    submissionsCloseAt: row.submissionsCloseAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntrySummary(row: DeckCheckEntrySummary): DeckCheckEntrySummaryResponse {
  // An editable list is not yet delivered to an official (TR 401.3, ADR-027);
  // even its copy and progress counts stay hidden from the judge view.
  const listVisible = row.state !== "editable";
  return {
    id: row.id,
    externalId: row.externalId,
    source: deckCheckEntrySource(row.externalId),
    playerName: row.playerName,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    state: row.state,
    reviewOutcome: row.reviewOutcome,
    checkedByName: row.checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    approvedByName: row.approvedByName,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    changedSinceReview: row.changeSummary !== null,
    unlockRequestedAt: row.unlockRequestedAt?.toISOString() ?? null,
    claimedUserName: row.claimedUserName,
    copyCount: listVisible ? row.copyCount : 0,
    verifiedCopyCount: listVisible ? row.verifiedCopyCount : 0,
    unmatchedLineCount: listVisible ? row.unmatchedLineCount : 0,
  };
}

function toEntry(
  row: DeckCheckEntry,
  checkedByName: string | null,
  approvedByName: string | null,
  claimedUserName: string | null,
): DeckCheckEntryResponse {
  return {
    id: row.id,
    externalId: row.externalId,
    source: deckCheckEntrySource(row.externalId),
    playerName: row.playerName,
    playerEmail: row.playerEmail,
    riotId: row.riotId,
    allowDeckPublishing: row.allowDeckPublishing,
    allowNameSharing: row.allowNameSharing,
    allowRiotIdSharing: row.allowRiotIdSharing,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    state: row.state,
    reviewOutcome: row.reviewOutcome,
    checkedBy: row.checkedBy,
    checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    approvedByName,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    unlockRequestedAt: row.unlockRequestedAt?.toISOString() ?? null,
    notes: row.notes,
    changeSummary: row.changeSummary,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    claimedUserId: row.claimedUserId,
    claimedUserName,
    claimSource: row.claimSource,
    claimBlocked: row.claimBlockedAt !== null,
    // Only expose the claim token while a link would still work: not yet linked
    // and not blocked by a judge unlink.
    claimToken: row.claimedUserId === null && row.claimBlockedAt === null ? row.claimToken : null,
    playerMessage: row.playerMessage,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toKey(row: DeckCheckKey & { createdByName?: string | null }): DeckCheckKeyResponse {
  return {
    id: row.id,
    tokenPrefix: row.tokenPrefix,
    label: row.label,
    createdByName: row.createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

// ─── Checker payload assembly ───────────────────────────────────────────────

/**
 * Builds the checker payload: entry, cards, advisory legality findings, and
 * the deck-stat aggregates, reusing the shared deck-rules and the same
 * counting the deck list uses (main+champion zones, legend/rune/battlefield
 * types excluded from type counts).
 * @returns The full entry-detail response.
 */
async function buildEntryDetail(
  repos: Repos,
  event: DeckCheckEvent,
  entry: DeckCheckEntry,
): Promise<DeckCheckEntryDetailResponse> {
  // An editable list has not been delivered to an official yet (TR 401.3,
  // ADR-027): the judge payload carries the entry's identity and state, but
  // no cards, advisories, or stats until the player submits.
  const listVisible = entry.state !== "editable";
  const [cards, checkedByName, approvedByName, claimedUserName] = await Promise.all([
    listVisible ? repos.deckCheck.listCardsForEntry(entry.id) : Promise.resolve([]),
    entry.checkedBy ? repos.deckCheck.getUserName(entry.checkedBy) : Promise.resolve(null),
    entry.approvedBy ? repos.deckCheck.getUserName(entry.approvedBy) : Promise.resolve(null),
    entry.claimedUserId ? repos.deckCheck.getUserName(entry.claimedUserId) : Promise.resolve(null),
  ]);
  const advisories = listVisible
    ? await buildEntryAdvisories(repos, event, cards)
    : { violations: [], typeCounts: [], domainDistribution: [], zoneSuggestions: [] };

  return {
    event: toEventSummary(event),
    entry: toEntry(entry, checkedByName, approvedByName, claimedUserName),
    cards: cards.map((card) => toDeckCheckEntryCardResponse(card)),
    ...advisories,
  };
}

async function loadEvent(repos: Repos, groupId: string, eventId: string): Promise<DeckCheckEvent> {
  const event = await repos.deckCheck.getEvent(groupId, eventId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }
  return event;
}

async function loadEntry(
  repos: Repos,
  event: DeckCheckEvent,
  entryId: string,
): Promise<DeckCheckEntry> {
  const entry = await repos.deckCheck.getEntry(event.id, entryId);
  if (!entry) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  // Settle the deadline auto-submit (ADR-027) so the judge never sees a stale
  // 'editable' entry once the window closed.
  return await settleExpiredEditable(repos, event, entry);
}

/**
 * Guards every card-level judge action: an editable list has not been
 * delivered to an official (TR 401.3, ADR-027), so judges can neither read
 * nor touch its lines until the player submits.
 * @returns Nothing; throws 409 for an editable entry.
 */
function requireListVisible(entry: DeckCheckEntry): void {
  if (entry.state === "editable") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "The player is editing this list; it becomes visible once submitted",
    );
  }
}

// ─── Route definitions (OpenAPI) ────────────────────────────────────────────

const listEvents = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/checks",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEventListResponseSchema } },
      description: "The group's deck-check events",
    },
    ...errorResponses(401, 403, 404),
  },
});

const createEvent = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: createDeckCheckEventSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: deckCheckEventSummaryResponseSchema } },
      description: "Created",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const getEventDetail = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/checks/{eventId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: deckCheckEventParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEventDetailResponseSchema } },
      description: "The event with its entrant list",
    },
    ...errorResponses(401, 403, 404),
  },
});

const updateEvent = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/checks/{eventId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: deckCheckEventParamSchema,
    body: {
      content: { "application/json": { schema: updateDeckCheckEventSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEventSummaryResponseSchema } },
      description: "Updated",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const deleteEvent = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/checks/{eventId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: deckCheckEventParamSchema },
  responses: {
    204: { description: "Deleted" },
    ...errorResponses(401, 403, 404),
  },
});

const reResolveEvent = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks/{eventId}/re-resolve",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Re-runs catalog resolution for the event's unmatched and ambiguous lines " +
    "(after catalog fixes). Matched lines, ticks, and check state are untouched.",
  request: { params: deckCheckEventParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckReResolveResponseSchema } },
      description: "Lines whose resolution improved",
    },
    ...errorResponses(401, 403, 404),
  },
});

const createManualEntry = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks/{eventId}/entries",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Hand-creates an entrant (judge+) for when the organizer push isn't " +
    "available. Card names are resolved against the catalog like a push.",
  request: {
    params: deckCheckEventParamSchema,
    body: {
      content: { "application/json": { schema: createDeckCheckEntrySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "The created entry's checker payload",
    },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

const getEntryDetail = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: deckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "The checker payload",
    },
    ...errorResponses(401, 403, 404),
  },
});

const setEntryState = createRoute({
  method: "put",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/state",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Moves an entry through the lifecycle (judge+, ADR-027): approve, check " +
    "(with an outcome), revoke / re-open back to submitted, hand the list " +
    "back to the linked player (optionally as a rejection), withdraw the " +
    "entry, or restore a withdrawn entry to submitted.",
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: deckCheckEntryStateChangeSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

const denyUnlockRequest = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/unlock-request",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Declines a player's pending unlock request (judge+, ADR-027); the entry " +
    "stays approved. Granting a request is the state transition to editable.",
  request: { params: deckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(401, 403, 404),
  },
});

const updateEntry = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description: "On-site repair of the player's contact details (judge+).",
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: updateDeckCheckEntrySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const deleteEntry = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Permanently removes an entry and its card lines (admin+). Prefer a " +
    "withdrawal when the player merely dropped out; deletion erases the " +
    "check history.",
  request: { params: deckCheckEntryParamSchema },
  responses: {
    204: { description: "Deleted" },
    ...errorResponses(401, 403, 404),
  },
});

const addCard = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/cards",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "On-site repair: adds a card line to the entry (judge+). Recomputes the " +
    "entry's content hash so provider re-pushes diff correctly.",
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: addDeckCheckCardSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404, 422),
  },
});

const renameCard = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/cards/{cardId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "On-site repair: corrects a card line's name (typo fix, re-resolved against " +
    "the catalog) and optionally moves it to a different zone (judge+). Quantity " +
    "and found ticks stay.",
  request: {
    params: deckCheckEntryCardParamSchema,
    body: {
      content: { "application/json": { schema: updateDeckCheckCardSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404, 422),
  },
});

const applyZoneFixes = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/zone-fixes",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "On-site repair: moves the named type-locked cards (Legend / Rune / " +
    "Battlefield) into their correct zone (judge+). The server re-derives each " +
    "target zone, so only the suggested moves are ever applied. Recomputes the " +
    "entry's content hash.",
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: applyDeckCheckZoneFixesSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const removeCardCopy = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/cards/{cardId}/copies/{copyIndex}",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "On-site repair: removes one physical copy of a card line (judge+). " +
    "Removing the last copy removes the line.",
  request: { params: deckCheckCardCopyParamSchema },
  responses: {
    204: { description: "Removed" },
    ...errorResponses(401, 403, 404),
  },
});

const tickCard = createRoute({
  method: "put",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/cards/{cardId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: deckCheckEntryCardParamSchema,
    body: {
      content: { "application/json": { schema: deckCheckTickSchema } },
      required: true,
    },
  },
  responses: {
    204: { description: "Tick stored" },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

const linkEntry = createRoute({
  method: "put",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/link",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Links an entry to an OpenRift account (judge+, ADR-026). Overrides and " +
    "clears any unlink block.",
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: deckCheckLinkSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const unlinkEntry = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/link",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Unlinks an entry from its account (judge+, ADR-026) and blocks every " +
    "auto-match path from re-linking it; a later manual link clears the block.",
  request: { params: deckCheckEntryParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEntryDetailResponseSchema } },
      description: "Updated checker payload",
    },
    ...errorResponses(401, 403, 404),
  },
});

const searchAccounts = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/deck-check-account-search",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Account candidates for the judge manual link (judge+): exact email or " +
    "name prefix, capped at ten.",
  request: { params: friendGroupSlugParamSchema, query: deckCheckAccountSearchSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckAccountSearchResponseSchema } },
      description: "Matching accounts",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const regenerateSubmissionToken = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/checks/{eventId}/submission-token",
  tags: ["Deck Check"],
  security: cookieAuth,
  description:
    "Mints a fresh submission token (admin+, ADR-026), invalidating the old " +
    "link. Self-submission must be enabled.",
  request: { params: deckCheckEventParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckEventSummaryResponseSchema } },
      description: "The event with its new token",
    },
    ...errorResponses(401, 403, 404, 409),
  },
});

const listKeys = createRoute({
  method: "get",
  path: "/friend-groups/{slug}/deck-check-keys",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: friendGroupSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckKeysResponseSchema } },
      description: "The group's push keys (hashes only)",
    },
    ...errorResponses(401, 403, 404),
  },
});

const mintKey = createRoute({
  method: "post",
  path: "/friend-groups/{slug}/deck-check-keys",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: friendGroupSlugParamSchema,
    body: {
      content: { "application/json": { schema: mintDeckCheckKeySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: deckCheckKeyMintedResponseSchema } },
      description: "Minted; the plaintext token is returned exactly once",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const renameKey = createRoute({
  method: "patch",
  path: "/friend-groups/{slug}/deck-check-keys/{keyId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: deckCheckKeyParamSchema,
    body: {
      content: { "application/json": { schema: updateDeckCheckKeySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckKeyResponseSchema } },
      description: "Renamed",
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const revokeKey = createRoute({
  method: "delete",
  path: "/friend-groups/{slug}/deck-check-keys/{keyId}",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: { params: deckCheckKeyParamSchema },
  responses: {
    204: { description: "Revoked" },
    ...errorResponses(401, 403, 404),
  },
});

// ─── App ────────────────────────────────────────────────────────────────────

const deckCheckApp = createApiApp();
deckCheckApp.use("/friend-groups/*", requireAuth);

export const deckCheckRoute = deckCheckApp
  // ── EVENTS ──────────────────────────────────────────────────────────────
  .openapi(listEvents, async (c) => {
    const repos = c.get("repos");
    const ctx = await loadGroupForMember(repos, c.req.valid("param").slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const events = await repos.deckCheck.listEventsForGroup(ctx.group.id);
    return c.json({ items: events.map((event) => toEventSummary(event)) }, 200);
  })

  .openapi(createEvent, async (c) => {
    const repos = c.get("repos");
    const ctx = await loadGroupForMember(repos, c.req.valid("param").slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const body = c.req.valid("json");
    const event = await repos.deckCheck.createEvent({
      groupId: ctx.group.id,
      name: body.name,
      eventDate: body.eventDate ?? null,
      format: body.format ?? null,
      allowedSets: body.allowedSets ?? null,
    });
    return c.json(toEventSummary(event), 201);
  })

  .openapi(getEventDetail, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    let entries = await repos.deckCheck.listEntriesForEvent(event.id);
    // Settle the deadline auto-submit (ADR-027): entries still editable once
    // the window closed become submissions as-is, stamped with the close time.
    if (!submissionWindowOpen(event) && entries.some((entry) => entry.state === "editable")) {
      for (const entry of entries) {
        await settleExpiredEditable(repos, event, entry);
      }
      entries = await repos.deckCheck.listEntriesForEvent(event.id);
    }
    const active = entries.filter((entry) => entry.state !== "withdrawn");
    const summary = toEventSummary({
      ...event,
      entryCount: active.length,
      checkedCount: active.filter((entry) => entry.state === "checked").length,
    });
    return c.json({ event: summary, entries: entries.map((entry) => toEntrySummary(entry)) }, 200);
  })

  .openapi(updateEvent, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const body = c.req.valid("json");
    // Only run the base update when a base field is present: a submission-only
    // patch (e.g. flipping the toggle) would otherwise produce an empty SET.
    const hasBaseField =
      body.name !== undefined ||
      body.eventDate !== undefined ||
      body.format !== undefined ||
      body.allowedSets !== undefined ||
      body.status !== undefined ||
      body.listLockMode !== undefined;
    let event = hasBaseField
      ? await repos.deckCheck.updateEvent(ctx.group.id, eventId, body)
      : await repos.deckCheck.getEvent(ctx.group.id, eventId);
    if (!event) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }
    if (body.allowSelfSubmission !== undefined || body.submissionsCloseAt !== undefined) {
      event =
        (await repos.deckCheck.updateEventSubmission(event.id, {
          ...(body.allowSelfSubmission === undefined
            ? {}
            : {
                allowSelfSubmission: body.allowSelfSubmission,
                // Enabling for the first time mints the shared capability; the
                // token survives a disable so re-enabling restores old links.
                ...(body.allowSelfSubmission && !event.submissionToken
                  ? { submissionToken: generateShareToken() }
                  : {}),
              }),
          ...(body.submissionsCloseAt === undefined
            ? {}
            : {
                submissionsCloseAt: body.submissionsCloseAt
                  ? new Date(body.submissionsCloseAt)
                  : null,
              }),
        })) ?? event;
    }
    return c.json(toEventSummary(event), 200);
  })

  .openapi(deleteEvent, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const deleted = await repos.deckCheck.deleteEvent(ctx.group.id, eventId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }
    return c.body(null, 204);
  })

  .openapi(reResolveEvent, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);

    const unresolved = await repos.deckCheck.listUnresolvedCardsForEvent(event.id);
    const resolutions = await repos.deckCheck.resolveCards(
      unresolved.map((card) => ({ name: card.rawName })),
    );
    let updatedLines = 0;
    for (const card of unresolved) {
      const resolution = resolutions.get(cardResolutionKey(card.rawName));
      if (!resolution || resolution.matchStatus === card.matchStatus) {
        continue;
      }
      await repos.deckCheck.updateCardResolution(card.id, resolution);
      updatedLines += 1;
    }
    return c.json({ updatedLines }, 200);
  })

  // ── ENTRIES ─────────────────────────────────────────────────────────────
  .openapi(createManualEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    if (event.status === "archived") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Event is archived; un-archive it before adding entrants",
      );
    }
    const created = await createManualDeckCheckEntry(repos, event.id, c.req.valid("json"));
    return c.json(await buildEntryDetail(repos, event, created), 201);
  })

  .openapi(getEntryDetail, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);
    return c.json(await buildEntryDetail(repos, event, entry), 200);
  })

  .openapi(setEntryState, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);

    const body = c.req.valid("json");
    const updated = await c.get("transact")((txRepos) =>
      applyJudgeTransition(txRepos, getUserId(c), entry, body),
    );
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(denyUnlockRequest, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);

    const updated = entry.unlockRequestedAt
      ? await repos.deckCheck.updateEntry(entry.id, { unlockRequestedAt: null })
      : entry;
    return c.json(await buildEntryDetail(repos, event, updated ?? entry), 200);
  })

  .openapi(updateEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    await loadEntry(repos, event, entryId);

    const body = c.req.valid("json");
    const updated = await repos.deckCheck.updateEntry(entryId, {
      ...(body.playerName === undefined ? {} : { playerName: body.playerName }),
      ...(body.playerEmail === undefined ? {} : { playerEmail: body.playerEmail }),
      ...(body.riotId === undefined ? {} : { riotId: body.riotId }),
      ...(body.playerMessage === undefined ? {} : { playerMessage: body.playerMessage }),
      ...(body.allowDeckPublishing === undefined
        ? {}
        : { allowDeckPublishing: body.allowDeckPublishing }),
      ...(body.allowNameSharing === undefined ? {} : { allowNameSharing: body.allowNameSharing }),
      ...(body.allowRiotIdSharing === undefined
        ? {}
        : { allowRiotIdSharing: body.allowRiotIdSharing }),
    });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(deleteEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const event = await loadEvent(repos, ctx.group.id, eventId);

    const deleted = await repos.deckCheck.deleteEntry(event.id, entryId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.body(null, 204);
  })

  .openapi(addCard, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);
    requireListVisible(entry);

    const body = c.req.valid("json");
    const zone = mapSectionToZone(body.section);
    if (!zone) {
      throw new AppError(
        422,
        ERROR_CODES.VALIDATION_ERROR,
        `Unknown deck section: ${body.section}`,
      );
    }
    const existing = await repos.deckCheck.listCardsForEntry(entry.id);
    const resolutions = await repos.deckCheck.resolveCards([{ name: body.name }]);
    const resolution = resolutions.get(cardResolutionKey(body.name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };
    await repos.deckCheck.addEntryCard(entry.id, {
      sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1,
      rawName: body.name,
      section: body.section,
      zone,
      quantity: body.quantity,
      ...resolution,
    });
    await recomputeEntryHash(repos, entry.id);
    const reloaded = await loadEntry(repos, event, entryId);
    return c.json(await buildEntryDetail(repos, event, reloaded), 200);
  })

  .openapi(renameCard, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId, cardId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);
    requireListVisible(entry);

    const { name, section, copies } = c.req.valid("json");
    const resolutions = await repos.deckCheck.resolveCards([{ name }]);
    const resolution = resolutions.get(cardResolutionKey(name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };

    let updated: boolean;
    if (section === undefined) {
      // No zone change: a plain name (typo) fix on the whole line.
      updated = await repos.deckCheck.updateCardName(entry.id, cardId, name, resolution);
    } else {
      const zone = mapSectionToZone(section);
      if (!zone) {
        throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, `Unknown deck section: ${section}`);
      }
      // Zone change: move all or some copies, splitting the line when fewer.
      updated = await repos.deckCheck.moveCardCopies(entry.id, cardId, {
        name,
        resolution,
        section,
        zone,
        copies,
      });
    }
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }
    await recomputeEntryHash(repos, entry.id);
    const reloaded = await loadEntry(repos, event, entryId);
    return c.json(await buildEntryDetail(repos, event, reloaded), 200);
  })

  .openapi(applyZoneFixes, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event, entryId);
    requireListVisible(entry);

    const { cardIds } = c.req.valid("json");
    // Re-derive the suggestions server-side: the client only names which cards
    // to move, never the destination, so a stale or forged id can't push a card
    // into an arbitrary zone — only a currently-suggested move is applied.
    const cards = await repos.deckCheck.listCardsForEntry(entry.id);
    const matchedIds = [
      ...new Set(
        cards.flatMap((card) =>
          card.matchStatus === "matched" && card.resolvedCardId ? [card.resolvedCardId] : [],
        ),
      ),
    ];
    const details = await repos.deckCheck.getCardDetails(matchedIds);
    const suggestionById = new Map(
      computeZoneSuggestions(cards, details).map((suggestion) => [suggestion.cardId, suggestion]),
    );

    let applied = 0;
    for (const cardId of new Set(cardIds)) {
      const suggestion = suggestionById.get(cardId);
      if (!suggestion) {
        continue;
      }
      await repos.deckCheck.updateCardZone(
        entry.id,
        cardId,
        suggestion.suggestedZone,
        suggestion.suggestedZone,
      );
      applied += 1;
    }
    if (applied > 0) {
      await recomputeEntryHash(repos, entry.id);
    }
    const reloaded = await loadEntry(repos, event, entryId);
    return c.json(await buildEntryDetail(repos, event, reloaded), 200);
  })

  .openapi(removeCardCopy, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId, cardId, copyIndex } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    requireListVisible(await loadEntry(repos, event, entryId));

    const removed = await repos.deckCheck.deleteEntryCardCopy(entryId, cardId, copyIndex);
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }
    await recomputeEntryHash(repos, entryId);
    return c.body(null, 204);
  })

  .openapi(tickCard, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId, cardId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    requireListVisible(await loadEntry(repos, event, entryId));

    const { copyIndex, found } = c.req.valid("json");
    const stored = await repos.deckCheck.setCardCopyFound(entryId, cardId, copyIndex, found);
    if (!stored) {
      // The card row was replaced by a re-import while the judge had the
      // entry open; the client refetches instead of erroring opaquely.
      throw new AppError(409, ERROR_CODES.CONFLICT, "Card list changed; reload the entry");
    }
    return c.body(null, 204);
  })

  // ── ACCOUNT LINKS AND SELF-SUBMISSION (ADR-026) ─────────────────────────
  .openapi(linkEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    await loadEntry(repos, event, entryId);

    const { userId } = c.req.valid("json");
    const account = await repos.deckCheck.getUserAccount(userId);
    if (!account) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Account not found");
    }
    const updated = await repos.deckCheck.linkEntry(entryId, userId);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(unlinkEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    await loadEntry(repos, event, entryId);

    const updated = await repos.deckCheck.unlinkEntry(entryId);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(searchAccounts, async (c) => {
    const repos = c.get("repos");
    const ctx = await loadGroupForMember(repos, c.req.valid("param").slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const items = await repos.deckCheck.listAccountsForLinkSearch(c.req.valid("query").q);
    return c.json({ items }, 200);
  })

  .openapi(regenerateSubmissionToken, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    if (!event.allowSelfSubmission) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Self-submission is not enabled");
    }
    const updated = await repos.deckCheck.updateEventSubmission(event.id, {
      submissionToken: generateShareToken(),
    });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
    }
    return c.json(toEventSummary(updated), 200);
  })

  // ── PUSH KEYS ───────────────────────────────────────────────────────────
  .openapi(listKeys, async (c) => {
    const repos = c.get("repos");
    const ctx = await loadGroupForMember(repos, c.req.valid("param").slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const keys = await repos.deckCheck.listKeysForGroup(ctx.group.id);
    return c.json({ items: keys.map((key) => toKey(key)) }, 200);
  })

  .openapi(mintKey, async (c) => {
    const repos = c.get("repos");
    const ctx = await loadGroupForMember(repos, c.req.valid("param").slug, getUserId(c));
    requireRole(ctx.membership, "admin");

    const token = `orpk_${randomBytes(24).toString("base64url")}`;
    const key = await repos.deckCheck.createKey({
      groupId: ctx.group.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      tokenPrefix: token.slice(0, 10),
      label: c.req.valid("json").label,
      createdBy: getUserId(c),
    });
    return c.json({ key: toKey(key), token }, 201);
  })

  .openapi(renameKey, async (c) => {
    const repos = c.get("repos");
    const { slug, keyId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const key = await repos.deckCheck.updateKeyLabel(
      ctx.group.id,
      keyId,
      c.req.valid("json").label,
    );
    if (!key) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
    return c.json(toKey(key), 200);
  })

  .openapi(revokeKey, async (c) => {
    const repos = c.get("repos");
    const { slug, keyId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const revoked = await repos.deckCheck.revokeKey(ctx.group.id, keyId);
    if (!revoked) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
    return c.body(null, 204);
  });
