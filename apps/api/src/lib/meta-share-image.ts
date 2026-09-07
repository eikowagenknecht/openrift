import { formatRank, formatRecord } from "@openrift/shared";

import type { MetaDeckContextRow } from "../repositories/meta.js";

export interface MetaDeckImageFraming {
  deckName: string;
  ownerName?: string;
  resultLine: string;
}

export function metaDeckImageFraming(
  context: MetaDeckContextRow,
  legendName: string | null,
): MetaDeckImageFraming {
  const player = context.playerName;
  const finish = formatRank(context.rank, context.rankIsTier);
  const fieldSize = context.eventPlayerCount;
  const parts = [
    fieldSize !== null && fieldSize > 0
      ? `${finish} of ${fieldSize.toLocaleString("en-US")}`
      : finish,
    formatRecord(context.wins, context.losses, context.draws),
    context.eventName,
  ];

  return {
    deckName: legendName ?? (player === "" ? context.eventName : player),
    ownerName: legendName !== null && player !== "" ? player : undefined,
    resultLine: parts.filter((part) => part !== null && part !== "").join(" · "),
  };
}
