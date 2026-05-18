/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { z } from "zod";

import { filterSearchSchema } from "@/lib/search-schemas";

// `customTags` is a deck-builder concept (see CARD_BROWSER_HIDDEN_LOGGED_IN in
// card-browser.tsx). The /cards UI hides the section, but the param still ends
// up in the URL when navigating from a deck → /cards with preserved search.
// Without assignments wired in, the filter matches zero printings and the grid
// goes empty. Omit it from the schema so the existing beforeLoad redirect
// strips it from the URL on entry.
export const cardsSearchSchema = filterSearchSchema.omit({ customTags: true }).extend({
  printingId: z.string().optional().catch(undefined),
});

export type CardsSearch = z.infer<typeof cardsSearchSchema>;
