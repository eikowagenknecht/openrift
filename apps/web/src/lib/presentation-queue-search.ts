/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";

/**
 * The `?cards=` search param, shared by presentation mode and the overlay
 * dashboard so the two surfaces can't drift on how a queue URL is read.
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
