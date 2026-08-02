import { describe, expect, it } from "vitest";

import { formatCardText, glyphFallback } from "./card-text.js";
import type { GlyphEmojis } from "./glyph-emoji.js";

const EMOJIS: GlyphEmojis = new Map([
  ["might", "<:rb_might:1>"],
  ["energy_1", "<:rb_energy_1:2>"],
  ["rune_rainbow", "<:rb_rune_rainbow:3>"],
]);

describe("glyphFallback", () => {
  it("spells out energy costs", () => {
    expect(glyphFallback("energy_2")).toBe("2 energy");
  });

  it("names runes by their domain", () => {
    expect(glyphFallback("rune_fury")).toBe("Fury rune");
  });

  it("capitalizes plain glyphs", () => {
    expect(glyphFallback("might")).toBe("Might");
  });
});

describe("formatCardText", () => {
  it("replaces glyph tokens with the app's emojis", () => {
    expect(formatCardText("Give a unit −4 :rb_might: this turn.", EMOJIS)).toBe(
      "Give a unit −4 <:rb_might:1> this turn.",
    );
  });

  it("falls back to words for glyphs the app has no emoji for", () => {
    expect(formatCardText("Pay :rb_rune_fury: to draw.", EMOJIS)).toBe("Pay Fury rune to draw.");
  });

  it("renders keyword chips as inline code and drops the chip-shape markers", () => {
    expect(formatCardText("[Level 3][>] I have +1 :rb_might:.", EMOJIS)).toBe(
      "`Level 3` I have +1 <:rb_might:1>.",
    );
  });

  it("breaks the chip around a glyph, which a code span would print literally", () => {
    expect(formatCardText("[Repeat :rb_energy_1:]", EMOJIS)).toBe("`Repeat` <:rb_energy_1:2>");
  });

  it("rewrites reminder text to asterisk italics so emoji mentions can't break it", () => {
    expect(formatCardText("[Assault 2] _(+2 :rb_might: while I attack.)_", EMOJIS)).toBe(
      "`Assault 2` *(+2 <:rb_might:1> while I attack.)*",
    );
  });

  it("drops the leading chip marker of an upgrade line", () => {
    expect(formatCardText("[Reaction][>] Kill this: [Add] :rb_rune_rainbow:.", EMOJIS)).toBe(
      "`Reaction` Kill this: `Add` <:rb_rune_rainbow:3>.",
    );
  });

  it("keeps line breaks", () => {
    expect(formatCardText("Draw 1.\n[Reaction]", EMOJIS)).toBe("Draw 1.\n`Reaction`");
  });

  it("leaves parenthesised reminder text plain, rendering the glyphs inside it", () => {
    expect(formatCardText("(Pay :rb_energy_1: to draw.)", EMOJIS)).toBe(
      "(Pay <:rb_energy_1:2> to draw.)",
    );
  });

  it("drops a chip marker that has no chip to point at", () => {
    expect(formatCardText("Kill this: [>]", EMOJIS)).toBe("Kill this:");
  });

  it("points the marker at the chip that follows it", () => {
    expect(formatCardText("[>>][Level 2] I have +1 :rb_might:.", EMOJIS)).toBe(
      "`Level 2` I have +1 <:rb_might:1>.",
    );
  });

  it("renders every glyph as words when the app has no emojis", () => {
    expect(formatCardText("Pay :rb_energy_1: :rb_rune_fury:.", new Map())).toBe(
      "Pay 1 energy Fury rune.",
    );
  });
});
