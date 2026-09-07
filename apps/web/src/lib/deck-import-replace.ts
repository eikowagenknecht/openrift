import { isLocalDeckId } from "@/lib/local-deck";

export type ReplaceTarget =
  | { mode: "none" }
  | { mode: "local"; deckId: string }
  | { mode: "server"; deckId: string };

/**
 * A local: id must never go through the server (404s on the synthetic id); a
 * stale local id degrades to plain import instead.
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
