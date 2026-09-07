// Mozilla signs the extension through AMO's unlisted channel and hands the
// .xpi back for us to host, so Firefox needs somewhere to poll for updates.
// See docs/extension.md for the release flow.

export const ADDON_ID = "extension@openrift.app";

const REPO = "openriftapp/openrift";

// A fixed tag, not `releases/latest/download/...`: semantic-release claims
// GitHub's "latest release" pointer on every app release.
const UPDATE_MANIFEST_TAG = "extension-updates";

const UPDATE_MANIFEST_FILE = "firefox-updates.json";

export const UPDATE_MANIFEST_URL = `https://github.com/${REPO}/releases/download/${UPDATE_MANIFEST_TAG}/${UPDATE_MANIFEST_FILE}`;

const LATEST_XPI_FILE = "openrift-deck-importer.xpi";

export const LATEST_XPI_URL = `https://github.com/${REPO}/releases/download/${UPDATE_MANIFEST_TAG}/${LATEST_XPI_FILE}`;

export function extensionReleaseTag(version: string): string {
  return `ext-v${version}`;
}

export function xpiDownloadUrl(version: string, fileName: string): string {
  return `https://github.com/${REPO}/releases/download/${extensionReleaseTag(version)}/${fileName}`;
}

interface UpdateEntry {
  version: string;
  update_link: string;
  update_hash: string;
}

export interface UpdateManifest {
  addons: Record<string, { updates: UpdateEntry[] }>;
}

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
