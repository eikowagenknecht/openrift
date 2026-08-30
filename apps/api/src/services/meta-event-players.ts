import type { Repos } from "../deps.js";
import { withUniqueShareToken } from "../lib/share-token.js";
import type { MetaArchivedDeckInput, MetaEventPlayerInput } from "../repositories/meta.js";

/**
 * Mints one standings row, and the archived deck behind it when a list is
 * known: the `decks` row under the synthetic archive owner, its cards, and the
 * link, all in the repo's transaction.
 *
 * Both paths that create standings rows go through here — the admin's manual
 * form and the candidate accept — so the owner, the public flag, and the share
 * token are stamped in exactly one place.
 *
 * A standings-only entry gets no token at all: it has no public page, so there
 * is nothing for a permalink to address. It gains one if a list ever lands,
 * through {@link setMetaPlayerList}.
 *
 * The token is minted outside the transaction and a collision retries the whole
 * thing, because the collision invalidates the insert that carried the token,
 * not just the column. The retry is pinned to the token's own constraint: this
 * transaction also writes `deck_cards` and the standings row, and a unique
 * violation from either of those is a real fault that must surface as itself
 * instead of being re-attempted twice and reported as a token collision.
 *
 * Returns the new row's ids, or `undefined` when the event doesn't exist.
 */
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
  return withUniqueShareToken<CreatedMetaEventPlayer | undefined>(
    async (shareToken) => {
      const created = await meta.createPlayer(input, shareToken);
      return created === undefined ? undefined : { ...created, shareToken };
    },
    { constraint: "decks_share_token_key" },
  );
}

/**
 * Attaches a decklist to a standings row, or replaces the one already there.
 *
 * Every path that gives an entry a list goes through here — the admin PATCH and
 * the candidate accept alike — because an entry that leaves `"none"` has to
 * gain its permalink in the same step. A page that only exists once the list
 * does is the whole point of withholding the token, and two copies of that rule
 * would eventually disagree.
 *
 * A replacement keeps the token the deck already has: it is only ever added,
 * never rotated, so links already published do not rot.
 *
 * Returns the deck's id, or `undefined` when the standings row is gone.
 */
export function setMetaPlayerList(
  meta: Repos["meta"],
  metaEventPlayerId: string,
  deck: MetaArchivedDeckInput,
): Promise<{ deckId: string } | undefined> {
  return withUniqueShareToken(
    (shareToken) => meta.setPlayerDeck(metaEventPlayerId, deck, shareToken),
    { constraint: "decks_share_token_key" },
  );
}
