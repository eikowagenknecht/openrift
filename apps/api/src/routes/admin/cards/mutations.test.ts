import { appendSetTotal, fixTypography } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import { acceptFavoriteNewCard } from "../../../services/accept-gallery.js";
import {
  acceptPrinting,
  deletePrinting,
  updatePrintingPromoType,
} from "../../../services/printing-admin.js";
import { mutationsRoute } from "./mutations";

// ---------------------------------------------------------------------------
// Mock service modules — vitest hoists vi.mock() automatically
// ---------------------------------------------------------------------------

vi.mock("../../../services/printing-admin.js", () => ({
  acceptPrinting: vi.fn(),
  deletePrinting: vi.fn(),
  updatePrintingPromoType: vi.fn(),
}));

vi.mock("../../../services/accept-gallery.js", () => ({
  acceptFavoriteNewCard: vi.fn(),
}));

vi.mock("@openrift/shared", async (importOriginal) => ({
  ...(await importOriginal()),
  fixTypography: vi.fn((text: string) => text),
  appendSetTotal: vi.fn((code: string) => code),
}));

const mockAcceptPrinting = vi.mocked(acceptPrinting);
const mockDeletePrinting = vi.mocked(deletePrinting);
const mockUpdatePrintingPromoType = vi.mocked(updatePrintingPromoType);
const mockAcceptFavoriteNewCard = vi.mocked(acceptFavoriteNewCard);
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
  getCardBySlug: vi.fn(),
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
  updateCardBySlug: vi.fn(),
  updateCardById: vi.fn(),
  getCardTexts: vi.fn(),
  getCardTextsById: vi.fn(),
  updatePrintingFieldById: vi.fn(),
  recomputeKeywordsForPrintingCard: vi.fn(),
  getPrintingTextsForCardSlug: vi.fn(),
  getPrintingTextsForCardId: vi.fn(),
  upsertCardErrata: vi.fn(),
  deleteCardErrata: vi.fn(),
  getSetPrintedTotalForPrinting: vi.fn(),
  getCardIdBySlug: vi.fn(),
  acceptNewCardFromSources: vi.fn(),
  createNameAliases: vi.fn(),
  checkByProvider: vi.fn(),
  deleteByProvider: vi.fn(),
  replaceCardDomainsById: vi.fn(),
  replaceCardSuperTypesById: vi.fn(),
  getFullPrintingById: vi.fn(),
};

const mockCandidateCards = {};
const mockPrintingImages = {};
const mockPromoTypes = {};
const mockPrintingEvents = {
  recordNewPrinting: vi.fn(),
  recordPrintingChange: vi.fn(),
};
const mockSets = {
  getBySlug: vi.fn(),
};

const mockTrxMut = {
  acceptNewCardFromSources: vi.fn(),
  createNameAliases: vi.fn(),
};

const mockIngestCandidates = vi.fn();

const mockTransact = vi.fn(
  async (
    callback: (repos: {
      candidateMutations: typeof mockTrxMut;
      printingImages: object;
    }) => Promise<unknown>,
  ) => callback({ candidateMutations: mockTrxMut, printingImages: {} }),
);

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const mockIo = { fetch: vi.fn() };

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("io", mockIo as never);
    c.set("transact", mockTransact as never);
    c.set("repos", {
      candidateMutations: mockMut,
      candidateCards: mockCandidateCards,
      printingImages: mockPrintingImages,
      promoTypes: mockPromoTypes,
      printingEvents: mockPrintingEvents,
      providerSettings: { favoriteProviders: vi.fn().mockResolvedValue(new Set(["gallery"])) },
      sets: mockSets,
    } as never);
    c.set("services", {
      ingestCandidates: mockIngestCandidates,
    } as never);
    await next();
  })
  .route("/api/v1", mutationsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/:candidateCardId/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.checkCandidateCard.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request("/api/v1/cc-1/check", { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.checkCandidateCard).toHaveBeenCalledWith("cc-1");
  });

  it("returns 404 when candidate card not found", async () => {
    mockMut.checkCandidateCard.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request("/api/v1/cc-1/check", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.checkCandidateCard.mockResolvedValue(null);

    const res = await app.request("/api/v1/cc-1/check", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/:candidateCardId/uncheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.uncheckCandidateCard.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request("/api/v1/cc-1/uncheck", { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.uncheckCandidateCard).toHaveBeenCalledWith("cc-1");
  });

  it("returns 404 when candidate card not found", async () => {
    mockMut.uncheckCandidateCard.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request("/api/v1/cc-1/uncheck", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.uncheckCandidateCard.mockResolvedValue(null);

    const res = await app.request("/api/v1/cc-1/uncheck", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/candidate-printings/check-all", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with updated count", async () => {
    mockMut.checkAllCandidatePrintings.mockResolvedValue(5);

    const res = await app.request("/api/v1/candidate-printings/check-all", {
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

    const res = await app.request("/api/v1/candidate-printings/check-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ updated: 0 });
  });
});

describe("POST /api/v1/candidate-printings/:id/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.checkCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request("/api/v1/candidate-printings/cp-1/check", { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.checkCandidatePrinting).toHaveBeenCalledWith("cp-1");
  });

  it("returns 404 when not found", async () => {
    mockMut.checkCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request("/api/v1/candidate-printings/unknown/check", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/candidate-printings/:id/uncheck", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.uncheckCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request("/api/v1/candidate-printings/cp-1/uncheck", { method: "POST" });
    expect(res.status).toBe(204);
    expect(mockMut.uncheckCandidatePrinting).toHaveBeenCalledWith("cp-1");
  });

  it("returns 404 when not found", async () => {
    mockMut.uncheckCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request("/api/v1/candidate-printings/unknown/uncheck", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.uncheckCandidatePrinting.mockResolvedValue(null);

    const res = await app.request("/api/v1/candidate-printings/unknown/uncheck", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/:cardId/check-all", () => {
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

    const res = await app.request("/api/v1/card-uuid/check-all", { method: "POST" });
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

    const res = await app.request("/api/v1/unknown-card/check-all", { method: "POST" });
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

    await app.request("/api/v1/card-uuid/check-all", { method: "POST" });
    const callArgs = mockMut.checkAllCandidateCards.mock.calls[0];
    const uniqueVariants = new Set(callArgs[0]);
    expect(uniqueVariants.size).toBe(callArgs[0].length);
  });
});

describe("PATCH /api/v1/candidate-printings/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful patch", async () => {
    mockMut.patchCandidatePrinting.mockResolvedValue({ numUpdatedRows: 1n });

    const res = await app.request("/api/v1/candidate-printings/cp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artVariant: "alternate", finish: "foil" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.patchCandidatePrinting).toHaveBeenCalledWith("cp-1", {
      artVariant: "alternate",
      finish: "foil",
    });
  });

  it("returns 400 when no valid fields provided", async () => {
    const res = await app.request("/api/v1/candidate-printings/cp-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("No valid fields");
  });

  it("returns 404 when candidate printing not found", async () => {
    mockMut.patchCandidatePrinting.mockResolvedValue({ numUpdatedRows: 0n });

    const res = await app.request("/api/v1/candidate-printings/unknown", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rarity: "Rare" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.patchCandidatePrinting.mockResolvedValue(null);

    const res = await app.request("/api/v1/candidate-printings/unknown", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSigned: true }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/candidate-printings/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on success", async () => {
    mockMut.deleteCandidatePrinting.mockResolvedValue({ numDeletedRows: 1n });

    const res = await app.request("/api/v1/candidate-printings/cp-1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockMut.deleteCandidatePrinting).toHaveBeenCalledWith("cp-1");
  });

  it("returns 404 when not found", async () => {
    mockMut.deleteCandidatePrinting.mockResolvedValue({ numDeletedRows: 0n });

    const res = await app.request("/api/v1/candidate-printings/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when result is null", async () => {
    mockMut.deleteCandidatePrinting.mockResolvedValue(null);

    const res = await app.request("/api/v1/candidate-printings/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/candidate-printings/:id/copy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful copy", async () => {
    const candidatePrinting = { id: "cp-1", name: "Fire Dragon" };
    const targetPrinting = { id: "p-2", slug: "p-2" };
    mockMut.getCandidatePrintingById.mockResolvedValue(candidatePrinting);
    mockMut.getPrintingDifferentiatorsById.mockResolvedValue(targetPrinting);
    mockMut.copyCandidatePrinting.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/candidate-printings/cp-1/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "p-2" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.copyCandidatePrinting).toHaveBeenCalledWith(candidatePrinting, targetPrinting);
  });

  it("returns 400 when printingId is empty", async () => {
    const res = await app.request("/api/v1/candidate-printings/cp-1/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when candidate printing not found", async () => {
    mockMut.getCandidatePrintingById.mockResolvedValue(null);

    const res = await app.request("/api/v1/candidate-printings/unknown/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "p-2" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Candidate printing not found");
  });

  it("returns 404 when target printing not found", async () => {
    mockMut.getCandidatePrintingById.mockResolvedValue({ id: "cp-1" });
    mockMut.getPrintingDifferentiatorsById.mockResolvedValue(null);

    const res = await app.request("/api/v1/candidate-printings/cp-1/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printingId: "unknown" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Target printing not found");
  });
});

describe("POST /api/v1/candidate-printings/link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 and upserts link overrides when linking", async () => {
    mockMut.linkCandidatePrintings.mockResolvedValue(undefined);
    mockMut.upsertPrintingLinkOverrides.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidatePrintingIds: ["cp-1", "cp-2"],
        printingId: "p-1",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.linkCandidatePrintings).toHaveBeenCalledWith(["cp-1", "cp-2"], "p-1");
    expect(mockMut.upsertPrintingLinkOverrides).toHaveBeenCalledWith(["cp-1", "cp-2"], "p-1");
  });

  it("removes link overrides when unlinking (printingId is null)", async () => {
    mockMut.linkCandidatePrintings.mockResolvedValue(undefined);
    mockMut.removePrintingLinkOverrides.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidatePrintingIds: ["cp-1"],
        printingId: null,
      }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.removePrintingLinkOverrides).toHaveBeenCalledWith(["cp-1"]);
  });

  it("returns 400 when candidatePrintingIds is empty", async () => {
    const res = await app.request("/api/v1/candidate-printings/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidatePrintingIds: [],
        printingId: "p-1",
      }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("candidatePrintingIds[] required");
  });
});

describe("POST /api/v1/:cardId/rename", () => {
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

    const res = await app.request("/api/v1/card-uuid/rename", {
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

    const res = await app.request("/api/v1/card-uuid/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "fire-dragon" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.renameCardSlugById).not.toHaveBeenCalled();
  });

  it("returns 404 when card not found", async () => {
    mockMut.getCardById.mockResolvedValue(null);

    const res = await app.request("/api/v1/unknown-uuid/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "flame-drake" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when newId is empty", async () => {
    const res = await app.request("/api/v1/card-uuid/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId: "  " }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("newId is required");
  });
});

describe("POST /api/v1/:cardId/accept-field", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFixTypography.mockImplementation((text: string) => text);
    mockMut.getPrintingTextsForCardId.mockResolvedValue([]);
    mockMut.recomputeKeywordsForPrintingCard.mockResolvedValue(undefined);
  });

  it("returns 204 and updates card field", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "name", value: "Flame Drake" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith("card-uuid", { name: "Flame Drake" });
  });

  it("returns 400 when field is not provided", async () => {
    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "", value: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when field is not allowed", async () => {
    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "notAllowed", value: "test" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid field");
  });

  it("normalizes null to empty array for superTypes (junction table)", async () => {
    mockMut.replaceCardSuperTypesById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "superTypes", value: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.replaceCardSuperTypesById).toHaveBeenCalledWith("card-uuid", []);
  });

  it("normalizes null to empty array for tags field", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "tags", value: null }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith("card-uuid", { tags: [] });
  });

  it("returns 400 when field is rulesText (removed from allowed fields)", async () => {
    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "rulesText", value: "text" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid field");
  });

  it("returns 400 when field is effectText (removed from allowed fields)", async () => {
    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "effectText", value: "text" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid field");
  });

  it("accepts might field with numeric value", async () => {
    mockMut.updateCardById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "might", value: 3 }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updateCardById).toHaveBeenCalledWith("card-uuid", { might: 3 });
  });

  it("returns 400 when card field value fails validation", async () => {
    const res = await app.request("/api/v1/card-uuid/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "might", value: -5 }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toContain("Invalid value for might");
  });
});

describe("POST /api/v1/printing/:printingId/accept-field", () => {
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
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      promoTypeId: null,
      finish: "normal",
      artist: "Original Artist",
      publicCode: "001",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      language: "EN",
      printedName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockMut.getCardById.mockResolvedValue({ id: "card-uuid", name: "Test Card", slug: "test" });
  });

  it("returns 204 and updates printing field", async () => {
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "artist", value: "Alice" }),
    });
    expect(res.status).toBe(204);
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith("OGS-001", "artist", "Alice");
  });

  it("returns 400 when field is not provided", async () => {
    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "", value: "test" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when field is not allowed", async () => {
    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "invalidField", value: "test" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid field");
  });

  it("delegates to updatePrintingPromoType when field is promoTypeId", async () => {
    mockUpdatePrintingPromoType.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "promoTypeId", value: "promo-type-1" }),
    });
    expect(res.status).toBe(204);
    expect(mockUpdatePrintingPromoType).toHaveBeenCalledWith(
      expect.objectContaining({ candidateMutations: mockMut }),
      "OGS-001",
      "promo-type-1",
    );
    expect(mockMut.updatePrintingFieldById).not.toHaveBeenCalled();
  });

  it("passes null to updatePrintingPromoType when value is empty string", async () => {
    mockUpdatePrintingPromoType.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "promoTypeId", value: "" }),
    });
    expect(res.status).toBe(204);
    expect(mockUpdatePrintingPromoType).toHaveBeenCalledWith(expect.anything(), "OGS-001", null);
  });

  it("applies fixTypography for printedRulesText from provider", async () => {
    mockFixTypography.mockReturnValue("Fixed text");
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: "printedRulesText",
        value: "Raw text",
        source: "provider",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockFixTypography).toHaveBeenCalledWith("Raw text");
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith(
      "OGS-001",
      "printedRulesText",
      "Fixed text",
    );
  });

  it("applies fixTypography with special options for flavorText from provider", async () => {
    mockFixTypography.mockReturnValue("Fixed flavor");
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: "flavorText",
        value: "Raw flavor",
        source: "provider",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockFixTypography).toHaveBeenCalledWith("Raw flavor", {
      italicParens: false,
      keywordGlyphs: false,
    });
  });

  it("calls appendSetTotal for publicCode from provider", async () => {
    mockAppendSetTotal.mockReturnValue("OGS-001/100");
    mockMut.getSetPrintedTotalForPrinting.mockResolvedValue({ printedTotal: 100 });
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: "publicCode",
        value: "OGS-001",
        source: "provider",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockAppendSetTotal).toHaveBeenCalledWith("OGS-001", 100);
  });

  it("resolves setId slug to UUID", async () => {
    mockSets.getBySlug.mockResolvedValue({ id: "set-uuid-1" });
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "setId", value: "origin-set" }),
    });
    expect(res.status).toBe(204);
    expect(mockSets.getBySlug).toHaveBeenCalledWith("origin-set");
    expect(mockMut.updatePrintingFieldById).toHaveBeenCalledWith("OGS-001", "setId", "set-uuid-1");
  });

  it("returns 404 when set slug not found", async () => {
    mockSets.getBySlug.mockResolvedValue(null);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "setId", value: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Set not found");
  });

  it("normalizes rarity case", async () => {
    mockMut.updatePrintingFieldById.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "rarity", value: "common" }),
    });
    expect(res.status).toBe(204);
  });

  it("returns 400 when printing field value fails validation", async () => {
    const res = await app.request("/api/v1/printing/OGS-001/accept-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "rarity", value: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.error).toContain("Invalid value for rarity");
  });
});

describe("DELETE /api/v1/printing/:printingId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockDeletePrinting.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/printing/OGS-001", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockDeletePrinting).toHaveBeenCalledWith(
      mockTransact,
      mockIo,
      expect.objectContaining({ candidateMutations: mockMut }),
      "OGS-001",
    );
  });
});

describe("POST /api/v1/new/:name/accept", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful accept", async () => {
    mockTrxMut.acceptNewCardFromSources.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/new/Fire%20Dragon/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardFields: {
          id: "fire-dragon",
          name: "Fire Dragon",
          type: "Unit",
          domains: ["Fury"],
        },
      }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxMut.acceptNewCardFromSources).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fire-dragon", name: "Fire Dragon" }),
      "Fire Dragon",
    );
  });

  it("returns 400 when cardFields is missing", async () => {
    const res = await app.request("/api/v1/new/Fire%20Dragon/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/new/:name/accept-favorites", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with accept result", async () => {
    const result = { cardSlug: "fire-dragon", printingsCreated: 3 };
    mockAcceptFavoriteNewCard.mockResolvedValue(result);

    const res = await app.request("/api/v1/new/Fire%20Dragon/accept-favorites", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockAcceptFavoriteNewCard).toHaveBeenCalledWith(
      mockTransact,
      mockIo,
      expect.objectContaining({
        candidateCards: mockCandidateCards,
        candidateMutations: mockMut,
      }),
      "Fire Dragon",
      expect.any(Set),
    );
  });
});

describe("POST /api/v1/new/:name/link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful link", async () => {
    mockMut.getCardById.mockResolvedValue({
      id: "card-uuid",
      name: "Fire Dragon",
      slug: "fire-dragon",
    });
    mockTrxMut.createNameAliases.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-uuid" }),
    });
    expect(res.status).toBe(204);
    expect(mockTrxMut.createNameAliases).toHaveBeenCalledWith("Fire Dragon", "card-uuid");
  });

  it("returns 400 when cardId is missing", async () => {
    const res = await app.request("/api/v1/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("cardId required");
  });

  it("returns 404 when target card not found", async () => {
    mockMut.getCardById.mockResolvedValue(null);

    const res = await app.request("/api/v1/new/Fire%20Dragon/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("Target card not found");
  });
});

describe("POST /api/v1/:cardId/accept-printing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with printingId", async () => {
    mockAcceptPrinting.mockResolvedValue("printing-uuid");

    const res = await app.request("/api/v1/card-uuid/accept-printing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingFields: {
          shortCode: "FD",
          artist: "Alice",
          publicCode: "OGS-001",
        },
        candidatePrintingIds: ["cp-1", "cp-2"],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ printingId: "printing-uuid" });
    expect(mockAcceptPrinting).toHaveBeenCalledWith(
      mockTransact,
      expect.objectContaining({ candidateMutations: mockMut }),
      "card-uuid",
      expect.objectContaining({ shortCode: "FD" }),
      ["cp-1", "cp-2"],
    );
  });
});

describe("POST /api/v1/upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with upload result", async () => {
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

    const res = await app.request("/api/v1/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "test-provider",
        candidates: [
          {
            card: {
              name: "New Card",
              external_id: "ext-1",
            },
            printings: [
              {
                short_code: "NC-001",
                external_id: "p-ext-1",
              },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe("test-provider");
    expect(json.newCards).toBe(5);
    expect(mockIngestCandidates).toHaveBeenCalledWith(
      mockTransact,
      "test-provider",
      expect.any(Array),
    );
  });
});

describe("POST /api/v1/by-provider/:provider/check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with check result", async () => {
    mockMut.checkByProvider.mockResolvedValue({
      cardsChecked: 10,
      printingsChecked: 20,
    });

    const res = await app.request("/api/v1/by-provider/tcgplayer/check", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ cardsChecked: 10, printingsChecked: 20 });
    expect(mockMut.checkByProvider).toHaveBeenCalledWith("tcgplayer", expect.any(Date));
  });

  it("returns 400 when provider is empty", async () => {
    const res = await app.request("/api/v1/by-provider/%20/check", { method: "POST" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Provider name is required");
  });
});

describe("DELETE /api/v1/by-provider/:provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with delete result", async () => {
    mockMut.deleteByProvider.mockResolvedValue(15);

    const res = await app.request("/api/v1/by-provider/tcgplayer", { method: "DELETE" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ provider: "tcgplayer", deleted: 15 });
    expect(mockMut.deleteByProvider).toHaveBeenCalledWith("tcgplayer");
  });

  it("returns 400 when provider is empty", async () => {
    const res = await app.request("/api/v1/by-provider/%20", { method: "DELETE" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Provider name is required");
  });
});
