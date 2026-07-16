import { describe, expect, it } from "vitest";

import { markdownTeaser } from "./markdown-teaser";

describe("markdownTeaser", () => {
  it("passes plain text through", () => {
    expect(markdownTeaser("Two ready-to-play decks.")).toBe("Two ready-to-play decks.");
  });

  it("returns an empty string for null and empty input", () => {
    expect(markdownTeaser(null)).toBe("");
    expect(markdownTeaser("")).toBe("");
    expect(markdownTeaser("   \n\n  ")).toBe("");
  });

  it("takes only the first paragraph", () => {
    expect(markdownTeaser("First paragraph.\n\nSecond paragraph.")).toBe("First paragraph.");
  });

  it("joins a wrapped paragraph into one line", () => {
    expect(markdownTeaser("Two decks\nfor two players.")).toBe("Two decks for two players.");
  });

  it("strips inline emphasis and code markers", () => {
    expect(markdownTeaser("A **complete** deck with *foil* `promos`.")).toBe(
      "A complete deck with foil promos.",
    );
    expect(markdownTeaser("__Strong__ and _subtle_.")).toBe("Strong and subtle.");
  });

  it("replaces links and images with their text", () => {
    expect(markdownTeaser("See [the full list](/products/kit) here.")).toBe(
      "See the full list here.",
    );
    expect(markdownTeaser("![box art](/media/box.webp) Included cards.")).toBe(
      "box art Included cards.",
    );
  });

  it("strips heading, list, and blockquote prefixes", () => {
    expect(markdownTeaser("## What's inside")).toBe("What's inside");
    expect(markdownTeaser("- One deck\n- Two dice")).toBe("One deck Two dice");
    expect(markdownTeaser("1. First\n2. Second")).toBe("First Second");
    expect(markdownTeaser("> A quoted intro")).toBe("A quoted intro");
  });
});
