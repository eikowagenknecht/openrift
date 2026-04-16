/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined,
   import/first
   -- test file: mocks require empty fns, explicit undefined, and vi.mock before imports */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transact } from "../deps.js";
import type { Io } from "../io.js";
import { acceptPrinting, deletePrinting, updatePrintingMarkers } from "./printing-admin.js";

vi.mock("./image-rehost.js", () => ({
  deleteRehostFiles: vi.fn(async () => {}),
}));

import { deleteRehostFiles } from "./image-rehost.js";

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

// ── updatePrintingMarkers ───────────────────────────────────────────────

describe("updatePrintingMarkers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws NOT_FOUND when printing does not exist", async () => {
    const trxRepos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => null),
      },
      markers: {},
    };

    await expect(
      updatePrintingMarkers(mockTransact(trxRepos), "p-missing", ["promo"]),
    ).rejects.toThrow("Printing not found");
  });

  it("throws BAD_REQUEST when any marker slug is unknown", async () => {
    const trxRepos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
      },
      markers: {
        listBySlugs: vi.fn(async () => [{ id: "m-1", slug: "promo" }]),
        setForPrinting: vi.fn(async () => {}),
      },
    };

    await expect(
      updatePrintingMarkers(mockTransact(trxRepos), "p-uuid", ["promo", "unknown"]),
    ).rejects.toThrow("Unknown marker slug(s): unknown");
  });

  it("clears markers when the slug list is empty", async () => {
    const setForPrinting = vi.fn(async () => {});
    const trxRepos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
      },
      markers: { setForPrinting },
    };

    await updatePrintingMarkers(mockTransact(trxRepos), "p-uuid", []);

    expect(setForPrinting).toHaveBeenCalledWith("p-uuid", []);
  });

  it("syncs markers via the join table for a non-empty slug list", async () => {
    const setForPrinting = vi.fn(async () => {});
    const trxRepos = {
      candidateMutations: {
        getPrintingById: vi.fn(async () => ({
          id: "p-uuid",
          shortCode: "OGN-001",
          finish: "normal",
        })),
      },
      markers: {
        listBySlugs: vi.fn(async () => [{ id: "m-1", slug: "promo" }]),
        setForPrinting,
      },
    };

    await updatePrintingMarkers(mockTransact(trxRepos), "p-uuid", ["promo"]);

    expect(setForPrinting).toHaveBeenCalledWith("p-uuid", ["m-1"]);
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
          { imageFileId: "ci-1" },
          { imageFileId: "ci-2" },
        ]),
        deletePrintingLinkOverridesById: vi.fn(async () => {}),
        deletePrintingById: vi.fn(async () => {}),
        getImageFileById: vi.fn(async (id: string) =>
          id === "ci-1"
            ? { id: "ci-1", rehostedUrl: "/media/cards/g1/img-1" }
            : { id: "ci-2", rehostedUrl: null },
        ),
        isImageFileReferenced: vi.fn(async () => false),
        deleteImageFileById: vi.fn(async () => {}),
      },
    };
    const transact = mockTransact(repos);

    await deletePrinting(transact, {} as Io, repos as any, "p-uuid");

    expect(deleteRehostFiles).toHaveBeenCalledTimes(1);
    expect(deleteRehostFiles).toHaveBeenCalledWith({}, "/media/cards/g1/img-1");
  });
});

// ── acceptPrinting ──────────────────────────────────────────────────────

describe("acceptPrinting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function baseRepos(overrides: Record<string, unknown> = {}) {
    return {
      candidateMutations: {
        getCardById: vi.fn(async () => ({ id: "card-uuid", name: "Test", slug: "test" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => ({ provider: "gallery" })),
        upsertPrinting: vi.fn(async () => "p-uuid"),
        linkAndCheckCandidatePrintings: vi.fn(async () => {}),
      },
      printingImages: { insertImage: vi.fn(async () => {}) },
      markers: {
        listBySlugs: vi.fn(async () => []),
        setForPrinting: vi.fn(async () => {}),
      },
      distributionChannels: {
        listBySlugs: vi.fn(async () => []),
        setForPrinting: vi.fn(async () => {}),
      },
      sets: {
        upsert: vi.fn(async () => {}),
        getPrintedTotal: vi.fn(async () => null),
      },
      ...overrides,
    };
  }

  function withTrxExtras(repos: ReturnType<typeof baseRepos>) {
    return {
      ...repos,
      candidateMutations: {
        ...repos.candidateMutations,
        getSetIdBySlug: vi.fn(async () => ({ id: "set-uuid" })),
        recomputeKeywordsForPrintingCard: vi.fn(async () => {}),
      },
    };
  }

  it("throws when setId is missing", async () => {
    const transact = mockTransact({});
    const repos = baseRepos();

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-uuid",
        { shortCode: "OGN-001", artist: "A", publicCode: "001" },
        ["cp-1"],
      ),
    ).rejects.toThrow("printingFields.setId is required");
  });

  it("throws BAD_REQUEST when any marker slug is unknown", async () => {
    const repos = baseRepos({
      markers: {
        listBySlugs: vi.fn(async () => []),
        setForPrinting: vi.fn(async () => {}),
      },
    });
    const transact = mockTransact(withTrxExtras(repos));

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-uuid",
        {
          shortCode: "OGN-001",
          setId: "ogn",
          artist: "A",
          publicCode: "001",
          markerSlugs: ["bogus"],
        },
        ["cp-1"],
      ),
    ).rejects.toThrow("Unknown marker slug(s): bogus");
  });

  it("throws CONFLICT when printing identity belongs to a different card", async () => {
    const repos = baseRepos({
      candidateMutations: {
        getCardById: vi.fn(async () => ({ id: "card-uuid", name: "Test", slug: "test" })),
        getPrintingCardIdByComposite: vi.fn(async () => ({ cardId: "other-card-uuid" })),
      },
    });
    const transact = mockTransact(withTrxExtras(repos));

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-uuid",
        { shortCode: "OGN-001", setId: "ogn", artist: "A", publicCode: "001" },
        ["cp-1"],
      ),
    ).rejects.toThrow("already belongs to a different card");
  });

  it("creates a printing and syncs marker/channel joins", async () => {
    const repos = baseRepos({
      markers: {
        listBySlugs: vi.fn(async () => [{ id: "m-1", slug: "promo" }]),
        setForPrinting: vi.fn(async () => {}),
      },
      distributionChannels: {
        listBySlugs: vi.fn(async () => [{ id: "ch-1", slug: "worlds-2025" }]),
        setForPrinting: vi.fn(async () => {}),
      },
    });
    const trxRepos = withTrxExtras(repos);
    const transact = mockTransact(trxRepos);

    const result = await acceptPrinting(
      transact,
      repos as any,
      "card-slug",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        setName: "Origins",
        rarity: "Common",
        artist: "Artist A",
        publicCode: "001",
        imageUrl: "https://example.com/img.png",
        markerSlugs: ["promo"],
        distributionChannelSlugs: ["worlds-2025"],
      },
      ["cp-1"],
    );

    expect(result).toBe("p-uuid");
    expect(trxRepos.markers.setForPrinting).toHaveBeenCalledWith("p-uuid", ["m-1"]);
    expect(trxRepos.distributionChannels.setForPrinting).toHaveBeenCalledWith("p-uuid", [
      { channelId: "ch-1" },
    ]);
    expect(repos.printingImages.insertImage).toHaveBeenCalledWith(
      "p-uuid",
      "https://example.com/img.png",
      "gallery",
    );
    expect(repos.candidateMutations.linkAndCheckCandidatePrintings).toHaveBeenCalledWith(
      ["cp-1"],
      "p-uuid",
    );
  });

  it("creates a printing with no candidate sources (manual entry)", async () => {
    const upsertPrinting = vi.fn(async () => "p-uuid");
    const getProviderNameForCandidatePrinting = vi.fn(async () => ({ provider: "gallery" }));
    const linkAndCheckCandidatePrintings = vi.fn(async () => {});

    const repos = {
      candidateMutations: {
        getCardById: vi.fn(async () => ({ id: "card-uuid", name: "Test", slug: "test" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting,
        upsertPrinting,
        linkAndCheckCandidatePrintings,
      },
      printingImages: {},
      markers: {
        listBySlugs: vi.fn(async () => []),
        setForPrinting: vi.fn(async () => {}),
      },
      distributionChannels: {
        listBySlugs: vi.fn(async () => []),
        setForPrinting: vi.fn(async () => {}),
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
      "card-uuid",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        rarity: "Common",
        artist: "Artist A",
        publicCode: "001",
      },
      [],
    );

    expect(result).toBe("p-uuid");
    expect(upsertPrinting).toHaveBeenCalledTimes(1);
    expect(getProviderNameForCandidatePrinting).not.toHaveBeenCalled();
    expect(linkAndCheckCandidatePrintings).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for invalid rarity", async () => {
    const repos = baseRepos();
    const transact = mockTransact(withTrxExtras(repos));

    await expect(
      acceptPrinting(
        transact,
        repos as any,
        "card-uuid",
        {
          shortCode: "OGN-001",
          setId: "ogn",
          rarity: "SuperDuperRare",
          artist: "A",
          publicCode: "001",
        },
        ["cp-1"],
      ),
    ).rejects.toThrow("Invalid rarity");
  });

  it("does not insert image when imageUrl is absent", async () => {
    const repos = baseRepos({
      candidateMutations: {
        getCardById: vi.fn(async () => ({ id: "card-uuid", name: "Test", slug: "test" })),
        getPrintingCardIdByComposite: vi.fn(async () => null),
        getProviderNameForCandidatePrinting: vi.fn(async () => null),
        upsertPrinting: vi.fn(async () => "p-uuid"),
        linkAndCheckCandidatePrintings: vi.fn(async () => {}),
      },
    });
    const transact = mockTransact(withTrxExtras(repos));

    await acceptPrinting(
      transact,
      repos as any,
      "card-slug",
      {
        shortCode: "OGN-001",
        setId: "ogn",
        artist: "A",
        publicCode: "001",
      },
      ["cp-1"],
    );

    expect(repos.printingImages.insertImage).not.toHaveBeenCalled();
  });
});
