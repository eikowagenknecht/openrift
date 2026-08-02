import { describe, expect, it } from "vitest";

import { imageRehostedUrl } from "./paths.js";

describe("imageRehostedUrl", () => {
  it("builds the canonical rehosted URL using last 2 chars of UUID", () => {
    expect(imageRehostedUrl("00594247-a18a-4efd-8998-105449a4cf40")).toBe(
      "/media/cards/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });
});
