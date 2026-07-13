import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import { createLoan } from "./loans.js";

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

/**
 * Minimal loans repo whose `pinCopies` fails, exercising the race branch.
 * @returns A repos stub with just the methods createLoan touches.
 */
function reposWithPinError(error: unknown): Repos {
  return {
    copies: {
      lockByIds: vi.fn(async (ids: string[]) => ids),
    },
    loans: {
      printingCardId: vi.fn(async () => "card-1"),
      listUnclaimedCopyIds: vi.fn(async () => ["copy-1", "copy-2"]),
      create: vi.fn(async () => ({ id: "loan-1" })),
      pinCopies: vi.fn(async () => {
        throw error;
      }),
    },
  } as unknown as Repos;
}

const INPUT = {
  lenderUserId: "lender-1",
  printingId: "printing-1",
  quantity: 1,
  borrowerName: "Ashe",
};

describe("createLoan copy-pin race", () => {
  it("maps a unique-violation on pinCopies to a 409, not a raw 500", async () => {
    const repos = reposWithPinError({ code: "23505" });
    const result = await createLoan(mockTransact(repos), INPUT).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).status).toBe(409);
  });

  it("re-throws a non-unique error unchanged", async () => {
    const boom = new Error("connection reset");
    const repos = reposWithPinError(boom);
    await expect(createLoan(mockTransact(repos), INPUT)).rejects.toBe(boom);
  });
});
