import { describe, expect, it } from "vitest";

import { descriptionSnippet } from "./description-snippet.js";

describe("descriptionSnippet", () => {
  it("returns null for null, undefined, and empty input", () => {
    expect(descriptionSnippet(null)).toBeNull();
    expect(descriptionSnippet(undefined)).toBeNull();
    expect(descriptionSnippet("")).toBeNull();
    expect(descriptionSnippet("   \n\n  ")).toBeNull();
  });

  it("passes plain text through unchanged", () => {
    expect(descriptionSnippet("Aggressive tempo list for locals.")).toBe(
      "Aggressive tempo list for locals.",
    );
  });

  it("strips heading, emphasis, and list markers", () => {
    expect(descriptionSnippet("# Game plan\n\nGo **wide**, then _finish_ with spells.")).toBe(
      "Game plan Go wide, then finish with spells.",
    );
    expect(descriptionSnippet("- curve out\n- hold protection\n1. win")).toBe(
      "curve out hold protection win",
    );
  });

  it("keeps link and card-link text, drops the syntax", () => {
    expect(
      descriptionSnippet("Built around [[Yasuo, Unforgiven]], see [guide](https://x.y)."),
    ).toBe("Built around Yasuo, Unforgiven, see guide.");
  });

  it("drops images and code blocks entirely, keeping image alt text", () => {
    expect(descriptionSnippet("![curve chart](img.png)\n```\n3x Card\n```\nNotes after.")).toBe(
      "curve chart Notes after.",
    );
  });

  it("removes an unterminated code fence to the end", () => {
    expect(descriptionSnippet("Intro.\n```\n3x Card")).toBe("Intro.");
  });

  it("collapses multi-line text to one line", () => {
    expect(descriptionSnippet("Line one.\n\nLine two.")).toBe("Line one. Line two.");
  });

  it("truncates at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim();
    const snippet = descriptionSnippet(long);
    expect(snippet).not.toBeNull();
    expect(snippet!.length).toBeLessThanOrEqual(141);
    expect(snippet!.endsWith("…")).toBe(true);
    expect(snippet).not.toContain("wor…");
  });

  it("cuts mid-word when the text is one giant token", () => {
    const snippet = descriptionSnippet("a".repeat(300), 40);
    expect(snippet).toBe(`${"a".repeat(40)}…`);
  });

  it("respects a custom max length", () => {
    expect(descriptionSnippet("one two three four", 9)).toBe("one two…");
  });
});
