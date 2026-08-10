import { defineContentScript } from "wxt/utils/define-content-script";

import type { PageExtract } from "../lib/deck-extract";
import { extractDeckFromPage } from "../lib/deck-extract";
import { deckSourceLink } from "../lib/source-link";

// Injected on demand by the background script when the user clicks the
// toolbar icon (registration: "runtime" keeps it out of the manifest). The
// return value of main() travels back to the background script as the
// executeScript result.
export default defineContentScript({
  registration: "runtime",
  main(): PageExtract {
    const pageUrl = globalThis.location.href;
    const deck = extractDeckFromPage(document, pageUrl);
    const sourceUrl = deckSourceLink(pageUrl);
    return sourceUrl === undefined ? { deck } : { deck, sourceUrl };
  },
});
