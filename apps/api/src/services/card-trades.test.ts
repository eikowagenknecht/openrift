import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { CardTrade } from "../repositories/card-trades.js";
import { acceptTrade } from "./card-trades.js";

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

const TRADE = {
  id: "trade-1",
  groupId: "group-1",
  giverUserId: "giver-1",
  receiverUserId: "receiver-1",
  // The initiator can't accept their own trade (assertRecipient) — make the
  // giver the initiator so the receiver, who calls acceptTrade below, is the
  // eligible recipient.
  initiator: "giver",
  printingId: "printing-1",
  quantity: 1,
  status: "pending",
} as unknown as CardTrade;

describe("acceptTrade cross-claim with a concurrent loan", () => {
  it("409s and never pins when the locked copy was pinned to a loan after the supply read", async () => {
    const pinCopies = vi.fn(async () => undefined);
    const markReserved = vi.fn(async () => 1);
    const repos = {
      cardTrades: {
        getById: vi.fn(async () => TRADE),
        pinCopies,
        markReserved,
      },
      friendGroupMatches: {
        // Pre-check reports the copy as unreserved...
        giverPrintingSupply: vi.fn(async () => ({
          unreservedCopyIds: ["copy-1"],
          hasAny: true,
        })),
      },
      copies: {
        lockByIds: vi.fn(async (ids: string[]) => ids),
      },
      loans: {
        // ...but by the time the row is locked, a concurrent createLoan has
        // already pinned it.
        filterLoanedCopyIds: vi.fn(async () => ["copy-1"]),
      },
    } as unknown as Repos;

    const result = await acceptTrade(mockTransact(repos), TRADE.id, TRADE.receiverUserId).catch(
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
    expect(pinCopies).not.toHaveBeenCalled();
    expect(markReserved).not.toHaveBeenCalled();
  });
});
