import { describe, expect, it } from "vitest";

import type { CardTextToken } from "./card-text";
import { tokenizeCardText } from "./card-text";

function text(value: string): CardTextToken {
  return { type: "text", value };
}
function glyph(name: string): CardTextToken {
  return { type: "glyph", name };
}
function keyword(name: string, ...children: CardTextToken[]): CardTextToken {
  return { type: "keyword", name, children: children.length > 0 ? children : [text(name)] };
}
function paren(...children: CardTextToken[]): CardTextToken {
  return { type: "paren", children };
}
function italic(...children: CardTextToken[]): CardTextToken {
  return { type: "italic", children };
}
const newline: CardTextToken = { type: "newline" };

describe("tokenizeCardText", () => {
  it("returns plain text as a single text token", () => {
    expect(tokenizeCardText("hello world")).toEqual([text("hello world")]);
  });

  it("parses glyph tokens", () => {
    expect(tokenizeCardText(":rb_energy1:")).toEqual([glyph("energy1")]);
  });

  it("parses glyph with surrounding text", () => {
    expect(tokenizeCardText("Pay :rb_energy1: to activate")).toEqual([
      text("Pay "),
      glyph("energy1"),
      text(" to activate"),
    ]);
  });

  it("parses multiple glyphs", () => {
    expect(tokenizeCardText(":rb_energy1: :rb_runefury:")).toEqual([
      glyph("energy1"),
      text(" "),
      glyph("runefury"),
    ]);
  });

  it("parses bracketed keywords", () => {
    expect(tokenizeCardText("[Backup]")).toEqual([keyword("Backup")]);
  });

  it("parses keyword with surrounding text", () => {
    expect(tokenizeCardText("Has [Flying] and [Haste]")).toEqual([
      text("Has "),
      keyword("Flying"),
      text(" and "),
      keyword("Haste"),
    ]);
  });

  it("parses parenthesized text as italic with recursive inner tokens", () => {
    expect(tokenizeCardText("(Pay :rb_energy1: to draw)")).toEqual([
      paren(text("Pay "), glyph("energy1"), text(" to draw")),
    ]);
  });

  it("parses markdown italic", () => {
    expect(tokenizeCardText("_hello world_")).toEqual([italic(text("hello world"))]);
  });

  it("parses italic with glyphs inside — underscores in glyphs do not break italic", () => {
    expect(
      tokenizeCardText(
        "_You may pay :rb_energy1: :rb_runefury: as an additional cost to have me enter ready._",
      ),
    ).toEqual([
      italic(
        text("You may pay "),
        glyph("energy1"),
        text(" "),
        glyph("runefury"),
        text(" as an additional cost to have me enter ready."),
      ),
    ]);
  });

  it("parses italic with a keyword inside", () => {
    expect(tokenizeCardText("_Requires [Flying]_")).toEqual([
      italic(text("Requires "), keyword("Flying")),
    ]);
  });

  it("parses newlines as newline tokens", () => {
    expect(tokenizeCardText("Line one\nLine two")).toEqual([
      text("Line one"),
      newline,
      text("Line two"),
    ]);
  });

  it("handles mixed token types in sequence", () => {
    expect(tokenizeCardText("[Backup] — Deal :rb_energy1: damage\n_reminder text_")).toEqual([
      keyword("Backup"),
      text(" — Deal "),
      glyph("energy1"),
      text(" damage"),
      newline,
      italic(text("reminder text")),
    ]);
  });

  it("handles empty string", () => {
    expect(tokenizeCardText("")).toEqual([]);
  });

  it("handles glyph with underscores in name", () => {
    expect(tokenizeCardText(":rb_rune_fury:")).toEqual([glyph("rune_fury")]);
  });

  it("parses keywords with glyphs inside", () => {
    expect(tokenizeCardText("[Equip :rb_energy_1: :rb_rune_calm:]")).toEqual([
      keyword("Equip", text("Equip "), glyph("energy_1"), text(" "), glyph("rune_calm")),
    ]);
  });

  it("merges [>] into preceding keyword as pointed modifier", () => {
    expect(tokenizeCardText("[Level 3][>]")).toEqual([{ ...keyword("Level 3"), pointed: true }]);
  });

  it("does not merge [>] without a preceding keyword", () => {
    expect(tokenizeCardText("[>]")).toEqual([keyword(">")]);
  });

  it("handles italic wrapping parenthesized text", () => {
    expect(tokenizeCardText("_(You may pay :rb_energy1:)_")).toEqual([
      italic(paren(text("You may pay "), glyph("energy1"))),
    ]);
  });
});
