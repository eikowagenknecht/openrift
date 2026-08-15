/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";

/**
 * The `?cards=` search param the stage arrives with, and the one place the
 * queue's cap is applied to a URL.
 *
 * Over-long input is truncated to the limit rather than rejected. A `.max()`
 * refinement fails the whole param, and with the `.catch(undefined)` fallback
 * that turns a link with one card too many into an empty queue — losing every
 * card instead of the excess few. Truncation is idempotent, so the router
 * rewriting the shortened array back into the URL settles immediately.
 *
 * Lives apart from `presentation-queue.ts` because that module is imported by
 * the queue editor component, and this one drags zod in behind it.
 */
export const queueCardsSearchSchema = z
  .array(z.string())
  .transform((ids) => ids.slice(0, MAX_QUEUE_LENGTH))
  .optional()
  .catch(undefined);

/**
 * The search rewrite for "Start presenting": the queue as it stands, from the
 * top. `edit` is cleared explicitly — leaving a show writes `edit: true` into
 * the URL to reopen the builder, and carrying it forward here kept the builder
 * up, which made the button do nothing on any queue that had been presented
 * once already.
 *
 * @returns The next search params, with everything else preserved.
 */
export function startPresentingSearch<T extends object>(
  prev: T,
  ids: readonly string[],
): Omit<T, "cards" | "i" | "edit"> & { cards: string[]; i: number; edit: undefined } {
  return { ...prev, cards: [...ids], i: 0, edit: undefined };
}

/**
 * The search rewrite that keeps `?cards=` tracking the queue draft as it is
 * edited, so a refresh mid-build reopens the same queue and the URL in the bar
 * is always the link it looks like. An empty queue drops the param rather than
 * writing `cards=[]`, so a cleared builder returns to the bare /stage URL.
 *
 * @returns The next search params, with everything else preserved.
 */
export function queueDraftSearch<T extends object>(
  prev: T,
  ids: readonly string[],
): Omit<T, "cards"> & { cards: string[] | undefined } {
  return { ...prev, cards: ids.length > 0 ? [...ids] : undefined };
}
