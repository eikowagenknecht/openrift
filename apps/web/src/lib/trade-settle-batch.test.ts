import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { runSettleBatch } from "./trade-settle-batch";

/** @returns A reserved trade on the given side, with only the fields the batch reads. */
function trade(id: string, role: CardTradeRole, quantity: number): CardTradeResponse {
  return { id, role, quantity, groupSlug: "friday-night" } as unknown as CardTradeResponse;
}

/** @returns A copy-options response that either prompts or does not. */
function options(choiceMatters: boolean): CardTradeCopyOptionsResponse {
  return { tradeId: "t", quantity: 1, choiceMatters, copies: [] } as CardTradeCopyOptionsResponse;
}

/** @returns Batch deps whose settle always succeeds and whose options never prompt. */
function deps(overrides: Partial<Parameters<typeof runSettleBatch>[1]> = {}) {
  return {
    settle: vi.fn(async () => undefined),
    readCopyOptions: vi.fn(async () => options(false)),
    ...overrides,
  };
}

describe("runSettleBatch", () => {
  it("settles each row for the quantity that turned up", async () => {
    const d = deps();
    await runSettleBatch(
      [
        { trade: trade("t1", "receiver", 3), quantity: 1 },
        { trade: trade("t2", "receiver", 2), quantity: 2 },
      ],
      d,
    );

    expect(d.settle).toHaveBeenCalledTimes(2);
    expect(d.settle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tradeId: "t1", quantity: 1 }),
    );
    expect(d.settle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tradeId: "t2", quantity: 2 }),
    );
  });

  it("reports which rows settled so their tally can be dropped", async () => {
    const d = deps();
    const result = await runSettleBatch(
      [
        { trade: trade("t1", "receiver", 1), quantity: 1 },
        { trade: trade("t2", "receiver", 1), quantity: 1 },
      ],
      d,
    );

    expect(result).toEqual({ pendingChoices: [], settledTradeIds: ["t1", "t2"], failed: false });
  });

  it("files the receiver's copies into the chosen collection", async () => {
    const d = deps();
    await runSettleBatch([{ trade: trade("t1", "receiver", 1), quantity: 1 }], {
      ...d,
      targetCollectionId: "col-7",
    });

    expect(d.settle).toHaveBeenCalledWith(expect.objectContaining({ targetCollectionId: "col-7" }));
  });

  it("never sends a target collection on the giver's side", async () => {
    // The giver is removing their own copies; there is nothing to file.
    const d = deps();
    await runSettleBatch([{ trade: trade("t1", "giver", 1), quantity: 1 }], {
      ...d,
      targetCollectionId: "col-7",
    });

    expect(d.settle).toHaveBeenCalledWith(
      expect.objectContaining({ targetCollectionId: undefined }),
    );
  });

  it("never reads copy options for the receiver", async () => {
    // The copies at stake are the other party's, and the route 403s a receiver.
    const d = deps();
    await runSettleBatch([{ trade: trade("t1", "receiver", 1), quantity: 1 }], d);

    expect(d.readCopyOptions).not.toHaveBeenCalled();
  });

  it("holds a giver's row back when the candidate copies differ", async () => {
    // Settling hard-deletes a specific card, so the per-row prompt has to
    // survive being batched rather than being skipped for speed.
    const held = trade("t1", "giver", 3);
    const d = deps({ readCopyOptions: vi.fn(async () => options(true)) });
    const result = await runSettleBatch([{ trade: held, quantity: 2 }], d);

    expect(d.settle).not.toHaveBeenCalled();
    expect(result.pendingChoices).toEqual([{ trade: held, quantity: 2, options: options(true) }]);
    expect(result.settledTradeIds).toEqual([]);
  });

  it("settles a giver's row unprompted when every candidate is alike", async () => {
    const d = deps();
    const result = await runSettleBatch([{ trade: trade("t1", "giver", 1), quantity: 1 }], d);

    expect(d.settle).toHaveBeenCalledTimes(1);
    expect(result.pendingChoices).toEqual([]);
  });

  it("settles a giver's row when the options read failed", async () => {
    // The read refines the settle, it does not gate it — the same fallback the
    // per-row button takes. A failure that matters resurfaces on the settle.
    const d = deps({ readCopyOptions: vi.fn(async () => null) });
    const result = await runSettleBatch([{ trade: trade("t1", "giver", 1), quantity: 1 }], d);

    expect(d.settle).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(false);
  });

  it("keeps going after a row fails, and says that it did", async () => {
    const settle = vi.fn(async (variables: { tradeId: string }) => {
      if (variables.tradeId === "t1") {
        throw new Error("gone");
      }
      return undefined;
    });
    const result = await runSettleBatch(
      [
        { trade: trade("t1", "receiver", 1), quantity: 1 },
        { trade: trade("t2", "receiver", 1), quantity: 1 },
      ],
      deps({ settle }),
    );

    expect(settle).toHaveBeenCalledTimes(2);
    expect(result.settledTradeIds).toEqual(["t2"]);
    expect(result.failed).toBe(true);
  });

  it("does nothing for an empty pile", async () => {
    const d = deps();
    const result = await runSettleBatch([], d);

    expect(d.settle).not.toHaveBeenCalled();
    expect(result).toEqual({ pendingChoices: [], settledTradeIds: [], failed: false });
  });
});
