import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { Io } from "../../../io.js";
import type { AdminAccess } from "../../../middleware/require-admin.js";
import { assertDeskOwnership, createDeskPrinting, updateDeskPrinting } from "./printing-desk.js";

const acceptPrinting = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve("new-printing")),
);
const updatePrintingMarkers = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updatePrintingDistributionChannels = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const recordAdminEvent = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("./printing-admin.js", () => ({
  acceptPrinting,
  updatePrintingMarkers,
  updatePrintingDistributionChannels,
}));
vi.mock("../../system/services/record-admin-event.js", () => ({ recordAdminEvent }));

const CARD = { id: "card-1", slug: "poro-snack", name: "Poro Snack" };

const BASE_PRINTING = {
  id: "base-1",
  cardId: CARD.id,
  shortCode: "OGN-001",
  rarity: "rare",
  artist: "Base Artist",
  printedRulesText: "Draw a card.",
  printedEffectText: null,
  flavorText: "Crunchy.",
  printedName: "Poro Snack",
  announcedAt: null,
  releasedAt: null,
  releasePrecision: null,
};

function makeRepos() {
  return {
    adminEvents: {
      printingIdsCreatedBy: vi.fn(() => Promise.resolve([] as string[])),
      wasPrintingCreatedBy: vi.fn(() => Promise.resolve(false)),
    },
    catalog: { refreshCatalogViews: vi.fn(() => Promise.resolve()) },
    catalogMutations: {
      getCardById: vi.fn(() => Promise.resolve(CARD)),
      getSetPrintedTotalForPrinting: vi.fn(() => Promise.resolve({ printedTotal: 298 })),
    },
    distributionChannels: {},
    markers: {},
    printingDesk: {
      getFullPrinting: vi.fn(() => Promise.resolve(BASE_PRINTING)),
      findBasePrinting: vi.fn(() => Promise.resolve(BASE_PRINTING)),
      updatePrintingDeskFields: vi.fn(() => Promise.resolve()),
    },
    printingEvents: {},
    printingImages: {},
    sets: { getRef: vi.fn(() => Promise.resolve({ slug: "ogn", name: "Origins" })) },
  };
}

type FakeRepos = ReturnType<typeof makeRepos>;

const transact = ((fn) => fn({} as never)) as Transact;
const io = {} as Io;

const CREATE_INPUT = {
  cardId: CARD.id,
  setId: "00000000-0000-4000-8000-000000000001",
  distributionChannelSlugs: ["skirmish-2026"],
  markerSlugs: ["prerelease"],
  codeTba: false,
  shortCode: "OGN-P01",
  finish: "foil",
  language: "EN",
  size: "standard",
  announcedAt: null,
  releasedAt: null,
  releasePrecision: null,
  comment: null,
} as const;

function create(repos: FakeRepos, over: Record<string, unknown> = {}) {
  return createDeskPrinting(transact, repos as unknown as Repos, io, "user-1", {
    ...CREATE_INPUT,
    ...over,
  } as never);
}

let repos: FakeRepos;

beforeEach(() => {
  vi.clearAllMocks();
  acceptPrinting.mockResolvedValue("new-printing");
  repos = makeRepos();
});

describe("createDeskPrinting", () => {
  it("derives a per-card TBA short code and keeps the public code bare", async () => {
    await create(repos, { codeTba: true, shortCode: undefined });

    expect(acceptPrinting.mock.calls[0]?.[3]).toMatchObject({
      shortCode: "TBA-poro-snack",
      publicCode: "TBA",
    });
    // appendSetTotal would otherwise write "TBA/<set total>".
    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith(
      "new-printing",
      expect.objectContaining({ publicCode: "TBA" }),
    );
  });

  it("leaves a real code alone and writes no public-code override", async () => {
    await create(repos);

    expect(acceptPrinting.mock.calls[0]?.[3]).toMatchObject({
      shortCode: "OGN-P01",
      publicCode: "OGN-P01",
    });
    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith(
      "new-printing",
      expect.not.objectContaining({ publicCode: expect.anything() }),
    );
  });

  it("rejects a create with no code and no TBA flag", async () => {
    await expect(create(repos, { shortCode: undefined })).rejects.toThrow("short code is required");
  });

  it("copies presentation fields off the base printing", async () => {
    await create(repos);

    expect(acceptPrinting.mock.calls[0]?.[3]).toMatchObject({
      artist: "Base Artist",
      rarity: "rare",
      printedRulesText: "Draw a card.",
      flavorText: "Crunchy.",
      printedName: "Poro Snack",
      artVariant: "normal",
      isSigned: false,
    });
  });

  it("prefers an explicitly given artist over the base printing's", async () => {
    await create(repos, { artist: "Guest Artist" });
    expect(acceptPrinting.mock.calls[0]?.[3]).toMatchObject({ artist: "Guest Artist" });
  });

  it("rejects a card with no base printing when no artist is given", async () => {
    repos.printingDesk.findBasePrinting.mockResolvedValue(undefined as never);
    await expect(create(repos)).rejects.toThrow("artist is required");
  });

  it("reads the base printing by id when one is named", async () => {
    await create(repos, { basePrintingId: "base-9" });
    expect(repos.printingDesk.getFullPrinting).toHaveBeenCalledWith("base-9");
    expect(repos.printingDesk.findBasePrinting).not.toHaveBeenCalled();
  });

  it("snaps a coarse release date to the start of its period", async () => {
    await create(repos, { releasedAt: "2026-05-17", releasePrecision: "quarter" });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith(
      "new-printing",
      expect.objectContaining({ releasedAt: "2026-04-01", releasePrecision: "quarter" }),
    );
  });

  it("keeps a day-precision date exactly as given", async () => {
    await create(repos, { releasedAt: "2026-05-17", releasePrecision: "day" });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith(
      "new-printing",
      expect.objectContaining({ releasedAt: "2026-05-17" }),
    );
  });

  it("writes the announcement date the caller gave", async () => {
    await create(repos, { announcedAt: "2026-02-14" });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith(
      "new-printing",
      expect.objectContaining({ announcedAt: "2026-02-14" }),
    );
  });

  it("rejects a release date without a precision", async () => {
    await expect(create(repos, { releasedAt: "2026-05-17" })).rejects.toThrow(
      "release date and a precision",
    );
  });

  it("rejects a precision without a release date", async () => {
    await expect(create(repos, { releasePrecision: "year" })).rejects.toThrow(
      "release date and a precision",
    );
  });

  it("records the create event and refreshes the catalog views", async () => {
    await create(repos);

    expect(recordAdminEvent).toHaveBeenCalledWith(
      repos,
      "user-1",
      expect.objectContaining({
        action: "printing.create",
        entityType: "printing",
        entityId: "new-printing",
        entityLabel: "OGN-P01",
        cardSlug: "poro-snack",
      }),
    );
    expect(repos.catalog.refreshCatalogViews).toHaveBeenCalled();
  });

  it("maps an identity unique violation to a 409", async () => {
    acceptPrinting.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        code: "23505",
        constraint_name: "uq_printings_identity",
      }),
    );

    await expect(create(repos)).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  });
});

const FULL_ADMIN = { isAdmin: true, sections: [] } as unknown as AdminAccess;
const GRANT_HOLDER = { isAdmin: false, sections: ["printing-desk"] } as unknown as AdminAccess;

function update(targetRepos: FakeRepos, access: AdminAccess, patch: Record<string, unknown>) {
  return updateDeskPrinting(transact, targetRepos as unknown as Repos, access, "user-1", {
    printingId: "p-1",
    ...patch,
  } as never);
}

describe("updateDeskPrinting", () => {
  it("writes only the fields the caller sent", async () => {
    await update(repos, FULL_ADMIN, { comment: "Handed out at the skirmish." });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      comment: "Handed out at the skirmish.",
    });
    expect(updatePrintingMarkers).not.toHaveBeenCalled();
    expect(updatePrintingDistributionChannels).not.toHaveBeenCalled();
  });

  it("routes markers and channels through the junction services", async () => {
    await update(repos, FULL_ADMIN, {
      markerSlugs: ["prerelease"],
      distributionChannelSlugs: ["skirmish-2026"],
    });

    expect(updatePrintingMarkers).toHaveBeenCalledWith(transact, "p-1", ["prerelease"]);
    expect(updatePrintingDistributionChannels).toHaveBeenCalledWith(repos, "p-1", [
      "skirmish-2026",
    ]);
  });

  it("recomputes both codes when the TBA flag is set", async () => {
    await update(repos, FULL_ADMIN, { codeTba: true });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      shortCode: "TBA-poro-snack",
      publicCode: "TBA",
    });
  });

  it("appends the set total to a real code and leaves TBA bare", async () => {
    await update(repos, FULL_ADMIN, { codeTba: false, shortCode: "OGN-P02" });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      shortCode: "OGN-P02",
      publicCode: "OGN-P02/298",
    });
  });

  it("snaps a coarse release date", async () => {
    await update(repos, FULL_ADMIN, { releasedAt: "2026-11-20", releasePrecision: "year" });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      releasedAt: "2026-01-01",
      releasePrecision: "year",
    });
  });

  it("clears a stored release date when both fields are sent as null", async () => {
    repos.printingDesk.getFullPrinting.mockResolvedValue({
      ...BASE_PRINTING,
      releasedAt: "2026-10-01",
      releasePrecision: "month",
    } as never);

    await update(repos, FULL_ADMIN, { releasedAt: null, releasePrecision: null });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      releasedAt: null,
      releasePrecision: null,
    });
  });

  it("clears a stored announcement date when null is sent", async () => {
    repos.printingDesk.getFullPrinting.mockResolvedValue({
      ...BASE_PRINTING,
      announcedAt: "2026-02-14",
    } as never);

    await update(repos, FULL_ADMIN, { announcedAt: null });

    expect(repos.printingDesk.updatePrintingDeskFields).toHaveBeenCalledWith("p-1", {
      announcedAt: null,
    });
  });

  it("records the update event with old and new values", async () => {
    await update(repos, FULL_ADMIN, { artist: "Guest Artist" });

    expect(recordAdminEvent).toHaveBeenCalledWith(
      repos,
      "user-1",
      expect.objectContaining({
        action: "printing.update",
        entityType: "printing",
        entityId: "p-1",
        oldValues: { artist: "Base Artist" },
        newValues: { artist: "Guest Artist" },
      }),
    );
  });

  it("maps an identity unique violation to a 409", async () => {
    repos.printingDesk.updatePrintingDeskFields.mockRejectedValue(
      Object.assign(new Error("duplicate"), {
        code: "23505",
        constraint_name: "uq_printings_variant",
      }),
    );

    await expect(update(repos, FULL_ADMIN, { shortCode: "OGN-P02" })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });

  it("404s on a printing that does not exist", async () => {
    repos.printingDesk.getFullPrinting.mockResolvedValue(undefined as never);
    await expect(update(repos, FULL_ADMIN, { artist: "X" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("assertDeskOwnership", () => {
  it("lets a full admin through without reading the event log", async () => {
    await expect(
      assertDeskOwnership(repos as unknown as Repos, FULL_ADMIN, "user-1", "p-1"),
    ).resolves.toBeUndefined();
    expect(repos.adminEvents.wasPrintingCreatedBy).not.toHaveBeenCalled();
  });

  it("lets the grant holder who added the printing through", async () => {
    repos.adminEvents.wasPrintingCreatedBy.mockResolvedValue(true);
    await expect(
      assertDeskOwnership(repos as unknown as Repos, GRANT_HOLDER, "user-1", "p-1"),
    ).resolves.toBeUndefined();
  });

  it("403s another grant holder", async () => {
    repos.adminEvents.wasPrintingCreatedBy.mockResolvedValue(false);
    await expect(
      assertDeskOwnership(repos as unknown as Repos, GRANT_HOLDER, "user-2", "p-1"),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("403s when there is no admin access at all", async () => {
    await expect(
      assertDeskOwnership(repos as unknown as Repos, null, "user-1", "p-1"),
    ).rejects.toBeInstanceOf(AppError);
  });
});
