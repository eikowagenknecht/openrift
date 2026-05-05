/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import { acceptFavoriteNewCard } from "./accept-gallery.js";

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

const FAVORITE_PROVIDERS = new Set(["gallery", "tcgplayer"]);

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    name: "Flame Striker",
    shortCode: "OGN-001",
    provider: "gallery",
    type: "unit",
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
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: [] as string[],
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
    candidates?: ReturnType<typeof makeCandidate>[];
    candidatePrintings?: ReturnType<typeof makeCandidatePrinting>[];
    existingCard?: { id: string } | null;
  } = {},
) {
  const candidates = overrides.candidates ?? [makeCandidate()];
  const printings = overrides.candidatePrintings ?? [makeCandidatePrinting()];
  const existingCard = overrides.existingCard ?? null;

  const candidateCards = {
    candidateCardsByNormName: vi.fn(async () => candidates),
    allCandidatePrintingsForCandidateCards: vi.fn(async () => printings),
  };

  const candidateMutations = {
    getCardIdBySlug: vi.fn(async () => existingCard),
    acceptNewCardFromSources: vi.fn(async () => {}),
    createNameAliases: vi.fn(async () => {}),
    checkCandidateCard: vi.fn(async () => {}),
  };

  const printingImages = {} as any;
  const distributionChannels = {} as any;
  const markers = {} as any;

  return {
    repos: { candidateCards, candidateMutations, printingImages, distributionChannels, markers },
    candidateCards,
    candidateMutations,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("acceptFavoriteNewCard", () => {
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

  it("throws when no favorite candidates exist", async () => {
    const { repos } = createMockRepos({ candidates: [] });
    const transact = mockTransact(repos);

    await expect(
      acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS),
    ).rejects.toThrow("No favorite-provider source found for this card");
  });

  it("filters out non-favorite providers", async () => {
    const { repos } = createMockRepos({
      candidates: [makeCandidate({ id: "c1", provider: "unknown-provider" })],
    });
    const transact = mockTransact(repos);

    await expect(
      acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS),
    ).rejects.toThrow("No favorite-provider source found for this card");
  });

  it("creates a new card when slug does not exist", async () => {
    const { repos, candidateMutations } = createMockRepos();
    const transact = mockTransact(repos);

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

    expect(candidateMutations.getCardIdBySlug).toHaveBeenCalledWith("flame-striker");
    expect(candidateMutations.acceptNewCardFromSources).toHaveBeenCalledTimes(1);
    expect(result.cardSlug).toBe("flame-striker");
  });

  it("links to existing card when slug already exists", async () => {
    const { repos, candidateMutations } = createMockRepos({
      existingCard: { id: "card-uuid-1" },
    });
    const transact = mockTransact(repos);

    await acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS);

    expect(candidateMutations.createNameAliases).toHaveBeenCalledWith(
      "flame-striker",
      "card-uuid-1",
    );
    expect(candidateMutations.acceptNewCardFromSources).not.toHaveBeenCalled();
  });

  it("derives slug from card name regardless of shortCode variant suffix", async () => {
    const { repos } = createMockRepos({
      candidates: [makeCandidate({ shortCode: "OGN-001a" })],
    });
    const transact = mockTransact(repos);

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

    expect(result.cardSlug).toBe("flame-striker");
  });

  it("uses normalizedName as slug when shortCode is missing", async () => {
    const { repos } = createMockRepos({
      candidates: [makeCandidate({ shortCode: undefined })],
    });
    const transact = mockTransact(repos);

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

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

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

    expect(acceptPrinting).toHaveBeenCalledTimes(2);
    expect(result.printingsCreated).toBe(2);
  });

  it("skips candidate printings without setId", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [makeCandidatePrinting({ setId: undefined })],
    });
    const transact = mockTransact(repos);

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

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

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

    expect(result.printingsCreated).toBe(1);
  });

  it("marks only favorite candidates as checked", async () => {
    const cands = [
      makeCandidate({ id: "cand-1", provider: "gallery" }),
      makeCandidate({ id: "cand-2", provider: "tcgplayer" }),
      makeCandidate({ id: "cand-3", provider: "unknown" }),
    ];
    const { repos, candidateMutations } = createMockRepos({ candidates: cands });
    const transact = mockTransact(repos);

    await acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS);

    // Only the two favorite providers should be checked, not "unknown"
    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledTimes(2);
    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledWith("cand-1");
    expect(candidateMutations.checkCandidateCard).toHaveBeenCalledWith("cand-2");
  });

  it("fires rehost without awaiting when printings with imageUrl are created", async () => {
    const { repos } = createMockRepos();
    const transact = mockTransact(repos);

    const result = await acceptFavoriteNewCard(
      transact,
      {} as Io,
      repos,
      "flame-striker",
      FAVORITE_PROVIDERS,
    );

    expect(rehostImages).toHaveBeenCalled();
    // imagesRehosted is no longer in the return value (fire-and-forget)
    expect(result).not.toHaveProperty("imagesRehosted");
  });

  it("does not rehost when no images were inserted", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [makeCandidatePrinting({ imageUrl: null })],
    });
    const transact = mockTransact(repos);

    await acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS);

    expect(rehostImages).not.toHaveBeenCalled();
  });

  it("does not reject when rehost fails (fire-and-forget)", async () => {
    const { repos } = createMockRepos();
    vi.mocked(rehostImages).mockRejectedValue(new Error("rehost failed"));
    const transact = mockTransact(repos);

    // Should not throw — rehost is fire-and-forget
    await expect(
      acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS),
    ).resolves.toBeDefined();
  });

  it("groups candidate printings by shortCode + finish + markerSlugs", async () => {
    const { repos } = createMockRepos({
      candidatePrintings: [
        makeCandidatePrinting({
          id: "cp-1",
          shortCode: "OGN-001",
          finish: "normal",
          markerSlugs: [],
        }),
        makeCandidatePrinting({
          id: "cp-2",
          shortCode: "OGN-001",
          finish: "normal",
          markerSlugs: [],
        }),
      ],
    });
    const transact = mockTransact(repos);

    await acceptFavoriteNewCard(transact, {} as Io, repos, "flame-striker", FAVORITE_PROVIDERS);

    // Two printings in the same group → only one acceptPrinting call
    expect(acceptPrinting).toHaveBeenCalledTimes(1);
    // Both candidate printing IDs should be passed
    const cpIds = vi.mocked(acceptPrinting).mock.calls[0][4];
    expect(cpIds).toEqual(["cp-1", "cp-2"]);
  });
});
