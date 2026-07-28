import { isLocalDeckId } from "@/stores/local-decks-store";

/** How the deck import page's replace mode targets `replaceDeckId`. */
export type ReplaceTarget =
  | { mode: "none" }
  | { mode: "local"; deckId: string }
  | { mode: "server"; deckId: string };

/**
 * Decides what the import page's replace mode targets. A `local:` id targets
 * the browser-local deck regardless of session — its cards live in this
 * browser, so replacing must never go through the server (which would 404 on
 * the synthetic id). A stale local id whose deck no longer exists degrades to
 * plain import, since writing to a missing local deck is a silent no-op. A
 * server id needs a session to fetch and save the deck.
 * @returns The resolved replace target.
 */
export function resolveReplaceTarget(
  replaceDeckId: string | undefined,
  hasSession: boolean,
  localDeckExists: (id: string) => boolean,
): ReplaceTarget {
  if (!replaceDeckId) {
    return { mode: "none" };
  }
  if (isLocalDeckId(replaceDeckId)) {
    return localDeckExists(replaceDeckId)
      ? { mode: "local", deckId: replaceDeckId }
      : { mode: "none" };
  }
  return hasSession ? { mode: "server", deckId: replaceDeckId } : { mode: "none" };
}
