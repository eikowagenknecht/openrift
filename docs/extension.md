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

So does the page's own address, as `&source=`, which the review step offers as an outbound deck link on the imported deck. Deck links are restricted to the allowlist in `packages/shared/src/link-hosts.ts`, so `src/lib/source-link.ts` drops anything not on it (along with `utm_*`-style tracking tags) rather than sending a link the import page would refuse. The URL is read in the page by the content script, not from `tab.url`, so it needs no permission beyond the injection itself. The import page re-checks it against `deckLinkSchema` regardless — the param is whatever the address bar says — and shows it as a removable chip, since a deck's links are public on its share page. Replace mode ignores it and keeps the target deck's own links.

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

## Distribution

**Firefox is the only published build.** AMO signs it through its _unlisted_ channel and hands the `.xpi` back for us to host. Signing is automated, usually a couple of minutes, with no human review. Firefox itself has no equivalent of Chrome's unlisted store listing: on AMO, "unlisted" means self-hosted, and the choice is binary.

Users install from one permanent URL:

```plaintext
https://github.com/openriftapp/openrift/releases/download/extension-updates/openrift-deck-importer.xpi
```

Every release re-uploads the signed build there under that fixed name, next to the update manifest, so nothing on the site needs updating when a version ships. AMO names the signed file after the version, which is why this renamed copy exists at all. The name lives in three places that cannot import from each other: `LATEST_XPI_FILE` in `src/lib/firefox-distribution.ts`, `LATEST_XPI` in the release workflow, and `SOCIAL_LINKS.extensionDownload` in `apps/web/src/lib/social-links.ts`.

**Chrome is not distributed.** The MV3 build exists and can be loaded unpacked (see Development above), but it is published nowhere, so there is no way for a user to install it. Whenever that changes it has to go through the Web Store: Chrome has hard-blocked off-store `.crx` installs on Windows and macOS since 2015, and every version is reviewed, which would make it the slower of the two channels by a wide margin.

### Releasing the Firefox build

1. Bump `version` in `apps/extension/package.json`. AMO signs each version exactly once, so a reused version fails the release.
2. Run the **Release Extension** workflow (`.github/workflows/release-extension.yml`) from the Actions tab.

It tests, builds, signs via AMO, generates the update manifest, and publishes two releases:

- `ext-v<version>` — the signed `.xpi` under AMO's own file name. Immutable, one per version.
- `extension-updates` — the update manifest plus a copy of the same `.xpi` as `openrift-deck-importer.xpi`, both rewritten in place every release.

Both are created with `--latest=false` so `semantic-release` keeps the repo's "latest release" pointer for the app.

Installed copies poll the manifest roughly every 24 hours; `about:addons` → Check for Updates forces it.

### Why a fixed tag

`update_url` is baked into every installed copy and an install can only learn a new location by first updating through the old one. So the URL can never change, and the manifest cannot live at `releases/latest/download/…` — GitHub's "latest release" is a single per-repo pointer that `semantic-release` claims on every app release, which would 404 the manifest as soon as the next app version shipped.

Hence the fixed `extension-updates` tag. **Do not delete that release or rename either asset.** Every installed copy polls the manifest, including ones dormant for months, and the site's install link points at the `.xpi` beside it.

### Required secrets

`AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, from the [AMO API credentials page](https://addons.mozilla.org/developers/addon/api/key/). The account needs 2FA enabled, and must be the one that owns the `extension@openrift.app` add-on id.

### Migrating to an AMO listing

Later, the extension can move to a public AMO listing without anyone reinstalling. AMO allows listed and unlisted versions under one add-on id, and an extension with no `update_url` falls back to AMO's update service keyed by that id. That is the whole mechanism.

Order matters:

1. **Get the listed version approved first**, with `update_url` removed from the manifest (AMO rejects it on listed versions). Doing this before step 2 matters — flipping testers over while review is pending strands them on a build with no update source at all.
2. **Ship one final self-distributed build with `update_url` removed**, through the existing `extension-updates` manifest.
3. Firefox finds no update source in that build, asks AMO, and pulls the higher listed version. Migration done in a day or two.

Version numbers are unique across both channels on one id, and the listed version must be higher — e.g. self-hosted `0.4.0` → transition `0.4.1` → listed `0.5.0`. Don't burn a high number on the self-hosted side.

Keep the `extension-updates` release alive well past the switch. Someone who hasn't opened Firefox in months still polls it on next launch, and a 404 strands that install permanently.

## Adding support for another site

If the site embeds a standard deck code in its URLs or pages, no work is needed. Otherwise add an extractor function to `src/lib/deck-extract.ts` and call it from `extractDeckFromPage` before the code fallback. Extractors match on markup shape and come with tests (see `deck-extract.test.ts` for the fixture style).
