// Self-distribution wiring for the Firefox build. Mozilla signs the extension
// through AMO's unlisted channel and hands the .xpi back for us to host, so
// Firefox needs somewhere to poll for new versions. That is the update manifest
// below, published to GitHub Releases by .github/workflows/release-extension.yml.
//
// See docs/extension.md for the release flow and the eventual migration to an
// AMO-listed add-on.

/** The add-on id AMO signs against. Changing it orphans every existing install. */
export const ADDON_ID = "extension@openrift.app";

const REPO = "openriftapp/openrift";

/**
 * The release tag that always carries the current update manifest.
 *
 * A fixed tag rather than `releases/latest/download/...`: GitHub's "latest
 * release" is one pointer per repo, and semantic-release claims it on every app
 * release, which would 404 the manifest as soon as the next app version ships.
 * This tag holds only the manifest and is updated in place.
 */
const UPDATE_MANIFEST_TAG = "extension-updates";

/**
 * File name of the update manifest, both as a release asset and on disk.
 *
 * Kept in step with `MANIFEST_TAG` and the file name in
 * .github/workflows/release-extension.yml, which cannot import from here.
 */
const UPDATE_MANIFEST_FILE = "firefox-updates.json";

/**
 * Where Firefox polls for updates. Baked into every installed copy, so it can
 * never change: an install only learns a new location by first updating through
 * the old one.
 */
export const UPDATE_MANIFEST_URL = `https://github.com/${REPO}/releases/download/${UPDATE_MANIFEST_TAG}/${UPDATE_MANIFEST_FILE}`;

/**
 * Builds the release tag holding a given version's signed .xpi. Prefixed to
 * stay clear of semantic-release's `v${version}` tags for the app itself.
 * @returns The git tag name for that extension release.
 */
export function extensionReleaseTag(version: string): string {
  return `ext-v${version}`;
}

/**
 * Builds the download URL for a version's signed .xpi.
 * @returns The absolute GitHub release asset URL.
 */
export function xpiDownloadUrl(version: string, fileName: string): string {
  return `https://github.com/${REPO}/releases/download/${extensionReleaseTag(version)}/${fileName}`;
}

/** One entry in the update manifest's version list. */
interface UpdateEntry {
  version: string;
  update_link: string;
  update_hash: string;
}

/** The Firefox update manifest shape, keyed by add-on id. */
export interface UpdateManifest {
  addons: Record<string, { updates: UpdateEntry[] }>;
}

/**
 * Builds the Firefox update manifest for a signed build.
 *
 * Only the current version is listed. Firefox picks the highest version it can
 * install, so older entries earn nothing and go stale as their assets age out.
 * @returns The manifest object, ready to serialize as JSON.
 */
export function buildUpdateManifest(options: {
  version: string;
  xpiUrl: string;
  sha256: string;
}): UpdateManifest {
  return {
    addons: {
      [ADDON_ID]: {
        updates: [
          {
            version: options.version,
            update_link: options.xpiUrl,
            update_hash: `sha256:${options.sha256}`,
          },
        ],
      },
    },
  };
}
