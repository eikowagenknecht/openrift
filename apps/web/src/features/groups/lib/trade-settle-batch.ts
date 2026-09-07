import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";

export interface SettleStep {
  trade: CardTradeResponse;
  quantity: number;
}

export interface PendingSettleChoice {
  trade: CardTradeResponse;
  quantity: number;
  options: CardTradeCopyOptionsResponse;
}

export interface SettleBatchResult {
  pendingChoices: PendingSettleChoice[];
  settledTradeIds: string[];
  failed: boolean;
}

export interface SettleBatchDeps {
  settle: (variables: {
    tradeId: string;
    groupSlug?: string;
    quantity: number;
    targetCollectionId?: string;
  }) => Promise<unknown>;
  readCopyOptions: (tradeId: string) => Promise<CardTradeCopyOptionsResponse | null>;
  targetCollectionId?: string;
}

// Settle hard-deletes a specific copy irreversibly, so a giver's row is held
// back for a choice when its candidate copies differ; the receiver is never asked.
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
        groupSlug: trade.groupSlug ?? undefined,
        quantity,
        targetCollectionId: trade.role === "receiver" ? deps.targetCollectionId : undefined,
      });
      settledTradeIds.push(trade.id);
    } catch {
      // The global mutation toast already reported this row's failure.
      failed = true;
    }
  }

  return { pendingChoices, settledTradeIds, failed };
}
