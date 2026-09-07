import { defineConfig } from "wxt";

import { ADDON_ID, UPDATE_MANIFEST_URL } from "./src/lib/firefox-distribution";

export default defineConfig({
  srcDir: "src",
  // oxlint needs explicit imports; auto-import hides each identifier's origin from it.
  imports: false,
  manifest: ({ browser }) => ({
    name: "OpenRift Deck Importer",
    description: "Send the decklist you are viewing to your OpenRift account.",
    permissions: ["activeTab", "scripting"],
    // No popup: clicking the toolbar icon triggers the import directly.
    action: {},
    // Drop update_url when migrating to an AMO-listed add-on: AMO rejects it
    // on listed versions. See docs/extension.md.
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: { id: ADDON_ID, update_url: UPDATE_MANIFEST_URL },
      },
    }),
  }),
});
