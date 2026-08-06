import { defineConfig } from "wxt";

import { ADDON_ID, UPDATE_MANIFEST_URL } from "./src/lib/firefox-distribution";

// Cross-browser extension (Chrome MV3, Firefox) that sends the decklist the
// user is viewing to OpenRift: the toolbar click reads the deck from the
// current tab and opens the OpenRift import page with it in a new tab.
// See docs/extension.md.
export default defineConfig({
  srcDir: "src",
  // Explicit imports instead of WXT's auto-import magic, so oxlint sees every
  // identifier's origin.
  imports: false,
  manifest: ({ browser }) => ({
    name: "OpenRift Deck Importer",
    description: "Send the decklist you are viewing to your OpenRift account.",
    permissions: ["activeTab", "scripting"],
    // No popup: clicking the toolbar icon triggers the import directly.
    action: {},
    // AMO requires a stable add-on id for signing. `update_url` makes this a
    // self-distributed build: AMO signs it through the unlisted channel and we
    // host the .xpi ourselves, so Firefox needs somewhere to poll.
    //
    // Drop `update_url` when migrating to an AMO-listed add-on — AMO rejects it
    // on listed versions, and its absence is what hands existing installs over
    // to AMO's update service. See docs/extension.md.
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: { id: ADDON_ID, update_url: UPDATE_MANIFEST_URL },
      },
    }),
  }),
});
