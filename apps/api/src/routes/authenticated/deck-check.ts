// oxlint-disable-next-line import/no-nodejs-modules -- server-side key minting, never reaches the browser
import { createHash, randomBytes } from "node:crypto";

import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES, mapSectionToZone, validateDeck, WellKnown } from "@openrift/shared";
import type {
  CardType,
  DeckCheckEntryCardResponse,
  DeckCheckEntryDetailResponse,
  DeckCheckEntryResponse,
  DeckCheckEntrySummaryResponse,
  DeckCheckEventSummaryResponse,
  DeckCheckKeyResponse,
  DeckViolation,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import {
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
  createDeckCheckEventSchema,
  deckCheckCardCopyParamSchema,
  deckCheckEntryCardParamSchema,
  deckCheckEntryParamSchema,
  deckCheckEventParamSchema,
  deckCheckKeyParamSchema,
  deckCheckTickSchema,
  deckCheckVerdictSchema,
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
  DeckCheckEntryCard,
  DeckCheckEntrySummary,
  DeckCheckEvent,
  DeckCheckEventWithCounts,
  DeckCheckKey,
} from "../../repositories/deck-check.js";
import { recomputeEntryHash } from "../../services/deck-check-ingest.js";

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntrySummary(row: DeckCheckEntrySummary): DeckCheckEntrySummaryResponse {
  return {
    id: row.id,
    externalId: row.externalId,
    playerName: row.playerName,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    checkStatus: row.checkStatus,
    checkedByName: row.checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    changedSinceCheck: row.changeSummary !== null,
    withdrawn: row.withdrawnAt !== null,
    copyCount: row.copyCount,
    verifiedCopyCount: row.verifiedCopyCount,
    unmatchedLineCount: row.unmatchedLineCount,
  };
}

function toEntry(row: DeckCheckEntry, checkedByName: string | null): DeckCheckEntryResponse {
  return {
    id: row.id,
    externalId: row.externalId,
    playerName: row.playerName,
    playerEmail: row.playerEmail,
    playerHandle: row.playerHandle,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    checkStatus: row.checkStatus,
    checkedBy: row.checkedBy,
    checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    notes: row.notes,
    changeSummary: row.changeSummary,
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntryCard(row: DeckCheckEntryCard): DeckCheckEntryCardResponse {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    rawName: row.rawName,
    section: row.section,
    zone: row.zone as DeckZone,
    quantity: row.quantity,
    matchStatus: row.matchStatus,
    foundCopies: Array.from({ length: row.quantity }, (_copy, index) =>
      Boolean(row.foundCopies[index]),
    ),
    resolvedCardId: row.resolvedCardId,
    resolvedPrintingId: row.resolvedPrintingId,
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
  const [cards, enumRows, checkedByName] = await Promise.all([
    repos.deckCheck.listCardsForEntry(entry.id),
    repos.enums.all(),
    entry.checkedBy ? repos.deckCheck.getUserName(entry.checkedBy) : Promise.resolve(null),
  ]);

  const matchedIds = [
    ...new Set(
      cards.flatMap((card) =>
        card.matchStatus === "matched" && card.resolvedCardId ? [card.resolvedCardId] : [],
      ),
    ),
  ];
  const [details, setSlugsByCard] = await Promise.all([
    repos.deckCheck.getCardDetails(matchedIds),
    event.allowedSets && event.allowedSets.length > 0
      ? repos.deckCheck.getCardSetSlugs(matchedIds)
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const violations: DeckViolation[] = [];

  if (event.format) {
    const deckCards = cards.flatMap((card) => {
      const detail = card.resolvedCardId ? details.get(card.resolvedCardId) : undefined;
      if (!detail) {
        return [];
      }
      return [
        {
          cardId: detail.id,
          zone: card.zone as DeckZone,
          quantity: card.quantity,
          cardName: detail.name,
          cardType: detail.type as CardType,
          superTypes: detail.superTypes as SuperType[],
          domains: detail.domains as Domain[],
          tags: detail.tags,
          customTagSlugs: [],
          keywords: detail.keywords,
        },
      ];
    });
    violations.push(...validateDeck({ format: event.format, cards: deckCards }));
  }

  if (event.allowedSets && event.allowedSets.length > 0) {
    const allowed = new Set(event.allowedSets.map((setId) => setId.toLowerCase()));
    for (const card of cards) {
      if (!card.resolvedCardId || card.matchStatus !== "matched") {
        continue;
      }
      const cardSets = setSlugsByCard.get(card.resolvedCardId) ?? [];
      if (!cardSets.some((setId) => allowed.has(setId.toLowerCase()))) {
        violations.push({
          zone: "deck",
          code: "out-of-allowed-sets",
          message: `${card.rawName} is not from an allowed set`,
          cardId: card.resolvedCardId,
        });
      }
    }
  }

  const excludedTypes = new Set<string>([
    WellKnown.cardType.LEGEND,
    WellKnown.cardType.RUNE,
    WellKnown.cardType.BATTLEFIELD,
  ]);
  const countedZones = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

  const typeCountMap = new Map<string, number>();
  const domainCountMap = new Map<string, number>();
  for (const card of cards) {
    const detail = card.resolvedCardId ? details.get(card.resolvedCardId) : undefined;
    if (!detail || !countedZones.has(card.zone)) {
      continue;
    }
    if (!excludedTypes.has(detail.type)) {
      typeCountMap.set(detail.type, (typeCountMap.get(detail.type) ?? 0) + card.quantity);
    }
    for (const domain of detail.domains) {
      domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
    }
  }

  return {
    event: toEventSummary(event),
    entry: toEntry(entry, checkedByName),
    cards: cards.map((card) => toEntryCard(card)),
    violations,
    typeCounts: enumRows.cardTypes
      .map((row) => row.slug)
      .filter((type) => typeCountMap.has(type))
      .map((type) => ({ cardType: type as CardType, count: typeCountMap.get(type) ?? 0 })),
    domainDistribution: enumRows.domains
      .map((row) => row.slug)
      .filter((domain) => domainCountMap.has(domain))
      .map((domain) => ({ domain: domain as Domain, count: domainCountMap.get(domain) ?? 0 })),
  };
}

async function loadEvent(repos: Repos, groupId: string, eventId: string): Promise<DeckCheckEvent> {
  const event = await repos.deckCheck.getEvent(groupId, eventId);
  if (!event) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
  }
  return event;
}

async function loadEntry(repos: Repos, eventId: string, entryId: string): Promise<DeckCheckEntry> {
  const entry = await repos.deckCheck.getEntry(eventId, entryId);
  if (!entry) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
  }
  return entry;
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

const setVerdict = createRoute({
  method: "put",
  path: "/friend-groups/{slug}/checks/{eventId}/entries/{entryId}/verdict",
  tags: ["Deck Check"],
  security: cookieAuth,
  request: {
    params: deckCheckEntryParamSchema,
    body: {
      content: { "application/json": { schema: deckCheckVerdictSchema } },
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
    "On-site repair: corrects a card line's name (typo fix) and re-resolves it " +
    "against the catalog (judge+). Zone, quantity, and found ticks stay.",
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
    const entries = await repos.deckCheck.listEntriesForEvent(event.id);
    const active = entries.filter((entry) => entry.withdrawnAt === null);
    const summary = toEventSummary({
      ...event,
      entryCount: active.length,
      checkedCount: active.filter((entry) => entry.checkStatus === "checked").length,
    });
    return c.json({ event: summary, entries: entries.map((entry) => toEntrySummary(entry)) }, 200);
  })

  .openapi(updateEvent, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "admin");
    const event = await repos.deckCheck.updateEvent(ctx.group.id, eventId, c.req.valid("json"));
    if (!event) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Event not found");
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
  .openapi(getEntryDetail, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event.id, entryId);
    return c.json(await buildEntryDetail(repos, event, entry), 200);
  })

  .openapi(setVerdict, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event.id, entryId);

    const { checkStatus, notes } = c.req.valid("json");
    const updated = await repos.deckCheck.updateEntry(entry.id, {
      checkStatus,
      ...(notes === undefined ? {} : { notes }),
      ...(checkStatus === "unchecked"
        ? { checkedBy: null, checkedAt: null }
        : // A fresh verdict supersedes the "changed since check" banner.
          { checkedBy: getUserId(c), checkedAt: new Date(), changeSummary: null }),
    });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(updateEntry, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    await loadEntry(repos, event.id, entryId);

    const body = c.req.valid("json");
    const updated = await repos.deckCheck.updateEntry(entryId, {
      ...(body.playerName === undefined ? {} : { playerName: body.playerName }),
      ...(body.playerEmail === undefined ? {} : { playerEmail: body.playerEmail }),
      ...(body.playerHandle === undefined ? {} : { playerHandle: body.playerHandle }),
    });
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Entry not found");
    }
    return c.json(await buildEntryDetail(repos, event, updated), 200);
  })

  .openapi(addCard, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event.id, entryId);

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
    const reloaded = await loadEntry(repos, event.id, entryId);
    return c.json(await buildEntryDetail(repos, event, reloaded), 200);
  })

  .openapi(renameCard, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId, cardId } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    const entry = await loadEntry(repos, event.id, entryId);

    const { name } = c.req.valid("json");
    const resolutions = await repos.deckCheck.resolveCards([{ name }]);
    const resolution = resolutions.get(cardResolutionKey(name)) ?? {
      resolvedCardId: null,
      resolvedPrintingId: null,
      matchStatus: "unmatched" as const,
    };
    const updated = await repos.deckCheck.updateCardName(entry.id, cardId, name, resolution);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
    }
    await recomputeEntryHash(repos, entry.id);
    const reloaded = await loadEntry(repos, event.id, entryId);
    return c.json(await buildEntryDetail(repos, event, reloaded), 200);
  })

  .openapi(removeCardCopy, async (c) => {
    const repos = c.get("repos");
    const { slug, eventId, entryId, cardId, copyIndex } = c.req.valid("param");
    const ctx = await loadGroupForMember(repos, slug, getUserId(c));
    requireRole(ctx.membership, "judge");
    const event = await loadEvent(repos, ctx.group.id, eventId);
    await loadEntry(repos, event.id, entryId);

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
    await loadEntry(repos, event.id, entryId);

    const { copyIndex, found } = c.req.valid("json");
    const stored = await repos.deckCheck.setCardCopyFound(entryId, cardId, copyIndex, found);
    if (!stored) {
      // The card row was replaced by a re-import while the judge had the
      // entry open; the client refetches instead of erroring opaquely.
      throw new AppError(409, ERROR_CODES.CONFLICT, "Card list changed; reload the entry");
    }
    return c.body(null, 204);
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
