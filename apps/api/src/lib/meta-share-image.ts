import { formatRank, formatRecord } from "@openrift/shared";

import type { MetaDeckContextRow } from "../repositories/meta.js";

/** What an archived list's share image prints in place of its generated deck row. */
export interface MetaDeckImageFraming {
  deckName: string;
  /** Absent when the title already is the player's name, i.e. the list has no legend. */
  ownerName?: string;
  resultLine: string;
}

/** The archive framing for one deck share image: what the list is, who piloted it, and what it scored. */
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
