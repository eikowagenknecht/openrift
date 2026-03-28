/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import { acceptGalleryForNewCard } from "./accept-gallery.js";

// ── Mock the imported services so they don't pull in real deps ──────────
vi.mock("./image-rehost.js", () => ({
  rehostImages: vi.fn(async () => ({ rehosted: 0, total: 0, skipped: 0, failed: 0, errors: [] })),
}));

vi.mock("./printing-admin.js", () => ({
  acceptPrinting: vi.fn(async () => "printing-slug"),
}));

import { rehostImages } from "./image-rehost.js";
import { acceptPrinting } from "./printing-admin.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

function makeGalleryCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    name: "Flame Striker",
    shortCode: "OGN-001",
    type: "Unit",
    superTypes: ["Elemental"],
    domains: ["Fire"],
    might: 3,
    energy: 2,
    power: null,
    mightBonus: null,
    tags: ["burn"],
    ...overrides,
  };
}

function makeCandidatePrinting(overrides: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    shortCode: "OGN-001",
    setId: "ogn",
    setName: "Origins",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    promoTypeId: null,
    finish: "normal",
    artist: "Artist A",
    publicCode: "001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    imageUrl: "https://example.com/img.png",
    ...overrides,
  };
}

function createMockRepos(
  overrides: {
    candidates?: ReturnType<typeof makeGalleryCandidate>[];
    candidatePrintings?: ReturnType<typeof makeCandidatePrinting>[];
    existingCard?: { id: string } | null;
  } = {},
) {
  const candidates = overrides.candidates ?? [makeGalleryCandidate()];
  const printings = overrides.candidatePrintings ?? [makeCandidatePrinting()];
  const existingCard = overrides.existingCard ?? null;

  const candidateCards = {
    candidateCardsByNormNameAndProvider: vi.fn(async () => candidates),
    allCandidatePrintingsForCandidateCards: vi.fn(async () => printings),
  };

  const candidateMutations = {
    getCardIdBySlug: vi.fn(async () => existingCard),
    acceptNewCardFromSources: vi.fn(async () => {}),
    createNameAliases: vi.fn(async () => {}),
    checkCandidateCard: vi.fn(async () => {}),
  };

  const printingImages = {} as any;
  const promoTypes = {} as any;

  return {
    repos: { candidateCards, candidateMutations, printingImages, promoTypes },
    candidateCards,
    candidateMutations,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("acceptGalleryForNewCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(acceptPrinting).mockResolvedValue("printing-slug");
    vi.mocked(rehostImages).mockResolvedValue({
      rehosted: 0,
      total: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    });
  });

  it("throws when no gallery candidates exist", async () => {
    const { repos } = createMockRepos({ candidates: [] });
    const transact = mockTransact(repos);

    await expect(
      acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker"),
    ).rejects.toThrow("No gallery source found for this card");
  });

  it("creates a new card when slug does not exist", async () => {
    const { repos, candidateMutations } = createMockRepos();
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(candidateMutations.getCardIdBySlug).toHaveBeenCalledWith("OGN-001");
    expect(candidateMutations.acceptNewCardFromSources).toHaveBeenCalledTimes(1);
    expect(result.cardSlug).toBe("OGN-001");
  });

  it("links to existing card when slug already exists", async () => {
    const { repos, candidateMutations } = createMockRepos({
      existingCard: { id: "card-uuid-1" },
    });
    const transact = mockTransact(repos);

    await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(candidateMutations.createNameAliases).toHaveBeenCalledWith(
      "flame-striker",
      "card-uuid-1",
    );
    expect(candidateMutations.acceptNewCardFromSources).not.toHaveBeenCalled();
  });

  it("strips variant suffix from shortCode for the card slug", async () => {
    const { repos } = createMockRepos({
      candidates: [makeGalleryCandidate({ shortCode: "OGN-001a" })],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(result.cardSlug).toBe("OGN-001");
  });

  it("uses normalizedName as slug when shortCode is missing", async () => {
    const { repos } = createMockRepos({
      candidates: [makeGalleryCandidate({ shortCode: undefined })],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(result.cardSlug).toBe("flame-striker");
  });

  it("calls acceptPrinting for each group of candidate printings", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [
        makeCandidatePrinting({ id: "cp-1", shortCode: "OGN-001", finish: "normal" }),
        makeCandidatePrinting({ id: "cp-2", shortCode: "OGN-001", finish: "foil" }),
      ],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(acceptPrinting).toHaveBeenCalledTimes(2);
    expect(result.printingsCreated).toBe(2);
  });

  it("skips candidate printings without setId", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [makeCandidatePrinting({ setId: undefined })],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(acceptPrinting).not.toHaveBeenCalled();
    expect(result.printingsCreated).toBe(0);
  });

  it("continues when acceptPrinting throws for one group", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [
        makeCandidatePrinting({ id: "cp-1", shortCode: "OGN-001", finish: "normal" }),
        makeCandidatePrinting({ id: "cp-2", shortCode: "OGN-001", finish: "foil" }),
      ],
    });
    vi.mocked(acceptPrinting).mockRejectedValueOnce(new Error("conflict"));
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(result.printingsCreated).toBe(1);
  });

  it("marks all gallery candidates as checked", async () => {
    const cands = [makeGalleryCandidate({ id: "cand-1" }), makeGalleryCandidate({ id: "cand-2" })];
    const { repos, candidateMutations } = createMockRepos({ candidates: cands });
    const transact = mockTransact(repos);

    await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledTimes(2);
    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledWith("cand-1");
    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledWith("cand-2");
  });

  it("rehosts images when printings with imageUrl are created", async () => {
    const { repos } = createMockRepos();
    vi.mocked(rehostImages).mockResolvedValue({
      rehosted: 1,
      total: 1,
      skipped: 0,
      failed: 0,
      errors: [],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(rehostImages).toHaveBeenCalled();
    expect(result.imagesRehosted).toBe(1);
  });

  it("does not rehost when no images were inserted", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [makeCandidatePrinting({ imageUrl: null })],
    });
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(rehostImages).not.toHaveBeenCalled();
    expect(result.imagesRehosted).toBe(0);
  });

  it("swallows rehost errors gracefully", async () => {
    const { repos } = createMockRepos();
    vi.mocked(rehostImages).mockRejectedValue(new Error("rehost failed"));
    const transact = mockTransact(repos);

    const result = await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    expect(result.imagesRehosted).toBe(0);
  });

  it("groups candidate printings by shortCode + finish + promoTypeId", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [
        makeCandidatePrinting({
          id: "cp-1",
          shortCode: "OGN-001",
          finish: "normal",
          promoTypeId: null,
        }),
        makeCandidatePrinting({
          id: "cp-2",
          shortCode: "OGN-001",
          finish: "normal",
          promoTypeId: null,
        }),
      ],
    });
    const transact = mockTransact(repos);

    await acceptGalleryForNewCard(transact, {} as Io, repos, "flame-striker");

    // Two printings in the same group → only one acceptPrinting call
    expect(acceptPrinting).toHaveBeenCalledTimes(1);
    // Both candidate printing IDs should be passed
    const cpIds = vi.mocked(acceptPrinting).mock.calls[0][4];
    expect(cpIds).toEqual(["cp-1", "cp-2"]);
  });
});
