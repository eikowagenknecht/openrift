import type { Repos } from "../deps.js";
import { withUniqueShareToken } from "../lib/share-token.js";
import type { MetaArchivedDeckInput, MetaEventPlayerInput } from "../repositories/meta.js";

interface CreatedMetaEventPlayer {
  metaEventPlayerId: string;
  deckId: string | null;
  shareToken: string | null;
}

export async function createMetaEventPlayer(
  meta: Repos["meta"],
  input: MetaEventPlayerInput,
): Promise<CreatedMetaEventPlayer | undefined> {
  if (input.deck === null) {
    const created = await meta.createPlayer(input, null);
    return created === undefined ? undefined : { ...created, shareToken: null };
  }
  // Retry only catches decks_share_token_key violations; a violation from
  // deck_cards or the standings insert must propagate as a real fault.
  return withUniqueShareToken<CreatedMetaEventPlayer | undefined>(
    async (shareToken) => {
      const created = await meta.createPlayer(input, shareToken);
      return created === undefined ? undefined : { ...created, shareToken };
    },
    { constraint: "decks_share_token_key" },
  );
}

export function setMetaPlayerList(
  meta: Repos["meta"],
  metaEventPlayerId: string,
  deck: MetaArchivedDeckInput,
  options?: { preserveName?: boolean },
): Promise<{ deckId: string } | undefined> {
  // Never rotates the share token: an already-published link must keep resolving.
  return withUniqueShareToken(
    (shareToken) => meta.setPlayerDeck(metaEventPlayerId, deck, shareToken, options),
    { constraint: "decks_share_token_key" },
  );
}
