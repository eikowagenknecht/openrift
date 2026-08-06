import { defineContentScript } from "wxt/utils/define-content-script";

import { extractDeckFromPage } from "../lib/deck-extract";

// Injected on demand by the background script when the user clicks the
// toolbar icon (registration: "runtime" keeps it out of the manifest). The
// return value of main() travels back to the background script as the
// executeScript result.
export default defineContentScript({
  registration: "runtime",
  main() {
    return extractDeckFromPage(document, globalThis.location.href);
  },
});
