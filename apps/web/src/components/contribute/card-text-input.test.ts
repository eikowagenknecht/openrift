import { describe, expect, it } from "vitest";

import { insertAtCaret } from "./card-text-input";

describe("insertAtCaret", () => {
  it("inserts a token at the caret in an empty value", () => {
    const result = insertAtCaret("", 0, 0, ":rb_might:");
    expect(result.value).toBe(":rb_might:");
    expect(result.caret).toBe(":rb_might:".length);
  });

  it("inserts a token at the caret in the middle of existing text", () => {
    const result = insertAtCaret("Pay  to draw", 4, 4, ":rb_energy_1:");
    expect(result.value).toBe("Pay :rb_energy_1: to draw");
    expect(result.caret).toBe(4 + ":rb_energy_1:".length);
  });

  it("replaces the selected range with the token", () => {
    const result = insertAtCaret("foo BAD bar", 4, 7, "[Shield]");
    expect(result.value).toBe("foo [Shield] bar");
    expect(result.caret).toBe(4 + "[Shield]".length);
  });

  it("clamps out-of-range selection bounds", () => {
    const result = insertAtCaret("abc", 99, 200, "X");
    expect(result.value).toBe("abcX");
    expect(result.caret).toBe(4);
  });

  it("treats inverted bounds as empty insertion at start", () => {
    const result = insertAtCaret("abcdef", 5, 2, "Z");
    expect(result.value).toBe("abcdeZf");
    expect(result.caret).toBe(6);
  });
});
