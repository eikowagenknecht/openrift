import { describe, expect, it } from "vitest";

import { CREATOR_TOOLS } from "./creator-tools";

describe("CREATOR_TOOLS", () => {
  it("gives every tool a unique anchor id, since the tiles link to them", () => {
    const ids = CREATOR_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every tool a title and a blurb, which the tile renders", () => {
    for (const tool of CREATOR_TOOLS) {
      expect(tool.title).not.toBe("");
      expect(tool.blurb).not.toBe("");
    }
  });
});
