import { describe, expect, it } from "vitest";

import { imageUrl } from "./image-url.js";

describe("imageUrl", () => {
  it("shards into a directory named by the id's last two hex characters", () => {
    expect(imageUrl("019d02f1-d14f-769f-9295-9852db692dbe", "full")).toBe(
      "/media/cards/be/019d02f1-d14f-769f-9295-9852db692dbe-full.webp",
    );
  });

  it("names the file after the requested variant", () => {
    const id = "019d02f1-d14f-769f-9295-9852db692dbe";
    expect(imageUrl(id, "120w")).toBe(`/media/cards/be/${id}-120w.webp`);
    expect(imageUrl(id, "240w")).toBe(`/media/cards/be/${id}-240w.webp`);
    expect(imageUrl(id, "400w")).toBe(`/media/cards/be/${id}-400w.webp`);
  });

  it("uses the whole id as the directory when it is shorter than two characters", () => {
    expect(imageUrl("a", "full")).toBe("/media/cards/a/a-full.webp");
  });
});
