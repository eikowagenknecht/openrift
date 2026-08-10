import { describe, expect, it } from "vitest";

import { cardTokenAtCaret } from "@/components/deck/deck-details-dialog";

describe("cardTokenAtCaret", () => {
  it("returns the partial name being typed after [[", () => {
    const text = "Open with [[Shad";
    expect(cardTokenAtCaret(text, text.length)).toBe("Shad");
  });

  it("returns an empty token right after the opening brackets", () => {
    const text = "Open with [[";
    expect(cardTokenAtCaret(text, text.length)).toBe("");
  });

  it("returns null outside a reference", () => {
    const text = "Open with Shadow Assault";
    expect(cardTokenAtCaret(text, text.length)).toBeNull();
  });

  it("returns null once the reference is closed", () => {
    const text = "Open with [[Shadow Assault]]";
    expect(cardTokenAtCaret(text, text.length)).toBeNull();
  });

  it("returns null when the caret is before the brackets", () => {
    const text = "Open with [[Shad";
    expect(cardTokenAtCaret(text, 5)).toBeNull();
  });

  it("does not match across line breaks", () => {
    const text = "Open with [[\nnew line";
    expect(cardTokenAtCaret(text, text.length)).toBeNull();
  });

  it("uses the caret position, not the end of the text", () => {
    const text = "Start [[Sha rest of the sentence";
    expect(cardTokenAtCaret(text, "Start [[Sha".length)).toBe("Sha");
  });
});
