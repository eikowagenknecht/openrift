/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import { acceptPrinting, deletePrinting, updatePrintingPromoType } from "./printing-admin.js";

// ── Mock image-rehost to avoid pulling in fs/sharp ──────────────────────
vi.mock("./image-rehost.js", () => ({
  deleteRehostFiles: vi.fn(async () => {}),
}));

import { deleteRehostFiles } from "./image-rehost.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

// ── updatePrintingPromoType ─────────────────────────────────────────────

describe("updatePrintingPromoType", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws NOT_FOUND when printing does not exist", async () => {
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => null),
      },
      promoTypes: {},
    };

    await expect(updatePrintingPromoType(repos as any, "p-missing", null)).rejects.toThrow(
      "Printing not found",
    );
  });

  it("throws BAD_REQUEST when promoTypeId is invalid", async () => {
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
      },
      promoTypes: {
        getById: vi.fn(async () => null),
      },
    };

    await expect(updatePrintingPromoType(repos as any, "p-uuid", "bad-promo")).rejects.toThrow(
      "Invalid promoTypeId",
    );
  });

  it("updates printing with new promo type", async () => {
    const updatePrintingById = vi.fn(async () => {});
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
        updatePrintingById,
      },
      promoTypes: {
        getById: vi.fn(async () => ({ slug: "promo-a" })),
      },
    };

    await updatePrintingPromoType(repos as any, "p-uuid", "promo-a-id");

    expect(updatePrintingById).toHaveBeenCalledWith("p-uuid", {
      promoTypeId: "promo-a-id",
    });
  });

  it("clears promo type when newPromoTypeId is null", async () => {
    const updatePrintingById = vi.fn(async () => {});
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
        updatePrintingById,
      },
      promoTypes: {},
    };

    await updatePrintingPromoType(repos as any, "p-uuid", null);

    expect(updatePrintingById).toHaveBeenCalledWith("p-uuid", {
      promoTypeId: null,
    });
  });
});

// ── deletePrinting ──────────────────────────────────────────────────────

describe("deletePrinting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws NOT_FOUND when printing does not exist", async () => {
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => null),
      },
    };
    const transact = mockTransact(repos);

    await expect(deletePrinting(transact, {} as Io, repos as any, "p-missing")).rejects.toThrow(
      "Printing not found",
    );
  });

  it("unlinks candidates, deletes images, link overrides, and printing", async () => {
    const unlinkCandidatePrintingsByPrintingId = vi.fn(async () => {});
    const deletePrintingImagesByPrintingId = vi.fn(async () => []);
    const deletePrintingLinkOverridesById = vi.fn(async () => {});
    const deletePrintingById = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({ id: "p-uuid" })),
        unlinkCandidatePrintingsByPrintingId,
        deletePrintingImagesByPrintingId,
        deletePrintingLinkOverridesById,
        deletePrintingById,
      },
    };
    const transact = mockTransact(repos);

    await deletePrinting(transact, {} as Io, repos as any, "p-uuid");

    expect(unlinkCandidatePrintingsByPrintingId).toHaveBeenCalledWith("p-uuid");
    expect(deletePrintingImagesByPrintingId).toHaveBeenCalledWith("p-uuid");
    expect(deletePrintingLinkOverridesById).toHaveBeenCalledWith("p-uuid");
    expect(deletePrintingById).toHaveBeenCalledWith("p-uuid");
  });

  it("cleans up rehosted files on disk after transaction", async () => {
    const repos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({ id: "p-uuid" })),
        unlinkCandidatePrintingsByPrintingId: vi.fn(async () => {}),
        deletePrintingImagesByPrintingId: vi.fn(async () => [
          { rehostedUrl: "/card-images/set1/img-1" },
          { rehostedUrl: null },
        ]),
        deletePrintingLinkOverridesById: vi.fn(async () => {}),
        deletePrintingById: vi.fn(async () => {}),
      },
    };
    const transact = mockTransact(repos);

    await deletePrinting(transact, {} as Io, repos as any, "p-uuid");

    expect(deleteRehostFiles).toHaveBeenCalledTimes(1);
    expect(deleteRehostFiles).toHaveBeenCalledWith({}, "/card-images/set1/img-1");
  });
});

// ── acceptPrinting ──────────────────────────────────────────────────────

describe("acceptPrinting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws when candidatePrintingIds is empty", async () => {
    const transact = mockTransact({});
    const repos = { candidateMutations: {}, printingImages: {}, promoTypes: {} };

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-slug",
        { shortCode: "OGN-001", collectorNumber: 1, artist: "A", publicCode: "001" },
        [],
      ),
    ).rejects.toThrow("printingFields and candidatePrintingIds[] required");
  });

  it("throws when setId is missing", async () => {
    const transact = mockTransact({});
    const repos = { candidateMutations: {}, printingImages: {}, promoTypes: {} };

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-slug",
        { shortCode: "OGN-001", collectorNumber: 1, artist: "A", publicCode: "001" },
        ["cp-1"],
      ),
    ).rejects.toThrow("printingFields.setId is required");
  });

  it("throws NOT_FOUND when card does not exist", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => null),
      },
      printingImages: {},
      promoTypes: {},
    };
    const transact = mockTransact(repos);

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "missing-card",
        { shortCode: "OGN-001", setId: "ogn", collectorNumber: 1, artist: "A", publicCode: "001" },
        ["cp-1"],
      ),
    ).rejects.toThrow("Card not found");
  });

  it("throws BAD_REQUEST when promoTypeId is invalid", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
      },
      printingImages: {},
      promoTypes: {
        getById: vi.fn(async () => null),
      },
    };
    const transact = mockTransact(repos);

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-slug",
        {
          shortCode: "OGN-001",
          setId: "ogn",
          collectorNumber: 1,
          artist: "A",
          publicCode: "001",
          promoTypeId: "bad-promo",
        },
        ["cp-1"],
      ),
    ).rejects.toThrow("Invalid promoTypeId");
  });

  it("throws CONFLICT when printing identity belongs to a different card", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdByComposite: vi.fn(async () => ({ cardId: "other-card-uuid" })),
      },
      printingImages: {},
      promoTypes: {},
    };
    const transact = mockTransact(repos);

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-slug",
        { shortCode: "OGN-001", setId: "ogn", collectorNumber: 1, artist: "A", publicCode: "001" },
        ["cp-1"],
      ),
    ).rejects.toThrow("already belongs to a different card");
  });

  it("creates a printing successfully with all fields", async () => {
    const upsertPrinting = vi.fn(async () => "p-uuid");
    const insertImage = vi.fn(async () => {});
    const linkAndCheckCandidatePrintings = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => ({ provider: "gallery" })),
        upsertPrinting,
        linkAndCheckCandidatePrintings,
      },
      printingImages: { insertImage },
      promoTypes: {},
      sets: {
        upsert: vi.fn(async () => {}),
        getPrintedTotal: vi.fn(async () => null),
      },
    };

    // Need trxRepos with the setId lookup
    const trxRepos = {
      ...repos,
      candidateMutations: {
        ...repos.candidateMutations,
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
        recomputeKeywordsForPrintingCard: vi.fn(async () => {}),
      },
    };

    const transact = mockTransact(trxRepos);

    const result = await acceptPrinting(
      transact,
      repos as any,
      "card-slug",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        setName: "Origins",
        collectorNumber: 1,
        rarity: "Common",
        artist: "Artist A",
        publicCode: "001",
        imageUrl: "https://example.com/img.png",
      },
      ["cp-1"],
    );

    expect(result).toBe("p-uuid");
    expect(upsertPrinting).toHaveBeenCalledTimes(1);
    expect(insertImage).toHaveBeenCalledWith("p-uuid", "https://example.com/img.png", "gallery");
    expect(linkAndCheckCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "p-uuid");
  });

  it("throws BAD_REQUEST for invalid rarity", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => ({ provider: "gallery" })),
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
      },
      printingImages: {},
      promoTypes: {},
      sets: {
        upsert: vi.fn(async () => {}),
        getPrintedTotal: vi.fn(async () => null),
      },
    };
    const transact = mockTransact(repos);

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-slug",
        {
          shortCode: "OGN-001",
          setId: "ogn",
          collectorNumber: 1,
          rarity: "SuperDuperRare",
          artist: "A",
          publicCode: "001",
        },
        ["cp-1"],
      ),
    ).rejects.toThrow("Invalid rarity");
  });

  it("creates a printing with a valid promoTypeId", async () => {
    const upsertPrinting = vi.fn(async () => "p-uuid");
    const insertImage = vi.fn(async () => {});
    const linkAndCheckCandidatePrintings = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => ({ provider: "gallery" })),
        upsertPrinting,
        linkAndCheckCandidatePrintings,
      },
      printingImages: { insertImage },
      promoTypes: {
        getById: vi.fn(async () => ({ slug: "showcase" })),
      },
      sets: {
        upsert: vi.fn(async () => {}),
        getPrintedTotal: vi.fn(async () => null),
      },
    };

    const trxRepos = {
      ...repos,
      candidateMutations: {
        ...repos.candidateMutations,
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
        recomputeKeywordsForPrintingCard: vi.fn(async () => {}),
      },
    };

    const transact = mockTransact(trxRepos);

    const result = await acceptPrinting(
      transact,
      repos as any,
      "card-slug",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        setName: "Origins",
        collectorNumber: 1,
        rarity: "Common",
        artist: "Artist A",
        publicCode: "001",
        promoTypeId: "promo-uuid",
      },
      ["cp-1"],
    );

    expect(result).toBe("p-uuid");
    expect(repos.promoTypes.getById).toHaveBeenCalledWith("promo-uuid");
  });

  it("does not insert image when imageUrl is absent", async () => {
    const upsertPrinting = vi.fn(async () => "p-uuid");
    const insertImage = vi.fn(async () => {});
    const linkAndCheckCandidatePrintings = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => null),
        upsertPrinting,
        linkAndCheckCandidatePrintings,
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
        recomputeKeywordsForPrintingCard: vi.fn(async () => {}),
      },
      printingImages: { insertImage },
      promoTypes: {},
      sets: {
        upsert: vi.fn(async () => {}),
        getPrintedTotal: vi.fn(async () => null),
      },
    };
    const transact = mockTransact(repos);

    await acceptPrinting(
      transact,
      repos as any,
      "card-slug",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        collectorNumber: 1,
        artist: "A",
        publicCode: "001",
      },
      ["cp-1"],
    );

    expect(insertImage).not.toHaveBeenCalled();
  });
});
