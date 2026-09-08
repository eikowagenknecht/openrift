import { defineContentScript } from "wxt/utils/define-content-script";

import type { PageExtract } from "@/lib/deck-extract";
import { extractDeckFromPage } from "@/lib/deck-extract";
import { deckSourceLink } from "@/lib/source-link";

// registration: "runtime" keeps this out of the manifest; the background
// script injects it on click and reads main()'s return as the result.
export default defineContentScript({
  registration: "runtime",
  main(): PageExtract {
    const pageUrl = globalThis.location.href;
    const deck = extractDeckFromPage(document, pageUrl);
    const sourceUrl = deckSourceLink(pageUrl);
    return sourceUrl === undefined ? { deck } : { deck, sourceUrl };
  },
});
