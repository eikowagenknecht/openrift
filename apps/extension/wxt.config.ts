import { defineConfig } from "wxt";

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
    // AMO requires a stable add-on id for signing.
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: "extension@openrift.app" } },
    }),
  }),
});
