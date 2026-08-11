import type { CardTradeCopyOptionsResponse, CardTradeResponse } from "@openrift/shared";

/** One row's settle, as the batch runner takes it. */
export interface SettleStep {
  trade: CardTradeResponse;
  /** How many copies turned up. Always 1 or more; a row at 0 is not a step. */
  quantity: number;
}

/** A giver's row the batch held back, because the candidate copies differ. */
export interface PendingSettleChoice {
  trade: CardTradeResponse;
  quantity: number;
  options: CardTradeCopyOptionsResponse;
}

export interface SettleBatchResult {
  /** Rows that need the giver to say which copies left before they can settle. */
  pendingChoices: PendingSettleChoice[];
  /** Rows that settled, so their tally can be forgotten. */
  settledTradeIds: string[];
  /** True when a row failed, which the caller reports as partial progress. */
  failed: boolean;
}

export interface SettleBatchDeps {
  settle: (variables: {
    tradeId: string;
    groupSlug: string;
    quantity: number;
    targetCollectionId?: string;
  }) => Promise<unknown>;
  /** Reads the giver's candidate copies, or null when the read failed. */
  readCopyOptions: (tradeId: string) => Promise<CardTradeCopyOptionsResponse | null>;
  /** Where the receiver's copies land. Undefined means their inbox. */
  targetCollectionId?: string;
}

/**
 * Settles a tallied pile, one row at a time.
 *
 * A giver's row is held back rather than settled when its candidate copies
 * differ from one another. The settle hard-deletes a specific card with no way
 * back (ADR-019, amendment 2026-08-10), so the prompt the per-row button raises
 * has to survive being batched, and the options read is what decides whether
 * there is anything to prompt about. Rows with nothing to choose between go
 * through unprompted, which is the usual case and keeps the whole pile one
 * press. The receiver is never asked: the copies at stake are the other party's.
 *
 * One row failing does not stop the rest. Standing at a table, the useful
 * outcome is that everything that can settle does, with the caller saying so.
 * @returns What settled, what still needs a choice, and whether anything failed.
 */
export async function runSettleBatch(
  steps: readonly SettleStep[],
  deps: SettleBatchDeps,
): Promise<SettleBatchResult> {
  const pendingChoices: PendingSettleChoice[] = [];
  const settledTradeIds: string[] = [];
  let failed = false;

  for (const step of steps) {
    const { trade, quantity } = step;
    if (trade.role === "giver") {
      const options = await deps.readCopyOptions(trade.id);
      if (options !== null && options.choiceMatters) {
        pendingChoices.push({ trade, quantity, options });
        continue;
      }
    }
    try {
      await deps.settle({
        tradeId: trade.id,
        groupSlug: trade.groupSlug,
        quantity,
        targetCollectionId: trade.role === "receiver" ? deps.targetCollectionId : undefined,
      });
      settledTradeIds.push(trade.id);
    } catch {
      // The global mutation toast has already said why this row failed; the
      // caller adds that the rows around it did go through.
      failed = true;
    }
  }

  return { pendingChoices, settledTradeIds, failed };
}
