# Browser Extension

`apps/extension` is a cross-browser extension (Chrome MV3, Firefox) that sends the decklist the user is viewing on an external deck site to OpenRift. It is built with [WXT](https://wxt.dev/) and shares the deck text codec with the rest of the monorepo through `@openrift/shared/deck-codecs`.

## Design

The extension is deliberately minimal.

- **`activeTab`, no host permissions.** It runs when the user clicks the toolbar icon, in that tab, once.
- **Thin extractor.** The injected script reads the decklist (card names, quantities, zones) from the DOM; parsing, matching, and saving happen on the OpenRift side.
- **Hand-off by deep link.** The result opens `https://openrift.app/decks/import?code=<payload>` in a new tab, where the user reviews the parse and saves. The import works logged-out (browser-local deck, claimed on login).

It imports the deck the user is looking at.

## How it works

`src/entrypoints/background.ts` listens for the toolbar click, injects `src/entrypoints/extract.content.ts` via `browser.scripting.executeScript` (WXT `registration: "runtime"`), and receives the extraction result as the script's return value. Extraction lives in `src/lib/deck-extract.ts` and tries, in order:

1. **Structured decklist table**
2. **Sectioned card-name list**
3. **Deck code fallback** — a Piltover Archive deck code found in the page URL (path/query/hash), in code-ish elements (`code`, `pre`, inputs, anything with "code" in a class name), or in link targets. Candidates are verified with a real decode via `isDeckCode`, so plausible-looking words don't match.

Unknown labels (card-type groupings like `unit`/`spell`) fold into the main deck. Sideboard lists are kept separate.

If nothing matches, a brief "?" badge appears on the toolbar icon and nothing else happens.

A deck name rides along: the page's `h1` is passed as `&name=` and prefills the deck-name field on the review step.

The import page's `?code=` parameter sniffs the payload format itself (`parseDeckImportAuto` in `apps/web/src/lib/deck-import-parsers.ts`), so text lists and compact codes both work in the same deep link.

## Development

```bash
bun run --cwd apps/extension dev            # Chrome dev mode with HMR
bun run --cwd apps/extension dev:firefox    # Firefox dev mode
bun run --cwd apps/extension build          # production build (.output/chrome-mv3)
bun run --cwd apps/extension build:firefox  # production build (.output/firefox-mv2)
bun run --cwd apps/extension zip            # store-ready zips for both browsers
bun run --cwd apps/extension test src/lib/deck-extract.test.ts
```

To point a local build at a dev instance, set `WXT_OPENRIFT_URL` in `apps/extension/.env` (see `src/lib/openrift-url.ts`).

To load an unpacked build: Chrome → `chrome://extensions` → Developer mode → "Load unpacked" → `.output/chrome-mv3`. Firefox → `about:debugging` → "Load Temporary Add-on" → any file in `.output/firefox-mv2`.

## Adding support for another site

If the site embeds a standard deck code in its URLs or pages, no work is needed. Otherwise add an extractor function to `src/lib/deck-extract.ts` and call it from `extractDeckFromPage` before the code fallback. Extractors match on markup shape and come with tests (see `deck-extract.test.ts` for the fixture style).
