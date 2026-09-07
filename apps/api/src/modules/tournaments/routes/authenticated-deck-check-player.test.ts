import { parsePiltoverDeckCode } from "@openrift/shared/deck-code";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import type { Variables } from "../../../types.js";
import { deckCheckPlayerRouter } from "./authenticated-deck-check-player.js";

// Covers the module-level helpers in deck-check-player.ts through the router
// surface, and thereby the deck-check-player *service* helpers those handlers
// call (buildPlayerLines / linesFromDeckCode / resolvePlayerCardRows), which
// are only reachable this way — services/deck-check-player.test.ts covers
// claimParticipantByToken alone.

vi.mock("@openrift/shared/deck-code", async (importOriginal) => ({
  ...(await importOriginal()),
  parsePiltoverDeckCode: vi.fn(() => ({
    entries: [],
    warnings: ["Invalid Piltover Archive deck code."],
  })),
}));

const mockParsePiltoverDeckCode = vi.mocked(parsePiltoverDeckCode);

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const TOURNAMENT_ID = "b0000000-0001-4000-a000-000000000001";
const ENTRY_ID = "c0000000-0001-4000-a000-000000000001";
const TOKEN = "submission-token-abc";

const now = new Date("2026-06-01T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

// oxlint-disable-next-line typescript/no-explicit-any -- fixture kept loose; the repos double below is cast past `Repos` like services/deck-check-player.test.ts does
function entryRow(overrides: Record<string, any> = {}) {
  return {
    id: ENTRY_ID,
    tournamentId: TOURNAMENT_ID,
    participantId: "participant-1",
    externalId: `openrift:${USER_ID}`,
    submittedAt: null,
    allowDeckPublishing: true,
    allowNameSharing: true,
    allowRiotIdSharing: true,
    contentHash: "hash-0",
    state: "editable",
    reviewOutcome: null,
    checkedBy: null,
    checkedAt: null,
    approvedBy: null,
    approvedAt: null,
    unlockRequestedAt: null,
    preEditLines: null,
    notes: null,
    changeSummary: null,
    withdrawnAt: null,
    playerMessage: null,
    createdAt: now,
    updatedAt: now,
    playerName: "Player One",
    riotId: null,
    claimedUserId: USER_ID,
    claimSource: "self_submit",
    claimedAt: now,
    claimBlockedAt: null,
    claimToken: null,
    ...overrides,
  };
}

// oxlint-disable-next-line typescript/no-explicit-any -- see entryRow
function playerRow(overrides: Record<string, any> = {}) {
  return {
    ...entryRow(),
    eventName: "Summoner Skirmish",
    eventDate: null,
    eventStatus: "active",
    submissionsCloseAt: null,
    groupName: "Noxus Locals",
    groupSlug: "noxus-locals",
    ...overrides,
  };
}

// oxlint-disable-next-line typescript/no-explicit-any -- see entryRow
function deckEvent(overrides: Record<string, any> = {}) {
  return {
    id: TOURNAMENT_ID,
    groupId: null,
    name: "Summoner Skirmish",
    eventDate: null,
    format: null,
    playMode: "1v1",
    allowedSets: null,
    status: "active",
    listLockMode: "manual",
    allowSelfSubmission: true,
    submissionToken: TOKEN,
    submissionsCloseAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// oxlint-disable-next-line typescript/no-explicit-any -- see entryRow
function cardRow(overrides: Record<string, any> = {}) {
  return {
    id: "stored-card-1",
    entryId: ENTRY_ID,
    sortOrder: 0,
    rawName: "Garen, Might of Demacia",
    section: "main",
    zone: "main",
    quantity: 2,
    resolvedCardId: null,
    resolvedPrintingId: null,
    matchStatus: "unmatched" as const,
    foundCopies: [],
    ...overrides,
  };
}

/**
 * Builds a `vi.fn` typed to resolve `T` (widened past whatever the default
 * value's literal type would otherwise pin it to), so a later
 * `.mockResolvedValue(...)` / `.mockImplementation(...)` in a test can hand it
 * any realistic fixture without fighting inference.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- generic repo-method stub; call sites narrow via the fixture they pass in
function stub<T = any>(defaultValue: T) {
  return vi.fn((..._args: any[]): Promise<T> => Promise.resolve(defaultValue));
}

/**
 * A repos double covering every method the player router (and the services it
 * delegates to) can call, all defaulting to "nothing found" / "no-op" so a test
 * only has to override what it cares about.
 */
function makeRepos() {
  const deckCheck = {
    getEntryForPlayer: stub<any>(undefined),
    getEntryForPlayerByTournament: stub<any>(undefined),
    getEventById: stub<any>(undefined),
    getEventBySubmissionToken: stub<any>(undefined),
    getLinkedEntryForUser: stub<any>(undefined),
    getEntryForUpdate: stub<any>(undefined),
    getEntryByExternalId: stub<any>(undefined),
    getUserAccount: stub<any>(undefined),
    listCardsForEntry: stub([] as unknown[]),
    replaceEntryCards: stub<any>(undefined),
    updateEntry: stub<any>(undefined),
    createEntry: stub<any>(undefined),
    canonicalPrintingByCard: stub(new Map()),
    getCardsByShortCodes: stub(new Map()),
    getCardDetails: stub(new Map()),
    getCardSetSlugs: stub(new Map()),
    findEntryIdByParticipant: stub<any>(null),
  };
  const tournaments = {
    findParticipantByUser: stub<any>(undefined),
    resolveOrCreateParticipant: stub({ id: "participant-new" }),
    findParticipantByClaimToken: stub<any>(undefined),
    linkParticipantByClaimTokenIfUnclaimed: stub<any>(undefined),
  };
  const decks = {
    getByIdForUser: stub<any>(undefined),
    cardsWithDetails: stub([] as unknown[]),
  };
  const enums = { all: stub({ cardTypes: [] as unknown[], domains: [] as unknown[] }) };
  const catalog = {
    championIdentifierTags: stub([] as string[]),
    cards: stub([] as unknown[]),
    printingCodes: stub([] as unknown[]),
    nameAliases: stub([] as unknown[]),
    catalogContentVersion: stub("catalog-v1"),
  };
  const cardBans = { listActiveForCards: stub([] as unknown[]) };
  return { deckCheck, tournaments, decks, enums, catalog, cardBans };
}

function makeApp(repos: ReturnType<typeof makeRepos>) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID } as never);
    c.set("repos", repos as never);
    c.set("transact", (async (fn: (r: typeof repos) => unknown) => fn(repos)) as never);
    await next();
  });
  registerRouterForTest(app, deckCheckPlayerRouter);
  return app;
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`http://test/api/v1/deck-check${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /deck-check/mine/tournament/{tournamentId} (getMine)", () => {
  it("reports canUnlock, not canRequestUnlock, for a submitted at_deadline entry", async () => {
    // TR 401.3: at_deadline is the lenient mode — a submitted entry
    // can still self-unlock while the window is open, so no judge request is
    // needed. canUnlock and canRequestUnlock must never both be true.
    const { res, body } = await runGetMine(
      playerRow({ state: "submitted", unlockRequestedAt: null }),
      deckEvent({ listLockMode: "at_deadline" }),
    );
    expect(res.status).toBe(200);
    expect(body.entry.canUnlock).toBe(true);
    expect(body.entry.canRequestUnlock).toBe(false);
  });

  it("reports canRequestUnlock, not canUnlock, for a submitted on_submit entry", async () => {
    // TR 401.3: on_submit is the strict mode — submitting was the delivery, so
    // the player can only file a judge-gated unlock request.
    const { res, body } = await runGetMine(
      playerRow({ state: "submitted", unlockRequestedAt: null }),
      deckEvent({ listLockMode: "on_submit" }),
    );
    expect(res.status).toBe(200);
    expect(body.entry.canUnlock).toBe(false);
    expect(body.entry.canRequestUnlock).toBe(true);
  });

  it("reports canRequestUnlock for an approved entry with no pending request", async () => {
    const { res, body } = await runGetMine(
      playerRow({ state: "approved", unlockRequestedAt: null }),
      deckEvent(),
    );
    expect(res.status).toBe(200);
    expect(body.entry.canRequestUnlock).toBe(true);
    expect(body.entry.unlockRequested).toBe(false);
  });

  it("suppresses canRequestUnlock once a request is already pending", async () => {
    const { res, body } = await runGetMine(
      playerRow({ state: "approved", unlockRequestedAt: now }),
      deckEvent(),
    );
    expect(res.status).toBe(200);
    expect(body.entry.canRequestUnlock).toBe(false);
    expect(body.entry.unlockRequested).toBe(true);
  });

  it("closes every self-service action once submissions are closed", async () => {
    const { res, body } = await runGetMine(
      playerRow({ state: "submitted", unlockRequestedAt: null }),
      deckEvent({ status: "archived", listLockMode: "at_deadline" }),
    );
    expect(res.status).toBe(200);
    expect(body.entry.windowOpen).toBe(false);
    expect(body.entry.canEdit).toBe(false);
    expect(body.entry.canUnlock).toBe(false);
    expect(body.entry.canRequestUnlock).toBe(false);
  });

  it("auto-submits an editable entry once the window has closed, and reports the settled state", async () => {
    // The lazy deadline settle (settleExpiredEditable): an entry still
    // "editable" once submissionsCloseAt has passed auto-submits as-is. A
    // reader must see the settled state, not the stale "editable" row.
    const repos = makeRepos();
    const row = playerRow({ state: "editable", submissionsCloseAt: PAST });
    const event = deckEvent({ submissionsCloseAt: PAST });
    repos.deckCheck.getEntryForPlayerByTournament.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(event);
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("GET", `/mine/tournament/${TOURNAMENT_ID}`));
    const body = (await res.json()) as { entry: { state: string; windowOpen: boolean } };

    expect(res.status).toBe(200);
    expect(body.entry.state).toBe("submitted");
    expect(body.entry.windowOpen).toBe(false);
    expect(repos.deckCheck.updateEntry).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ state: "submitted", submittedAt: PAST }),
    );
  });

  it("404s without leaking existence when the caller has no entry in the tournament", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayerByTournament.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(req("GET", `/mine/tournament/${TOURNAMENT_ID}`));
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Entry not found");
  });

  async function runGetMine(row: unknown, event: unknown) {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayerByTournament.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(event);
    const res = await makeApp(repos).fetch(req("GET", `/mine/tournament/${TOURNAMENT_ID}`));
    // oxlint-disable-next-line typescript/no-explicit-any -- response shape asserted field by field per test
    const body = (await res.json()) as any;
    return { res, body };
  }
});

describe("PUT /deck-check/mine/{entryId}/list (editList)", () => {
  it("previews a card-list submission without writing anything (dry run)", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Garen, Might of Demacia", quantity: 3, section: "main" }],
        dryRun: true,
      }),
    );
    const body = (await res.json()) as {
      entryId: string | null;
      tournamentId: string;
      cards: { id: string; quantity: number; foundCopies: boolean[]; matchStatus: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.entryId).toBeNull();
    expect(body.tournamentId).toBe(TOURNAMENT_ID);
    // toPreviewCards: synthetic "preview-<sortOrder>" id, all-false found ticks
    // sized to quantity, since nothing is persisted yet.
    expect(body.cards).toEqual([
      {
        id: "preview-0",
        sortOrder: 0,
        rawName: "Garen, Might of Demacia",
        section: "main",
        zone: "main",
        quantity: 3,
        matchStatus: "unmatched",
        foundCopies: [false, false, false],
        resolvedCardId: null,
        resolvedPrintingId: null,
      },
    ]);
    expect(repos.deckCheck.updateEntry).not.toHaveBeenCalled();
    expect(repos.deckCheck.replaceEntryCards).not.toHaveBeenCalled();
  });

  it("keeps duplicate rows for the same card name as separate lines, not merged", async () => {
    // Pins current behavior: resolvePlayerCardRows never dedupes/aggregates by
    // name — a card split across two zones (or listed twice by mistake) stays
    // two distinct card-line rows, each with its own sortOrder.
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [
          { name: "Fizz, The Tidal Trickster", quantity: 2, section: "main" },
          { name: "Fizz, The Tidal Trickster", quantity: 1, section: "sideboard" },
        ],
        dryRun: true,
      }),
    );
    const body = (await res.json()) as {
      cards: { sortOrder: number; zone: string; quantity: number }[];
    };

    expect(res.status).toBe(200);
    expect(body.cards).toHaveLength(2);
    expect(body.cards[0]).toMatchObject({ sortOrder: 0, zone: "main", quantity: 2 });
    expect(body.cards[1]).toMatchObject({ sortOrder: 1, zone: "sideboard", quantity: 1 });
  });

  it("resolves to an empty preview when a deck's only cards sit in the overflow zone", async () => {
    const repos = makeRepos();
    const deckId = "d0000000-0001-4000-a000-000000000001";
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.decks.getByIdForUser.mockResolvedValue({ id: deckId });
    repos.decks.cardsWithDetails.mockResolvedValue([
      { cardName: "Bench Warmer", zone: "overflow", quantity: 4 },
    ]);

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckId, dryRun: true }),
    );
    const body = (await res.json()) as { cards: unknown[]; violations: unknown[] };

    expect(res.status).toBe(200);
    expect(body.cards).toEqual([]);
    expect(body.violations).toEqual([]);
  });

  it("409s once submissions have closed, even for an editable entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ status: "archived" }));

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe("Submissions closed. Contact a judge.");
  });

  it("409s with the withdrawn message for a withdrawn entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "withdrawn" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Your entry was withdrawn by the organizer. Contact a judge.");
  });

  it("409s with the locked message for a non-withdrawn, non-editable entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "approved" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Your deck is locked. Unlock it before editing.");
  });

  it("writes the replaced list and returns the persisted cards on a real (non-dry-run) edit", async () => {
    const repos = makeRepos();
    const row = entryRow({ state: "editable" });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEntryForUpdate.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );
    repos.deckCheck.listCardsForEntry.mockResolvedValue([
      cardRow({ rawName: "Card", section: "main", zone: "main", quantity: 1 }),
    ]);

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { entryId: string; cards: { rawName: string }[] };

    expect(res.status).toBe(200);
    expect(body.entryId).toBe(ENTRY_ID);
    expect(body.cards).toEqual([expect.objectContaining({ rawName: "Card" })]);
    expect(repos.deckCheck.replaceEntryCards).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.arrayContaining([expect.objectContaining({ rawName: "Card" })]),
    );
  });

  it("404s when the entry doesn't belong to (or doesn't exist for) the caller", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("deck-code decoding (linesFromDeckCode)", () => {
  it("422s with 'contains no cards' when the code decodes cleanly to nothing", async () => {
    // parsePiltoverDeckCode warns only when the code itself failed to decode;
    // a code that decodes to zero entries and zero warnings gets this message.
    mockParsePiltoverDeckCode.mockReturnValueOnce({ entries: [], warnings: [] });
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckCode: "EMPTYCODE", dryRun: true }),
    );
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("The deck code contains no cards");
  });

  it("422s with 'could not be read' when the code fails to decode at all", async () => {
    mockParsePiltoverDeckCode.mockReturnValueOnce({
      entries: [],
      warnings: ["Invalid Piltover Archive deck code."],
    });
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckCode: "garbage", dryRun: true }),
    );
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(422);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("The deck code could not be read");
  });

  it("preserves the parser's emission order: main deck, then sideboard, then champion last", async () => {
    // The rewritten linesFromDeckCode only maps parsePiltoverDeckCode's entries
    // — it must not reorder or re-group them by zone.
    mockParsePiltoverDeckCode.mockReturnValueOnce({
      entries: [
        { shortCode: "OGN-001", quantity: 2, sourceSlot: "mainDeck", rawFields: {} },
        { shortCode: "OGN-002", quantity: 1, sourceSlot: "sideboard", rawFields: {} },
        {
          shortCode: "OGN-003",
          quantity: 1,
          sourceSlot: "chosenChampion",
          explicitZone: "champion",
          rawFields: {},
        },
      ],
      warnings: [],
    });
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.deckCheck.getCardsByShortCodes.mockResolvedValue(
      new Map([
        ["OGN-001", { cardId: "card-main", name: "Main Card", types: ["unit"] }],
        ["OGN-002", { cardId: "card-side", name: "Side Card", types: ["unit"] }],
        ["OGN-003", { cardId: "card-champ", name: "Champion Card", types: ["unit"] }],
      ]),
    );

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckCode: "SOMECODE", dryRun: true }),
    );
    const body = (await res.json()) as {
      cards: { sortOrder: number; rawName: string; zone: string }[];
    };

    expect(res.status).toBe(200);
    expect(
      body.cards.map((c) => ({ sortOrder: c.sortOrder, rawName: c.rawName, zone: c.zone })),
    ).toEqual([
      { sortOrder: 0, rawName: "Main Card", zone: "main" },
      { sortOrder: 1, rawName: "Side Card", zone: "sideboard" },
      { sortOrder: 2, rawName: "Champion Card", zone: "champion" },
    ]);
  });

  it("falls back an unresolved short code to a MAIN-zone placeholder, even from the sideboard", async () => {
    // linesFromDeckCode's "not found" branch always returns
    // WellKnown.deckZone.MAIN — it does not consult entry.sourceSlot the way
    // the matched branch does via inferZone. A code referencing a short code
    // our catalog doesn't recognize silently reassigns it to main.
    mockParsePiltoverDeckCode.mockReturnValueOnce({
      entries: [{ shortCode: "UNKNOWN-999", quantity: 1, sourceSlot: "sideboard", rawFields: {} }],
      warnings: [],
    });
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    // getCardsByShortCodes defaults to an empty map: UNKNOWN-999 stays unresolved.

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckCode: "SOMECODE", dryRun: true }),
    );
    const body = (await res.json()) as {
      cards: { rawName: string; zone: string; matchStatus: string }[];
    };

    expect(res.status).toBe(200);
    expect(body.cards).toEqual([
      expect.objectContaining({ rawName: "UNKNOWN-999", zone: "main", matchStatus: "unmatched" }),
    ]);
  });

  it("blows up the whole response instead of dropping a non-positive-quantity entry", async () => {
    // parsePiltoverDeckCode's `quantity > 0` guard (packages/shared/src/deck-code.ts)
    // is applied only while consolidating mainDeck totals; sideboard entries are
    // pushed unconditionally. linesFromDeckCode itself applies no guard of its
    // own for any sourceSlot. This test mocks the parser to simulate that gap
    // directly (a real decode practically never produces it) and pins what the
    // API does with such an entry: it does NOT drop the line — it passes it
    // straight through to toPreviewCards, whose foundCopies is
    // `Array.from({length: quantity}, ...)` (harmless at 0, but silently clamps
    // a negative quantity to a 0-length array too). Either way the response
    // then fails oRPC's own output validation, since
    // deckCheckEntryCardResponseSchema requires
    // `quantity: z.number().int().positive()` — so a decoder that ever emitted
    // this shape wouldn't render a "0 copies" placeholder, it would 500 the
    // whole request.
    mockParsePiltoverDeckCode.mockReturnValueOnce({
      entries: [{ shortCode: "OGN-004", quantity: 0, sourceSlot: "sideboard", rawFields: {} }],
      warnings: [],
    });
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(entryRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(
      req("PUT", `/mine/${ENTRY_ID}/list`, { deckCode: "SOMECODE", dryRun: true }),
    );
    const body = (await res.json()) as { code: string; message: string };

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_SERVER_ERROR");
    expect(body.message).toBe("Output validation failed");
  });
});

describe("POST /deck-check/mine/{entryId}/submit", () => {
  it("submits an editable entry", async () => {
    const repos = makeRepos();
    const row = playerRow({ state: "editable" });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEntryForUpdate.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/submit`));
    const body = (await res.json()) as { entry: { state: string; submittedAt: string | null } };

    expect(res.status).toBe(200);
    expect(body.entry.state).toBe("submitted");
    expect(body.entry.submittedAt).not.toBeNull();
  });

  it("409s when the entry is not editable", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(playerRow({ state: "submitted" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/submit`));
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
    expect(body.message).toBe("Only an editable deck can be submitted");
    expect(repos.deckCheck.updateEntry).not.toHaveBeenCalled();
  });

  it("409s when submissions are closed, for an already-submitted entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(playerRow({ state: "submitted" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ status: "archived" }));

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/submit`));

    expect(res.status).toBe(409);
    expect(repos.deckCheck.updateEntry).not.toHaveBeenCalled();
  });

  it("answers 200 when the closed window auto-settled the entry on this very request", async () => {
    // withSettledEvent's lazy auto-settle (settleExpiredEditable) runs inside
    // loadOwnEntry, before this handler's own submissionWindowOpen check. So
    // hitting POST submit on a still-"editable" entry after the window closed
    // DOES write: the deck is auto-submitted, backdated to the close time.
    // Answering 409 there would contradict the write this request just caused
    // and send the player to a judge over a deck that is in fact submitted, so
    // the handler returns the settled entry instead.
    const repos = makeRepos();
    const row = playerRow({ state: "editable", submissionsCloseAt: PAST });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ submissionsCloseAt: PAST }));
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/submit`));
    const body = (await res.json()) as { entry: { state: string } };

    expect(res.status).toBe(200);
    expect(body.entry.state).toBe("submitted");
    expect(repos.deckCheck.updateEntry).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ state: "submitted" }),
    );
  });

  it("still 409s a closed window when the entry was already settled before this request", async () => {
    // The counterpart to the case above: nothing is written here, because the
    // entry is not editable, so there is no write for the rejection to
    // contradict. This is the genuine conflict the 409 is for.
    const repos = makeRepos();
    const row = playerRow({ state: "submitted", submissionsCloseAt: PAST });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ submissionsCloseAt: PAST }));

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/submit`));
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Submissions closed. Contact a judge.");
    expect(repos.deckCheck.updateEntry).not.toHaveBeenCalled();
  });
});

describe("POST/DELETE /deck-check/mine/{entryId}/unlock", () => {
  it("self-unlocks a submitted entry in at_deadline mode, keeping the existing baseline", async () => {
    // `preEditLines` is a jsonb column typed as its parsed shape, so a read
    // hands back the stored array itself, never JSON text.
    const storedPreEditLines = [{ name: "Old Card", zone: "main", quantity: 1 }];
    const repos = makeRepos();
    const row = playerRow({ state: "submitted", preEditLines: storedPreEditLines });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEntryForUpdate.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ listLockMode: "at_deadline" }));
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { entry: { state: string; canEdit: boolean } };

    expect(res.status).toBe(200);
    expect(body.entry.state).toBe("editable");
    expect(body.entry.canEdit).toBe(true);
    // keepExistingBaseline: true means the stored baseline is kept and just
    // re-stringified, not rebuilt from the current cards.
    expect(repos.deckCheck.updateEntry).toHaveBeenCalledWith(
      ENTRY_ID,
      expect.objectContaining({ preEditLines: storedPreEditLines }),
    );
  });

  it("files a judge-gated unlock request for a submitted entry in on_submit mode", async () => {
    const repos = makeRepos();
    const row = playerRow({ state: "submitted", unlockRequestedAt: null });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent({ listLockMode: "on_submit" }));
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { entry: { state: string; unlockRequested: boolean } };

    expect(res.status).toBe(200);
    // Judge-gated: the entry stays "submitted", only the request flag flips.
    expect(body.entry.state).toBe("submitted");
    expect(body.entry.unlockRequested).toBe(true);
  });

  it("files an unlock request for an approved entry", async () => {
    const repos = makeRepos();
    const row = playerRow({ state: "approved", unlockRequestedAt: null });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { entry: { unlockRequested: boolean } };

    expect(res.status).toBe(200);
    expect(body.entry.unlockRequested).toBe(true);
  });

  it("409s an already-editable entry with its own message", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(playerRow({ state: "editable" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Your deck is already editable");
  });

  it("409s a checked entry, directing the player to a judge", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(playerRow({ state: "checked" }));
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(req("POST", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Contact a judge to unlock this deck");
  });

  it("clears a pending unlock request on cancel", async () => {
    const repos = makeRepos();
    const row = playerRow({ state: "approved", unlockRequestedAt: now });
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(row);
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...row, ...patch }),
    );

    const res = await makeApp(repos).fetch(req("DELETE", `/mine/${ENTRY_ID}/unlock`));
    const body = (await res.json()) as { entry: { unlockRequested: boolean } };

    expect(res.status).toBe(200);
    expect(body.entry.unlockRequested).toBe(false);
    expect(repos.deckCheck.updateEntry).toHaveBeenCalledWith(ENTRY_ID, { unlockRequestedAt: null });
  });

  it("no-ops cancel when nothing is pending, without writing", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEntryForPlayer.mockResolvedValue(
      playerRow({ state: "approved", unlockRequestedAt: null }),
    );
    repos.deckCheck.getEventById.mockResolvedValue(deckEvent());

    const res = await makeApp(repos).fetch(req("DELETE", `/mine/${ENTRY_ID}/unlock`));

    expect(res.status).toBe(200);
    expect(repos.deckCheck.updateEntry).not.toHaveBeenCalled();
  });
});

describe("GET /deck-check/submissions/{token} (submissionPage)", () => {
  it("404s an unknown token", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(req("GET", `/submissions/${TOKEN}`));
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Submission link not found");
  });

  it("403s a non-participant when self-registration is closed", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ allowSelfSubmission: false, groupName: "Noxus Locals" }),
    );
    repos.tournaments.findParticipantByUser.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(req("GET", `/submissions/${TOKEN}`));
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(body.message).toContain("Self-registration is closed");
  });

  it("reports linkedEntry: null when the caller has no linked entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(req("GET", `/submissions/${TOKEN}`));
    const body = (await res.json()) as { linkedEntry: unknown };

    expect(res.status).toBe(200);
    expect(body.linkedEntry).toBeNull();
  });

  it("displays a closed-window editable entry as 'submitted' and disallows replace", async () => {
    // A linked entry still "editable" once the window has closed hasn't been
    // settled yet (that only happens when the entry itself is loaded); the
    // submission page compensates by presenting it as submitted so the player
    // isn't told they can still edit.
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ status: "archived", groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(entryRow({ state: "editable" }));

    const res = await makeApp(repos).fetch(req("GET", `/submissions/${TOKEN}`));
    const body = (await res.json()) as {
      submissionsOpen: boolean;
      linkedEntry: { state: string; canReplace: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.submissionsOpen).toBe(false);
    expect(body.linkedEntry.state).toBe("submitted");
    expect(body.linkedEntry.canReplace).toBe(false);
  });
});

describe("POST /deck-check/submissions/{token} (submitToToken / persistSubmission)", () => {
  it("creates a fresh self-submitted entry when the caller has nothing linked yet", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(undefined);
    repos.deckCheck.getEntryByExternalId.mockResolvedValue(undefined);
    repos.deckCheck.getUserAccount.mockResolvedValue({
      id: USER_ID,
      name: "Player One",
      email: "player@example.com",
      riotId: null,
    });
    const created = entryRow({ state: "submitted" });
    repos.deckCheck.createEntry.mockResolvedValue(created);
    repos.deckCheck.listCardsForEntry.mockResolvedValue([cardRow()]);

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { entryId: string };

    expect(res.status).toBe(200);
    expect(body.entryId).toBe(ENTRY_ID);
    expect(repos.tournaments.resolveOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: TOURNAMENT_ID,
        userId: USER_ID,
        status: "requested",
      }),
    );
    expect(repos.deckCheck.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: `openrift:${USER_ID}`, state: "submitted" }),
    );
  });

  it("replaces and resubmits a linked editable entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    const linked = entryRow({ state: "editable" });
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(linked);
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...linked, ...patch }),
    );
    repos.deckCheck.listCardsForEntry.mockResolvedValue([cardRow()]);

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { entryId: string };

    expect(res.status).toBe(200);
    expect(body.entryId).toBe(ENTRY_ID);
    expect(repos.deckCheck.replaceEntryCards).toHaveBeenCalled();
    expect(repos.deckCheck.createEntry).not.toHaveBeenCalled();
    // applyPlayerList then submitEntryList: the final state must be "submitted".
    expect(repos.deckCheck.updateEntry).toHaveBeenLastCalledWith(
      ENTRY_ID,
      expect.objectContaining({ state: "submitted" }),
    );
  });

  it("replaces and resubmits a linked submitted entry in at_deadline mode (self-service replace)", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals", listLockMode: "at_deadline" }),
    );
    const linked = entryRow({ state: "submitted" });
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(linked);
    repos.deckCheck.updateEntry.mockImplementation((_id: string, patch: Record<string, unknown>) =>
      Promise.resolve({ ...linked, ...patch }),
    );
    repos.deckCheck.listCardsForEntry.mockResolvedValue([cardRow()]);

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );

    expect(res.status).toBe(200);
    expect(repos.deckCheck.replaceEntryCards).toHaveBeenCalled();
  });

  it("409s replacing a withdrawn linked entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(entryRow({ state: "withdrawn" }));

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("Your entry was withdrawn by the organizer. Contact a judge.");
  });

  it("409s replacing an already-reviewed (approved/checked) linked entry", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(entryRow({ state: "checked" }));

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe(
      "Your deck was already reviewed by a judge. Ask for it to be unlocked from your deck page.",
    );
  });

  it("409s replacing a submitted linked entry in on_submit mode", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals", listLockMode: "on_submit" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(entryRow({ state: "submitted" }));

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe(
      "Your deck is already submitted. Ask for it to be unlocked from your deck page.",
    );
  });

  it("409s a stranger whose previous self-submitted entry a judge detached", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(undefined);
    repos.deckCheck.getEntryByExternalId.mockResolvedValue(entryRow({ claimedUserId: null }));

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    expect(body.message).toBe("A judge detached your previous submission. Contact a judge.");
    expect(repos.deckCheck.createEntry).not.toHaveBeenCalled();
  });

  it("404s when the account backing the session no longer exists", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(undefined);
    repos.deckCheck.getEntryByExternalId.mockResolvedValue(undefined);
    repos.deckCheck.getUserAccount.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Account not found");
  });

  it("409s a real submission once the window is closed, with its own message", async () => {
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals", status: "archived" }),
    );
    repos.deckCheck.getLinkedEntryForUser.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
      }),
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(409);
    // Distinct wording from editList's "Submissions closed. Contact a judge." —
    // pinned so the two don't silently drift onto the same copy or vice versa.
    expect(body.message).toBe("Submissions are closed");
  });

  it("dry-runs even when the window is closed, since a preview never writes", async () => {
    // dryRun is checked before the submissionWindowOpen guard in submitToToken,
    // unlike every other mutation on this router.
    const repos = makeRepos();
    repos.deckCheck.getEventBySubmissionToken.mockResolvedValue(
      deckEvent({ groupName: "Noxus Locals", status: "archived" }),
    );

    const res = await makeApp(repos).fetch(
      req("POST", `/submissions/${TOKEN}`, {
        cards: [{ name: "Card", quantity: 1, section: "main" }],
        dryRun: true,
      }),
    );

    expect(res.status).toBe(200);
  });
});

describe("POST /deck-check/claim/{token}", () => {
  it("404s an unknown claim token", async () => {
    const repos = makeRepos();
    repos.tournaments.findParticipantByClaimToken.mockResolvedValue(undefined);

    const res = await makeApp(repos).fetch(req("POST", `/claim/${TOKEN}`));
    const body = (await res.json()) as { message: string; code: string };

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Claim link not found");
  });

  it("returns the claim outcome for a token the caller already holds", async () => {
    const repos = makeRepos();
    repos.tournaments.findParticipantByClaimToken.mockResolvedValue({
      id: "spot-1",
      tournamentId: TOURNAMENT_ID,
      userId: USER_ID,
      claimBlockedAt: null,
    });
    repos.deckCheck.findEntryIdByParticipant.mockResolvedValue(ENTRY_ID);

    const res = await makeApp(repos).fetch(req("POST", `/claim/${TOKEN}`));
    const body = (await res.json()) as { status: string; tournamentId: string; entryId: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "already", tournamentId: TOURNAMENT_ID, entryId: ENTRY_ID });
  });
});
