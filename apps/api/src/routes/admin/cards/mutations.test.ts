import { appendSetTotal, fixTypography } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptFavoritePrintingsForCard } from "../../../services/accept-favorite-printings.js";
import { acceptFavoriteNewCard } from "../../../services/accept-gallery.js";
import {
  acceptPrinting,
  deletePrinting,
  updatePrintingMarkers,
} from "../../../services/printing-admin.js";
import { registerRouterForTest } from "../../../test/mount-router.js";
import type { Variables } from "../../../types.js";
import { adminCardMutationsRouter } from "./mutations";

vi.mock("../../../services/printing-admin.js", () => ({
  acceptPrinting: vi.fn(),
  deletePrinting: vi.fn(),
  updatePrintingMarkers: vi.fn(),
  updatePrintingDistributionChannels: vi.fn(),
}));

vi.mock("../../../services/accept-gallery.js", () => ({ acceptFavoriteNewCard: vi.fn() }));
vi.mock("../../../services/accept-favorite-printings.js", () => ({
  acceptFavoritePrintingsForCard: vi.fn(),
}));

vi.mock("@openrift/shared", async (importOriginal) => ({
  ...(await importOriginal()),
  fixTypography: vi.fn((text: string) => text),
  appendSetTotal: vi.fn((code: string) => code),
}));

const mockDeletePrinting = vi.mocked(deletePrinting);
const mockUpdatePrintingMarkers = vi.mocked(updatePrintingMarkers);
const mockAcceptPrinting = vi.mocked(acceptPrinting);
const mockAcceptFavoriteNewCard = vi.mocked(acceptFavoriteNewCard);
const mockAcceptFavoritePrintingsForCard = vi.mocked(acceptFavoritePrintingsForCard);
const mockFixTypography = vi.mocked(fixTypography);
const mockAppendSetTotal = vi.mocked(appendSetTotal);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockMut = {
  checkCandidateCard: vi.fn(),
  uncheckCandidateCard: vi.fn(),
  checkAllCandidatePrintings: vi.fn(),
  checkCandidatePrinting: vi.fn(),
  uncheckCandidatePrinting: vi.fn(),
  getCardById: vi.fn(),
  getCardAliases: vi.fn(),
  checkAllCandidateCards: vi.fn(),
  patchCandidatePrinting: vi.fn(),
  deleteCandidatePrinting: vi.fn(),
  getCandidatePrintingById: vi.fn(),
  getPrintingDifferentiatorsById: vi.fn(),
  copyCandidatePrinting: vi.fn(),
  linkCandidatePrintings: vi.fn(),
  upsertPrintingLinkOverrides: vi.fn(),
  removePrintingLinkOverrides: vi.fn(),
  renameCardSlugById: vi.fn(),
  checkByProvider: vi.fn(),
  deleteByProvider: vi.fn(),
  upsertCardErrata: vi.fn(),
  deleteCardErrata: vi.fn(),
  getPrintingTextsForCardId: vi.fn(),
  updateCardById: vi.fn(),
  replaceCardDomainsById: vi.fn(),
  replaceCardSuperTypesById: vi.fn(),
  getFullPrintingById: vi.fn(),
  getFullCardById: vi.fn(),
  getErrataByCardIds: vi.fn(async () => []),
  updatePrintingFieldById: vi.fn(),
  recomputeKeywordsForPrintingCard: vi.fn(),
  getSetPrintedTotalForPrinting: vi.fn(),
};

// Audit event sink (record-admin-event.ts); handlers write here best-effort.
const mockAdminEvents = { insert: vi.fn() };

const mockTrxMut = {
  acceptNewCardFromSources: vi.fn(),
  createNameAliases: vi.fn(),
};

const mockImportErrata = vi.fn();
const mockIngestCandidates = vi.fn();
const mockIo = { fetch: vi.fn() };
const mockTransact = vi.fn(
  async (
    cb: (repos: {
      candidateMutations: typeof mockTrxMut;
      printingImages: object;
    }) => Promise<unknown>,
  ) => cb({ candidateMutations: mockTrxMut, printingImages: {} }),
);
const mockSets = { getBySlug: vi.fn() };
const mockRefreshCardAggregates = vi.fn();
const mockCandidateCards = {};

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// AppErrors are bridged to ORPCErrors, so the error body is `{ message, code }`.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  // requireAdmin isn't mounted here; emulate the access it would resolve for
  // a full admin (handlers read it for card-review provider scoping).
  c.set("adminAccess", { isAdmin: true, sections: [] });
  c.set("io", mockIo as never);
  c.set("transact", mockTransact as never);
  c.set("repos", {
    candidateMutations: mockMut,
    adminEvents: mockAdminEvents,
    candidateCards: mockCandidateCards,
    printingImages: {},
    markers: { listBySlugs: vi.fn(async () => []), setForPrinting: vi.fn() },
    providerSettings: { favoriteProviders: vi.fn().mockResolvedValue(new Set(["gallery"])) },
    catalog: { refreshCardAggregates: mockRefreshCardAggregates },
    sets: mockSets,
    distributionChannels: { listBySlugs: vi.fn(async () => []), setForPrinting: vi.fn() },
    printingEvents: { recordNewPrinting: vi.fn(), recordPrintingChange: vi.fn() },
    rarities: {
      listAll: vi
        .fn()
        .mockResolvedValue([{ slug: "common" }, { slug: "uncommon" }, { slug: "rare" }]),
    },
    keywords: { listCostKeywords: vi.fn().mockResolvedValue(["Equip", "Repeat"]) },
  } as never);
  c.set("services", {
    importErrata: mockImportErrata,
    ingestCandidates: mockIngestCandidates,
  } as never);
  await next();
});
registerRouterForTest(app, adminCardMutationsRouter);

const CARD_ID = "00000000-0000-4000-a000-000000000010";
const CP_ID = "00000000-0000-4000-a000-000000000011";
const CARD_ID2 = "00000000-0000-4000-a000-000000000012";
const PRINTING_ID = "00000000-0000-4000-a000-000000000013";

describe("POST /cards/:candidateCardId/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.checkCandidateCard.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/check`, { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.checkCandidateCard).toHaveBeenCalledWith(CARD_ID);
  });

  it("returns 404 when candidate card not found", async () => {
    mockMut.checkCandidateCard.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/check`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.checkCandidateCard.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/check`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /cards/:candidateCardId/uncheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.uncheckCandidateCard.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/uncheck`, { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.uncheckCandidateCard).toHaveBeenCalledWith(CARD_ID);
  });

  it("returns 404 when candidate card not found", async () => {
    mockMut.uncheckCandidateCard.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/uncheck`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /cards/candidate-printings/check-all", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with updated count", async () => {
    mockMut.checkAllCandidatePrintings.mockResolvedValue(5);

    const res = await app.request("/api/admin/v1/cards/candidate-printings/check-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "p-1", extraIds: ["e-1", "e-2"] }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ updated: 5 });
    expect(mockMut.checkAllCandidatePrintings).toHaveBeenCalledWith("p-1", ["e-1", "e-2"]);
  });

  it("works without optional fields", async () => {
    mockMut.checkAllCandidatePrintings.mockResolvedValue(0);

    const res = await app.request("/api/admin/v1/cards/candidate-printings/check-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ updated: 0 });
  });
});

describe("POST /cards/candidate-printings/:id/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.checkCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/check`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(mockMut.checkCandidatePrinting).toHaveBeenCalledWith(CP_ID);
  });

  it("returns 404 when not found", async () => {
    mockMut.checkCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/check`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /cards/candidate-printings/:id/uncheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.uncheckCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/uncheck`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(mockMut.uncheckCandidatePrinting).toHaveBeenCalledWith(CP_ID);
  });

  it("returns 404 when not found", async () => {
    mockMut.uncheckCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/uncheck`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /cards/:cardId/check-all", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with updated count", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });
    mockMut.getCardAliases.mockResolvedValue([{ normName: "fire-dragon-alt" }]);
    mockMut.checkAllCandidateCards.mockResolvedValue(3);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/check-all`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ updated: 3 });
    expect(mockMut.checkAllCandidateCards).toHaveBeenCalledWith(
      expect.arrayContaining(["fire-dragon-alt"]),
      "card-uuid",
    );
  });

  it("returns 404 when card not found", async () => {
    mockMut.getCardById.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/check-all`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("deduplicates normalized name variants", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });
    mockMut.getCardAliases.mockResolvedValue([]);
    mockMut.checkAllCandidateCards.mockResolvedValue(1);

    await app.request(`/api/admin/v1/cards/${CARD_ID2}/check-all`, { method: "POST" });
    const callArgs = mockMut.checkAllCandidateCards.mock.calls[0];
    const uniqueVariants = new Set(callArgs[0]);
    expect(uniqueVariants.size).toBe(callArgs[0].length);
  });
});

describe("PATCH /cards/candidate-printings/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful patch", async () => {
    mockMut.patchCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artVariant: "alternate", finish: "foil" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.patchCandidatePrinting).toHaveBeenCalledWith(CP_ID, {
      artVariant: "alternate",
      finish: "foil",
    });
  });

  it("returns 400 when no valid fields provided", async () => {
    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("No valid fields");
  });

  it("returns 404 when candidate printing not found", async () => {
    mockMut.patchCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rarity: "rare" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /cards/candidate-printings/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.deleteCandidatePrinting.mockResolvedValue({ numDeletedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockMut.deleteCandidatePrinting).toHaveBeenCalledWith(CP_ID);
  });

  it("returns 404 when not found", async () => {
    mockMut.deleteCandidatePrinting.mockResolvedValue({ numDeletedRows: 0n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /cards/candidate-printings/:id/copy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful copy", async () => {
    const candidatePrinting = { id: "cp-1", name: "Fire Dragon" };
    const targetPrinting = { id: "p-2", slug: "p-2" };
    mockMut.getCandidatePrintingById.mockResolvedValue(candidatePrinting);
    mockMut.getPrintingDifferentiatorsById.mockResolvedValue(targetPrinting);
    mockMut.copyCandidatePrinting.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "p-2" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.copyCandidatePrinting).toHaveBeenCalledWith(candidatePrinting, targetPrinting);
  });

  it("returns 400 when printingId is empty", async () => {
    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when candidate printing not found", async () => {
    mockMut.getCandidatePrintingById.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "p-2" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("Candidate printing not found");
  });

  it("returns 404 when target printing not found", async () => {
    mockMut.getCandidatePrintingById.mockResolvedValue({ id: "cp-1" });
    mockMut.getPrintingDifferentiatorsById.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "unknown" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("Target printing not found");
  });
});

describe("POST /cards/candidate-printings/link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and upserts link overrides when linking", async () => {
    mockMut.linkCandidatePrintings.mockResolvedValue(undefined);
    mockMut.upsertPrintingLinkOverrides.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/cards/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidatePrintingIds: ["cp-1", "cp-2"], printingId: "p-1" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.linkCandidatePrintings).toHaveBeenCalledWith(["cp-1", "cp-2"], "p-1");
    expect(mockMut.upsertPrintingLinkOverrides).toHaveBeenCalledWith(["cp-1", "cp-2"], "p-1");
  });

  it("removes link overrides when unlinking (printingId is null)", async () => {
    mockMut.linkCandidatePrintings.mockResolvedValue(undefined);
    mockMut.removePrintingLinkOverrides.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/cards/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidatePrintingIds: ["cp-1"], printingId: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.removePrintingLinkOverrides).toHaveBeenCalledWith(["cp-1"]);
  });

  it("returns 400 when candidatePrintingIds is empty", async () => {
    const res = await app.request("/api/admin/v1/cards/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidatePrintingIds: [], printingId: "p-1" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("candidatePrintingIds[] required");
  });
});

describe("POST /cards/:cardId/rename", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful rename", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });
    mockMut.renameCardSlugById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "flame-drake" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.renameCardSlugById).toHaveBeenCalledWith("card-uuid", "flame-drake");
  });

  it("returns 204 without renaming when newId matches current slug", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "fire-dragon" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.renameCardSlugById).not.toHaveBeenCalled();
  });

  it("returns 404 when card not found", async () => {
    mockMut.getCardById.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "flame-drake" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when newId is empty", async () => {
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "  " }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("newId is required");
  });
});

describe("DELETE /cards/printing/:printingId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockDeletePrinting.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockDeletePrinting).toHaveBeenCalledWith(
      mockTransact,
      mockIo,
      expect.objectContaining({ candidateMutations: mockMut }),
      PRINTING_ID,
    );
  });
});

describe("POST /cards/by-provider/:provider/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with check result", async () => {
    mockMut.checkByProvider.mockResolvedValue({ cardsChecked: 10, printingsChecked: 20 });

    const res = await app.request("/api/admin/v1/cards/by-provider/tcgplayer/check", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ cardsChecked: 10, printingsChecked: 20 });
    expect(mockMut.checkByProvider).toHaveBeenCalledWith("tcgplayer", expect.any(Date));
  });

  it("returns 400 when provider is empty (decoded blank)", async () => {
    const res = await app.request("/api/admin/v1/cards/by-provider/%20/check", { method: "POST" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("Provider name is required");
  });
});

describe("DELETE /cards/by-provider/:provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with delete result", async () => {
    mockMut.deleteByProvider.mockResolvedValue(15);

    const res = await app.request("/api/admin/v1/cards/by-provider/tcgplayer", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ provider: "tcgplayer", deleted: 15 });
    expect(mockMut.deleteByProvider).toHaveBeenCalledWith("tcgplayer");
  });

  it("returns 400 when provider is empty (decoded blank)", async () => {
    const res = await app.request("/api/admin/v1/cards/by-provider/%20", { method: "DELETE" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("Provider name is required");
  });
});

describe("POST /cards/:cardId/errata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts errata and recomputes keywords (204)", async () => {
    mockMut.upsertCardErrata.mockResolvedValue(undefined);
    mockMut.getPrintingTextsForCardId.mockResolvedValue([]);
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/errata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correctedRulesText: "Deal 4 damage.",
        correctedEffectText: null,
        source: "official",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.upsertCardErrata).toHaveBeenCalledWith(
      CARD_ID2,
      expect.objectContaining({ correctedRulesText: "Deal 4 damage.", source: "official" }),
    );
    expect(mockMut.updateCardById).toHaveBeenCalledWith(
      CARD_ID2,
      expect.objectContaining({ keywords: expect.any(Array) }),
    );
  });
});

describe("DELETE /cards/:cardId/errata", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes errata and recomputes keywords (204)", async () => {
    mockMut.deleteCardErrata.mockResolvedValue(undefined);
    mockMut.getPrintingTextsForCardId.mockResolvedValue([]);
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/errata`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockMut.deleteCardErrata).toHaveBeenCalledWith(CARD_ID2);
    expect(mockMut.updateCardById).toHaveBeenCalledWith(
      CARD_ID2,
      expect.objectContaining({ keywords: expect.any(Array) }),
    );
  });
});

describe("POST /cards/errata/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports errata and returns the summary", async () => {
    const summary = {
      dryRun: true,
      newCount: 1,
      updatedCount: 0,
      unchangedCount: 0,
      matchesPrintedCount: 0,
      errors: [],
      newEntries: [{ cardSlug: "jinx-rebel", cardName: "Jinx, Rebel" }],
      updatedEntries: [],
      skippedMatchesPrinted: [],
    };
    mockImportErrata.mockResolvedValue(summary);

    const res = await app.request("/api/admin/v1/cards/errata/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dryRun: true,
        entries: [
          { cardSlug: "jinx-rebel", correctedRulesText: "Deal 4 damage.", source: "official" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(summary);
    expect(mockImportErrata).toHaveBeenCalledWith(
      mockTransact,
      expect.objectContaining({ dryRun: true }),
    );
  });

  it("rejects an empty entries array", async () => {
    const res = await app.request("/api/admin/v1/cards/errata/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false, entries: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /cards/:cardId/accept-field", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFixTypography.mockImplementation((text: string) => text);
    mockMut.getPrintingTextsForCardId.mockResolvedValue([]);
    mockMut.recomputeKeywordsForPrintingCard.mockResolvedValue(undefined);
  });

  it("returns 204 and updates card field", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "name", value: "Flame Drake" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith(CARD_ID2, { name: "Flame Drake" });
  });

  it("returns 400 when field is empty (not in the enum)", async () => {
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "", value: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when field is not in the writable-column enum", async () => {
    // The allowlist is the contract `field` enum, so an unknown field is
    // rejected by oRPC input validation (400) before the handler runs.
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "rulesText", value: "text" }),
    });
    expect(res.status).toBe(400);
  });

  it("normalizes null to empty array for superTypes (junction table)", async () => {
    mockMut.replaceCardSuperTypesById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "superTypes", value: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.replaceCardSuperTypesById).toHaveBeenCalledWith(CARD_ID2, []);
  });

  it("normalizes null to empty array for tags field", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "tags", value: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith(CARD_ID2, { tags: [] });
  });

  it("accepts might field with numeric value", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "might", value: 3 }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith(CARD_ID2, { might: 3 });
  });

  it("returns 400 (VALIDATION_ERROR) when a card field value fails the field rule", async () => {
    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "might", value: -5 }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.message).toContain("Invalid value for might");
  });
});

describe("POST /cards/printing/:printingId/accept-field", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFixTypography.mockImplementation((text: string) => text);
    mockAppendSetTotal.mockImplementation((code: string) => code);
    mockMut.recomputeKeywordsForPrintingCard.mockResolvedValue(undefined);
    mockMut.getFullPrintingById.mockResolvedValue({
      id: "OGS-001",
      cardId: "card-uuid",
      setId: "set-uuid",
      shortCode: "OGS-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      markerSlugs: [],
      finish: "normal",
      artist: "Original Artist",
      publicCode: "001",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      language: "EN",
      printedName: null,
      printedYear: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("returns 204 and updates printing field", async () => {
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "artist", value: "Alice" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith(PRINTING_ID, "artist", "Alice");
  });

  it("returns 400 when field is not in the writable-column enum", async () => {
    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "invalidField", value: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("delegates to updatePrintingMarkers when field is markerSlugs", async () => {
    mockUpdatePrintingMarkers.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "markerSlugs", value: ["promo"] }),
    });
    expect(res.status).toBe(204);
    expect(mockUpdatePrintingMarkers).toHaveBeenCalledWith(mockTransact, PRINTING_ID, ["promo"]);
    expect(mockMut.updatePrintingFieldById).not.toHaveBeenCalled();
  });

  it("applies fixTypography for printedRulesText from provider", async () => {
    mockFixTypography.mockReturnValue("Fixed text");
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "printedRulesText", value: "Raw text", source: "provider" }),
    });
    expect(res.status).toBe(204);
    expect(mockFixTypography).toHaveBeenCalledWith("Raw text", {
      costKeywords: ["Equip", "Repeat"],
    });
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith(
      PRINTING_ID,
      "printedRulesText",
      "Fixed text",
    );
  });

  it("calls appendSetTotal for publicCode from provider", async () => {
    mockAppendSetTotal.mockReturnValue("OGS-001/100");
    mockMut.getSetPrintedTotalForPrinting.mockResolvedValue({ printedTotal: 100 });
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "publicCode", value: "OGS-001", source: "provider" }),
    });
    expect(res.status).toBe(204);
    expect(mockAppendSetTotal).toHaveBeenCalledWith("OGS-001", 100);
  });

  it("resolves setId slug to UUID", async () => {
    mockSets.getBySlug.mockResolvedValue({ id: "set-uuid-1" });
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "setId", value: "origin-set" }),
    });
    expect(res.status).toBe(204);
    expect(mockSets.getBySlug).toHaveBeenCalledWith("origin-set");
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith(
      PRINTING_ID,
      "setId",
      "set-uuid-1",
    );
  });

  it("returns 404 when set slug not found", async () => {
    mockSets.getBySlug.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "setId", value: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("Set not found");
  });

  it("returns 400 (VALIDATION_ERROR) when a printing field value fails the field rule", async () => {
    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "rarity", value: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.message).toContain("Invalid value for rarity");
  });
});

describe("POST /cards/new/:name/accept", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) =>
      cb({ candidateMutations: mockTrxMut, printingImages: {} }),
    );
  });

  it("returns 204 on successful accept (name path param decoded)", async () => {
    mockTrxMut.acceptNewCardFromSources.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardFields: { id: "fire-dragon", name: "Fire Dragon", types: ["unit"], domains: ["fury"] },
      }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxMut.acceptNewCardFromSources).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fire-dragon", name: "Fire Dragon" }),
      "Fire Dragon",
    );
  });

  it("returns 400 when cardFields is missing", async () => {
    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /cards/new/:name/accept-favorites", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with accept result", async () => {
    const result = { cardSlug: "fire-dragon", printingsCreated: 3 };
    mockAcceptFavoriteNewCard.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/accept-favorites", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockAcceptFavoriteNewCard).toHaveBeenCalledWith(
      mockTransact,
      mockIo,
      expect.objectContaining({ candidateCards: mockCandidateCards, candidateMutations: mockMut }),
      "Fire Dragon",
      expect.any(Set),
    );
  });
});

describe("POST /cards/new/:name/link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) =>
      cb({ candidateMutations: mockTrxMut, printingImages: {} }),
    );
  });

  it("returns 204 on successful link", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });
    mockTrxMut.createNameAliases.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-uuid" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxMut.createNameAliases).toHaveBeenCalledWith("Fire Dragon", "card-uuid");
  });

  it("returns 400 when cardId is empty", async () => {
    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain("cardId required");
  });

  it("returns 404 when target card not found", async () => {
    mockMut.getCardById.mockResolvedValue(null);

    const res = await app.request("/api/admin/v1/cards/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("Target card not found");
  });
});

describe("POST /cards/:cardId/accept-printing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with printingId", async () => {
    mockAcceptPrinting.mockResolvedValue("printing-uuid");

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-printing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingFields: { shortCode: "FD", artist: "Alice", publicCode: "OGS-001" },
        candidatePrintingIds: ["cp-1", "cp-2"],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ printingId: "printing-uuid" });
    expect(mockAcceptPrinting).toHaveBeenCalledWith(
      mockTransact,
      expect.objectContaining({ candidateMutations: mockMut }),
      CARD_ID2,
      expect.objectContaining({ shortCode: "FD" }),
      ["cp-1", "cp-2"],
      mockIo,
    );
  });
});

describe("POST /cards/:cardSlug/accept-favorite-printings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the accept result", async () => {
    const result = { printingsCreated: 2, skipped: [{ shortCode: "OGN-202", reason: "exists" }] };
    mockAcceptFavoritePrintingsForCard.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/cards/fire-dragon/accept-favorite-printings", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockAcceptFavoritePrintingsForCard).toHaveBeenCalledWith(
      mockTransact,
      mockIo,
      expect.objectContaining({ candidateMutations: mockMut }),
      "fire-dragon",
      expect.any(Set),
    );
  });
});

describe("POST /cards/create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) =>
      cb({ candidateMutations: mockTrxMut, printingImages: {} }),
    );
  });

  it("creates a card and returns its slug", async () => {
    mockTrxMut.acceptNewCardFromSources.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/cards/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "fire-dragon",
        name: "Fire Dragon",
        types: ["unit"],
        domains: ["fury"],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ cardSlug: "fire-dragon" });
    expect(mockTrxMut.acceptNewCardFromSources).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fire-dragon" }),
      expect.any(String),
    );
  });

  it("rejects a body missing required card fields", async () => {
    const res = await app.request("/api/admin/v1/cards/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "fire-dragon" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /cards/:cardId/printings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a printing and returns its id", async () => {
    mockAcceptPrinting.mockResolvedValue("printing-uuid");

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/printings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shortCode: "FD",
        setId: "origin",
        artist: "Alice",
        publicCode: "OGS-001",
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ printingId: "printing-uuid" });
    expect(mockAcceptPrinting).toHaveBeenCalledWith(
      mockTransact,
      expect.objectContaining({ candidateMutations: mockMut }),
      CARD_ID2,
      expect.objectContaining({ shortCode: "FD", setId: "origin" }),
      [],
      mockIo,
    );
  });
});

describe("POST /cards/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the ingest summary (candidates transformed before the service)", async () => {
    const result = {
      provider: "test-provider",
      newCards: 5,
      removedCards: 0,
      updates: 2,
      unchanged: 3,
      newPrintings: 10,
      removedPrintings: 0,
      printingUpdates: 1,
      printingsUnchanged: 9,
      errors: [],
      newCardDetails: [{ name: "New Card", shortCode: "NC" }],
      removedCardDetails: [],
      updatedCards: [],
      newPrintingDetails: [],
      removedPrintingDetails: [],
      updatedPrintings: [],
    };
    mockIngestCandidates.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/cards/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "test-provider",
        candidates: [
          {
            card: { name: "New Card", external_id: "ext-1" },
            printings: [{ short_code: "NC-001", external_id: "p-ext-1" }],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe("test-provider");
    expect(json.newCards).toBe(5);
    // The `{ card, printings }` wrapper is flattened by the input transform into
    // the `IngestCard` shape the service expects.
    expect(mockIngestCandidates).toHaveBeenCalledWith(mockTransact, "test-provider", [
      expect.objectContaining({
        name: "New Card",
        external_id: "ext-1",
        printings: expect.any(Array),
      }),
    ]);
  });

  it("rejects an empty candidates array", async () => {
    const res = await app.request("/api/admin/v1/cards/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "x", candidates: [] }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Audit events (record-admin-event wiring)
// ---------------------------------------------------------------------------

describe("audit events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockTransact.mockImplementation(async (cb) =>
      cb({ candidateMutations: mockTrxMut, printingImages: {} }),
    );
  });

  it("accept-field on a card records old and new value", async () => {
    mockMut.getFullCardById.mockResolvedValue({
      id: CARD_ID2,
      name: "Flame Drake",
      slug: "flame-drake",
      energy: 2,
    });
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID2}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "energy", value: 4 }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        action: "card.accept-field",
        entityType: "card",
        entityId: CARD_ID2,
        entityLabel: "Flame Drake",
        cardSlug: "flame-drake",
        oldValues: { energy: 2 },
        newValues: { energy: 4 },
      }),
    );
  });

  it("accept-field on a printing records the prior value from printingBefore", async () => {
    mockMut.getFullPrintingById.mockResolvedValue({
      id: PRINTING_ID,
      cardId: CARD_ID2,
      shortCode: "OGN-001",
      artist: "Old Artist",
    });
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/printing/${PRINTING_ID}/accept-field`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "artist", value: "New Artist" }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "printing.accept-field",
        entityType: "printing",
        entityId: PRINTING_ID,
        entityLabel: "OGN-001",
        oldValues: { artist: "Old Artist" },
        newValues: { artist: "New Artist" },
      }),
    );
  });

  it("deleting a candidate printing records the deleted key fields", async () => {
    mockMut.getCandidatePrintingById.mockResolvedValue({
      id: CP_ID,
      shortCode: "OGN-002",
      setId: "ogn",
      rarity: "rare",
      finish: "foil",
      artVariant: "normal",
      externalId: "ext-2",
    });
    mockMut.deleteCandidatePrinting.mockResolvedValue({ numDeletedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "candidate-printing.delete",
        entityId: CP_ID,
        entityLabel: "OGN-002",
        oldValues: expect.objectContaining({ shortCode: "OGN-002", finish: "foil" }),
      }),
    );
  });

  it("renaming a card records the slug transition", async () => {
    mockMut.getCardById.mockResolvedValue({ id: CARD_ID, name: "Fireball", slug: "old-slug" });
    mockMut.renameCardSlugById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "new-slug" }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "card.rename",
        oldValues: { slug: "old-slug" },
        newValues: { slug: "new-slug" },
        cardSlug: "new-slug",
      }),
    );
  });

  it("check/uncheck bookkeeping writes NO audit event", async () => {
    mockMut.checkCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request(`/api/admin/v1/cards/candidate-printings/${CP_ID}/check`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).not.toHaveBeenCalled();
  });

  it("a failing audit insert does not fail the mutation", async () => {
    mockMut.getCardById.mockResolvedValue({ id: CARD_ID, name: "Fireball", slug: "old-slug" });
    mockMut.renameCardSlugById.mockResolvedValue(undefined);
    mockAdminEvents.insert.mockRejectedValue(new Error("audit table on fire"));

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "new-slug" }),
    });
    expect(res.status).toBe(204);
  });
});
