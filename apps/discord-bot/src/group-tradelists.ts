import type { ApiClients } from "./api-client.js";

/** Tradelist info for a card in one guild's linked group, ready for the embed. */
export interface TradelistHolders {
  groupName: string | null;
  holders: { userName: string | null; quantity: number }[];
}

/**
 * Which members of the guild's linked OpenRift group offer the card on a
 * shared tradelist. Every "nothing to show" case collapses to null — feature
 * off (no service secret), not in a guild, guild not linked, nobody offers
 * the card, or the lookup failed — so callers just skip the embed field.
 *
 * @returns The holders to display, or null when there is nothing to show.
 */
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
