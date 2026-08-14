import { describe, expect, it } from "vitest";

import { CREATOR_TOOLS, visibleCreatorTools } from "./creator-tools";

const ALL_ON = { "tier-lists": true, overlay: true };
const ALL_OFF = { "tier-lists": false, overlay: false };

describe("visibleCreatorTools", () => {
  it("shows everything when both flags are on", () => {
    expect(visibleCreatorTools(ALL_ON)).toHaveLength(CREATOR_TOOLS.length);
  });

  it("keeps only the unflagged tools when both flags are off", () => {
    expect(visibleCreatorTools(ALL_OFF).map((tool) => tool.id)).toEqual([
      "chat-command",
      "segments",
    ]);
  });

  it("treats a missing flag as off, so a renamed flag hides its tile", () => {
    expect(visibleCreatorTools({}).map((tool) => tool.id)).toEqual(["chat-command", "segments"]);
  });

  it("gates each flag independently", () => {
    const tierListsOnly = visibleCreatorTools({ "tier-lists": true, overlay: false });
    expect(tierListsOnly.map((tool) => tool.id)).toContain("tier-lists");
    expect(tierListsOnly.map((tool) => tool.id)).not.toContain("stage");

    const overlayOnly = visibleCreatorTools({ "tier-lists": false, overlay: true });
    expect(overlayOnly.map((tool) => tool.id)).toContain("stage");
    expect(overlayOnly.map((tool) => tool.id)).not.toContain("tier-lists");
  });

  it("keeps declaration order, so the grid never reshuffles as flags flip", () => {
    const visible = visibleCreatorTools(ALL_ON).map((tool) => tool.id);
    expect(visible).toEqual(CREATOR_TOOLS.map((tool) => tool.id));
  });

  it("gives every tool a unique anchor id, since the tiles link to them", () => {
    const ids = CREATOR_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
