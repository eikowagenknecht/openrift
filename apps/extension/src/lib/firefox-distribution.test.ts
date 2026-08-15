import { describe, expect, it } from "vitest";

import {
  ADDON_ID,
  buildUpdateManifest,
  extensionReleaseTag,
  LATEST_XPI_URL,
  UPDATE_MANIFEST_URL,
  xpiDownloadUrl,
} from "./firefox-distribution";

describe("UPDATE_MANIFEST_URL", () => {
  // Baked into every install, so a change here strands everyone already on the
  // old URL. Pinned literally: this test failing means the migration in
  // docs/extension.md is required, not that the constant should be re-copied.
  it("points at the fixed release tag, not the moving latest pointer", () => {
    expect(UPDATE_MANIFEST_URL).toBe(
      "https://github.com/openriftapp/openrift/releases/download/extension-updates/firefox-updates.json",
    );
  });

  it("is served over https, which Firefox requires for update manifests", () => {
    expect(UPDATE_MANIFEST_URL.startsWith("https://")).toBe(true);
  });
});

describe("LATEST_XPI_URL", () => {
  // The site links here, and the release workflow writes the asset under this
  // exact name. Pinned literally so a rename has to be a deliberate edit in
  // both places (plus SOCIAL_LINKS.extensionDownload in apps/web), not a
  // silently 404ing install link.
  it("points at the fixed tag under the stable file name", () => {
    expect(LATEST_XPI_URL).toBe(
      "https://github.com/openriftapp/openrift/releases/download/extension-updates/openrift-deck-importer.xpi",
    );
  });

  it("shares the manifest's tag, so one release write keeps both current", () => {
    const tagPath = "/releases/download/extension-updates/";

    expect(LATEST_XPI_URL).toContain(tagPath);
    expect(UPDATE_MANIFEST_URL).toContain(tagPath);
  });

  it("carries no version, unlike the per-release asset URL", () => {
    expect(LATEST_XPI_URL).not.toContain("ext-v");
  });
});

describe("extensionReleaseTag", () => {
  it("prefixes the version so app tags from semantic-release stay distinct", () => {
    expect(extensionReleaseTag("0.2.0")).toBe("ext-v0.2.0");
  });

  it("does not collide with the plain v-prefixed tag format semantic-release uses", () => {
    expect(extensionReleaseTag("1.4.2")).not.toBe("v1.4.2");
  });
});

describe("xpiDownloadUrl", () => {
  it("builds a versioned release asset URL", () => {
    expect(xpiDownloadUrl("0.2.0", "openrift_deck_importer-0.2.0.xpi")).toBe(
      "https://github.com/openriftapp/openrift/releases/download/ext-v0.2.0/openrift_deck_importer-0.2.0.xpi",
    );
  });

  it("keeps the signed file name verbatim, since AMO decides it", () => {
    expect(xpiDownloadUrl("1.0.0", "some_other-1.0.0.xpi")).toContain("/some_other-1.0.0.xpi");
  });
});

describe("buildUpdateManifest", () => {
  const manifest = buildUpdateManifest({
    version: "0.2.0",
    xpiUrl: "https://example.test/openrift-0.2.0.xpi",
    sha256: "abc123",
  });

  it("keys the add-on by the signed gecko id", () => {
    expect(Object.keys(manifest.addons)).toEqual([ADDON_ID]);
  });

  it("lists only the current version", () => {
    expect(manifest.addons[ADDON_ID]?.updates).toHaveLength(1);
    expect(manifest.addons[ADDON_ID]?.updates[0]?.version).toBe("0.2.0");
  });

  it("prefixes the hash with its algorithm, as the manifest format requires", () => {
    expect(manifest.addons[ADDON_ID]?.updates[0]?.update_hash).toBe("sha256:abc123");
  });

  it("points update_link at the given xpi URL", () => {
    expect(manifest.addons[ADDON_ID]?.updates[0]?.update_link).toBe(
      "https://example.test/openrift-0.2.0.xpi",
    );
  });

  it("serializes to the shape Firefox parses", () => {
    // Round-tripped through JSON on purpose: the manifest is only ever consumed
    // as a file on disk, so the serialized form is what has to be right.
    const serialized = JSON.stringify(manifest);
    expect(JSON.parse(serialized)).toEqual({
      addons: {
        "extension@openrift.app": {
          updates: [
            {
              version: "0.2.0",
              update_link: "https://example.test/openrift-0.2.0.xpi",
              update_hash: "sha256:abc123",
            },
          ],
        },
      },
    });
  });
});
