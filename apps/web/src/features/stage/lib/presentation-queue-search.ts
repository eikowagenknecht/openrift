/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { MAX_QUEUE_LENGTH } from "@/features/stage/lib/presentation-queue";

/**
 * Do not replace with a `.max()` refinement: combined with `.catch(undefined)`,
 * a failed `.max()` drops the whole queue, not just the excess.
 */
export const queueCardsSearchSchema = z
  .array(z.string())
  .transform((ids) => ids.slice(0, MAX_QUEUE_LENGTH))
  .optional()
  .catch(undefined);

/** Clearing `edit` here is required: carrying it forward makes this button a no-op once a queue has been presented. */
export function startPresentingSearch<T extends object>(
  prev: T,
  ids: readonly string[],
): Omit<T, "cards" | "i" | "edit"> & { cards: string[]; i: number; edit: undefined } {
  return { ...prev, cards: [...ids], i: 0, edit: undefined };
}

export function queueDraftSearch<T extends object>(
  prev: T,
  ids: readonly string[],
): Omit<T, "cards"> & { cards: string[] | undefined } {
  return { ...prev, cards: ids.length > 0 ? [...ids] : undefined };
}
