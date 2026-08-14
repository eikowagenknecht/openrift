import type { Repos } from "../deps.js";
import { withUniqueShareToken } from "../lib/share-token.js";
import type { MetaDeckInput, MetaDeckPatch } from "../repositories/meta.js";

/**
 * Mints one archived deck: the `decks` row under the synthetic archive owner,
 * its cards, and the `meta_decks` satellite row, in the repo's transaction.
 *
 * Both paths that create archived decks go through here — the admin's manual
 * "paste a deck code" form and the candidate accept (ADR-014) — so the owner,
 * the public flag, and the share token are stamped in exactly one place.
 *
 * An archetype-only deck (`listStatus: "archetype"`) gets no token at all: it
 * has no public page, so there is nothing for a permalink to address. A partial
 * list does get one, since its main deck is there to render. The archetype
 * gains its token when it is promoted, through {@link updateArchivedDeck}.
 *
 * The token is minted outside the transaction and a collision retries the whole
 * thing, because the collision invalidates the insert that carried the token,
 * not just the column. The retry is pinned to the token's own constraint: this
 * transaction also writes `deck_cards` and `meta_decks`, and a unique violation
 * from either of those is a real fault that must surface as itself instead of
 * being re-attempted twice and reported as a token collision.
 *
 * @param meta The meta-archive repo.
 * @param input The deck, its cards, and its placement.
 * @returns The new deck's id and share token (null when archetype-only), or
 *   `undefined` when the event doesn't exist.
 */
export async function createArchivedDeck(
  meta: Repos["meta"],
  input: MetaDeckInput,
): Promise<{ deckId: string; shareToken: string | null } | undefined> {
  if (input.listStatus === "archetype") {
    const created = await meta.createDeck(input, null);
    return created === undefined ? undefined : { deckId: created.deckId, shareToken: null };
  }
  return withUniqueShareToken(
    async (shareToken) => {
      const created = await meta.createDeck(input, shareToken);
      return created === undefined ? undefined : { deckId: created.deckId, shareToken };
    },
    { constraint: "decks_share_token_key" },
  );
}

/**
 * Applies a patch to an archived deck, minting the permalink when the patch is
 * what promotes an archetype into a deck with a main list.
 *
 * Every update path goes through here — the admin PATCH and the candidate
 * accept's diff apply — because a deck that leaves `"archetype"` must gain its
 * token in the same step. A page that only exists once the list does is the
 * whole point of withholding the token, and two copies of that rule would
 * eventually disagree.
 *
 * The token is only ever added, never removed or rotated: a deck demoted back
 * to `"archetype"` keeps the token it already had, so links already published
 * do not rot. What makes the page disappear is the read path, which refuses an
 * archetype whatever its token says.
 *
 * @param meta The meta-archive repo.
 * @param deckId The archived deck to update.
 * @param patch The fields to write.
 * @returns Whether the archived deck existed.
 */
export async function updateArchivedDeck(
  meta: Repos["meta"],
  deckId: string,
  patch: MetaDeckPatch,
): Promise<boolean> {
  if (patch.listStatus === undefined || patch.listStatus === "archetype") {
    return meta.updateDeck(deckId, patch);
  }

  const state = await meta.deckShareState(deckId);
  if (state === undefined) {
    return false;
  }
  if (state.shareToken !== null) {
    return meta.updateDeck(deckId, patch);
  }

  return withUniqueShareToken((shareToken) => meta.updateDeck(deckId, { ...patch, shareToken }), {
    constraint: "decks_share_token_key",
  });
}
