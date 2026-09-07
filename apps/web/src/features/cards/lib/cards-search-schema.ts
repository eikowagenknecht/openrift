/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { filterSearchSchema } from "@/features/cards/lib/search-schemas";

// `customTags` can leak in from a deck → /cards navigation without
// `customTagAssignments` wired in, matching zero printings; omit it here so beforeLoad strips it.
export const cardsSearchSchema = filterSearchSchema.omit({ customTags: true }).extend({
  printingId: z.string().optional().catch(undefined),
});
