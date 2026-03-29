/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import {
  acceptPrinting,
  deletePrinting,
  renamePrinting,
  updatePrintingPromoType,
} from "./printing-admin.js";

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
        getPrintingFieldsBySlug: vi.fn(async () => null),
      },
      promoTypes: {},
    };

    await expect(updatePrintingPromoType(repos as any, "missing-slug", null)).rejects.toThrow(
      "Printing not found",
    );
  });

  it("throws BAD_REQUEST when promoTypeId is invalid", async () => {
    const repos = {
      candidateMutations: {
        getPrintingFieldsBySlug: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
      },
      promoTypes: {
        getById: vi.fn(async () => null),
      },
    };

    await expect(
      updatePrintingPromoType(repos as any, "OGN-001:normal:", "bad-promo"),
    ).rejects.toThrow("Invalid promoTypeId");
  });

  it("updates printing with new promo type slug", async () => {
    const updatePrintingById = vi.fn(async () => {});
    const repos = {
      candidateMutations: {
        getPrintingFieldsBySlug: vi.fn(async () => ({
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

    await updatePrintingPromoType(repos as any, "OGN-001:normal:", "promo-a-id");

    expect(updatePrintingById).toHaveBeenCalledWith("p-uuid", {
      promoTypeId: "promo-a-id",
      slug: "OGN-001:normal:promo-a",
    });
  });

  it("clears promo type when newPromoTypeId is null", async () => {
    const updatePrintingById = vi.fn(async () => {});
    const repos = {
      candidateMutations: {
        getPrintingFieldsBySlug: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
        updatePrintingById,
      },
      promoTypes: {},
    };

    await updatePrintingPromoType(repos as any, "OGN-001:normal:promo-a", null);

    expect(updatePrintingById).toHaveBeenCalledWith("p-uuid", {
      promoTypeId: null,
      slug: "OGN-001:normal:",
    });
  });
});

// ── renamePrinting ──────────────────────────────────────────────────────

describe("renamePrinting", () => {
  it("delegates to candidateMutations.renamePrintingSlug", async () => {
    const renamePrintingSlug = vi.fn(async () => {});
    const repos = { candidateMutations: { renamePrintingSlug } };

    await renamePrinting(repos as any, "old-slug", "new-slug");

    expect(renamePrintingSlug).toHaveBeenCalledWith("old-slug", "new-slug");
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
        getPrintingFieldsBySlug: vi.fn(async () => null),
      },
    };
    const transact = mockTransact(repos);

    await expect(deletePrinting(transact, {} as Io, repos as any, "missing-slug")).rejects.toThrow(
      "Printing not found",
    );
  });

  it("unlinks candidates, deletes images, link overrides, and printing", async () => {
    const unlinkCandidatePrintingsByPrintingId = vi.fn(async () => {});
    const deletePrintingImagesByPrintingId = vi.fn(async () => []);
    const deletePrintingLinkOverridesBySlug = vi.fn(async () => {});
    const deletePrintingBySlug = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getPrintingFieldsBySlug: vi.fn(async () => ({ id: "p-uuid" })),
        unlinkCandidatePrintingsByPrintingId,
        deletePrintingImagesByPrintingId,
        deletePrintingLinkOverridesBySlug,
        deletePrintingBySlug,
      },
    };
    const transact = mockTransact(repos);

    await deletePrinting(transact, {} as Io, repos as any, "OGN-001:normal:");

    expect(unlinkCandidatePrintingsByPrintingId).toHaveBeenCalledWith("p-uuid");
    expect(deletePrintingImagesByPrintingId).toHaveBeenCalledWith("p-uuid");
    expect(deletePrintingLinkOverridesBySlug).toHaveBeenCalledWith("OGN-001:normal:");
    expect(deletePrintingBySlug).toHaveBeenCalledWith("OGN-001:normal:");
  });

  it("cleans up rehosted files on disk after transaction", async () => {
    const repos = {
      candidateMutations: {
        getPrintingFieldsBySlug: vi.fn(async () => ({ id: "p-uuid" })),
        unlinkCandidatePrintingsByPrintingId: vi.fn(async () => {}),
        deletePrintingImagesByPrintingId: vi.fn(async () => [
          { rehostedUrl: "/card-images/set1/img-1" },
          { rehostedUrl: null },
        ]),
        deletePrintingLinkOverridesBySlug: vi.fn(async () => {}),
        deletePrintingBySlug: vi.fn(async () => {}),
      },
    };
    const transact = mockTransact(repos);

    await deletePrinting(transact, {} as Io, repos as any, "OGN-001:normal:");

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

  it("throws CONFLICT when printing slug belongs to a different card", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdBySlug: vi.fn(async () => ({ cardId: "other-card-uuid" })),
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
        getPrintingCardIdBySlug: vi.fn(async () => null),
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

    expect(result).toBe("OGN-001:normal:");
    expect(upsertPrinting).toHaveBeenCalledTimes(1);
    expect(insertImage).toHaveBeenCalledWith("p-uuid", "https://example.com/img.png", "gallery");
    expect(linkAndCheckCandidatePrintings).toHaveBeenCalledWith(["cp-1"], "p-uuid");
  });

  it("throws BAD_REQUEST for invalid rarity", async () => {
    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdBySlug: vi.fn(async () => null),
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
        getPrintingCardIdBySlug: vi.fn(async () => null),
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

    expect(result).toBe("OGN-001:normal:showcase");
    expect(repos.promoTypes.getById).toHaveBeenCalledWith("promo-uuid");
  });

  it("does not insert image when imageUrl is absent", async () => {
    const upsertPrinting = vi.fn(async () => "p-uuid");
    const insertImage = vi.fn(async () => {});
    const linkAndCheckCandidatePrintings = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getCardIdBySlug: vi.fn(async () => ({ id: "card-uuid" })),
        getPrintingCardIdBySlug: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => null),
        upsertPrinting,
        linkAndCheckCandidatePrintings,
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
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
