import { describe, expect, it } from "vitest";

import { gravatarHashForEmail } from "./gravatar.js";

describe("gravatarHashForEmail", () => {
  it("returns the SHA-256 hex digest of the normalised email", () => {
    expect(gravatarHashForEmail("ada@example.com")).toBe(
      "b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72",
    );
  });

  it("trims and lowercases before hashing", () => {
    expect(gravatarHashForEmail("  Ada@Example.COM ")).toBe(
      gravatarHashForEmail("ada@example.com"),
    );
  });
});
