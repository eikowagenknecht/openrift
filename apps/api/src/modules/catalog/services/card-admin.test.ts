/* oxlint-disable
   no-empty-function,
   import/first
   -- test file: mocks require empty fns and vi.mock before imports */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transact } from "../../../deps.js";
import type { Io } from "../../../io.js";
import type { CardDeleteBlockers } from "../repositories/catalog-delete-guards.js";
import { deleteCard } from "./card-admin.js";

vi.mock("./images/variants.js", () => ({
  deleteRehostFiles: vi.fn(async () => {}),
}));

import { deleteRehostFiles } from "./images/variants.js";

function mockTransact(trxRepos: unknown): Transact {
  return (fn) => fn(trxRepos as any) as any;
}

function noBlockers(overrides: Partial<CardDeleteBlockers> = {}): CardDeleteBlockers {
  return {
    copies: 0,
    collectionEvents: 0,
    deckCards: 0,
    listEntries: 0,
    loans: 0,
    cardTrades: 0,
    marketplaceProductVariants: 0,
    productPrintings: 0,
    ...overrides,
  };
}

/** Flattened so a test can override any single method by name regardless of which repo owns it. */
function baseRepos(overrides: Record<string, unknown> = {}) {
  const mut = {
    getCardById: vi.fn(async () => ({ id: "card-uuid", name: "Test", slug: "test" })),
    countForCard: vi.fn(async () => noBlockers()),
    getPrintingIdsByCardId: vi.fn(async () => [{ id: "p-1" }, { id: "p-2" }]),
    unlinkCandidatePrintingsByPrintingId: vi.fn(async () => {}),
    deletePrintingImagesByPrintingId: vi.fn(async () => []),
    deletePrintingLinkOverridesById: vi.fn(async () => {}),
    deletePrintingById: vi.fn(async () => {}),
    deleteCardBansByCardId: vi.fn(async () => {}),
    deleteMarketplaceCardOverridesByCardId: vi.fn(async () => {}),
    deleteCardById: vi.fn(async () => ({ id: "card-uuid" })),
    getImageFileById: vi.fn(async () => null),
    isImageFileReferenced: vi.fn(async () => false),
    deleteImageFileById: vi.fn(async () => {}),
    ...overrides,
  } as Record<string, any>;
  const pick = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, mut[k]]));
  const repos = {
    catalogMutations: pick(
      "getCardById",
      "getPrintingIdsByCardId",
      "deletePrintingImagesByPrintingId",
      "deletePrintingById",
      "deleteCardBansByCardId",
      "deleteMarketplaceCardOverridesByCardId",
      "deleteCardById",
      "getImageFileById",
      "isImageFileReferenced",
      "deleteImageFileById",
    ),
    candidateCards: pick("unlinkCandidatePrintingsByPrintingId", "deletePrintingLinkOverridesById"),
    catalogDeleteGuards: pick("countForCard"),
  };
  return { mut, repos };
}

describe("deleteCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws NOT_FOUND when the card does not exist", async () => {
    const { repos } = baseRepos({ getCardById: vi.fn(async () => null) });

    await expect(
      deleteCard(mockTransact(repos), {} as Io, repos as any, "card-missing"),
    ).rejects.toThrow("Card not found");
  });

  it("throws CONFLICT naming the blockers when user data references the card", async () => {
    const { mut, repos } = baseRepos({
      countForCard: vi.fn(async () => noBlockers({ copies: 3, deckCards: 1 })),
    });

    await expect(
      deleteCard(mockTransact(repos), {} as Io, repos as any, "card-uuid"),
    ).rejects.toThrow("collection copies (3), deck cards (1)");

    expect(mut.deletePrintingById).not.toHaveBeenCalled();
    expect(mut.deleteCardById).not.toHaveBeenCalled();
  });

  it("deletes all printings, admin children, and the card row", async () => {
    const { mut, repos } = baseRepos();

    await deleteCard(mockTransact(repos), {} as Io, repos as any, "card-uuid");

    expect(mut.unlinkCandidatePrintingsByPrintingId).toHaveBeenCalledWith("p-1");
    expect(mut.unlinkCandidatePrintingsByPrintingId).toHaveBeenCalledWith("p-2");
    expect(mut.deletePrintingById).toHaveBeenCalledTimes(2);
    expect(mut.deleteCardBansByCardId).toHaveBeenCalledWith("card-uuid");
    expect(mut.deleteMarketplaceCardOverridesByCardId).toHaveBeenCalledWith("card-uuid");
    expect(mut.deleteCardById).toHaveBeenCalledWith("card-uuid");
  });

  it("cleans up orphaned rehosted files after the transaction", async () => {
    const { mut, repos } = baseRepos({
      deletePrintingImagesByPrintingId: vi.fn(async (printingId: string) =>
        printingId === "p-1" ? [{ imageFileId: "ci-1" }] : [],
      ),
      getImageFileById: vi.fn(async () => ({
        id: "ci-1",
        rehostedUrl: "/media/cards/g1/img-1",
      })),
    });

    await deleteCard(mockTransact(repos), {} as Io, repos as any, "card-uuid");

    expect(deleteRehostFiles).toHaveBeenCalledWith({}, "/media/cards/g1/img-1");
    expect(mut.deleteImageFileById).toHaveBeenCalledWith("ci-1");
  });

  it("converts a foreign-key race during the delete into CONFLICT", async () => {
    const countForCard = vi
      .fn()
      .mockResolvedValueOnce(noBlockers())
      .mockResolvedValueOnce(noBlockers({ copies: 1 }));
    const { repos } = baseRepos({ countForCard });
    const fkError = Object.assign(new Error("violates foreign key constraint"), {
      code: "23503",
    });
    const transact: Transact = () => Promise.reject(fkError);

    await expect(deleteCard(transact, {} as Io, repos as any, "card-uuid")).rejects.toThrow(
      "collection copies (1)",
    );
  });

  it("rethrows non-FK transaction errors unchanged", async () => {
    const { mut, repos } = baseRepos();
    const transact: Transact = () => Promise.reject(new Error("connection lost"));

    await expect(deleteCard(transact, {} as Io, repos as any, "card-uuid")).rejects.toThrow(
      "connection lost",
    );
    expect(mut.countForCard).toHaveBeenCalledTimes(1);
  });
});
