import type { ApiClients } from "./api-client.js";

export interface TradelistHolderPrinting {
  printingId: string;
  quantity: number;
  listNames: string[];
}

export interface TradelistHolders {
  groupName: string | null;
  holders: {
    userName: string | null;
    quantity: number;
    printings: TradelistHolderPrinting[];
  }[];
}

/** Null covers every "nothing to show" case (feature off, unlinked, no offers, lookup failure). */
export async function fetchTradelistHolders(
  api: ApiClients,
  guildId: string | null | undefined,
  cardId: string,
): Promise<TradelistHolders | null> {
  if (!api.discordBot || !guildId) {
    return null;
  }
  try {
    const response = await api.discordBot.tradelistHolders({ guildId, cardId });
    if (!response.linked || response.holders.length === 0) {
      return null;
    }
    return { groupName: response.groupName, holders: response.holders };
  } catch (error) {
    console.error("tradelist-holders lookup failed", error);
    return null;
  }
}
