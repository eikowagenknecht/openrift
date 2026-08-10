import { describe, expect, it } from "vitest";

import { findTokenReferences } from "./card-tokens.js";

/** The live token set, so the short ambiguous names are covered by default. */
const TOKENS = [
  { cardId: "baron-pit", name: "Baron Pit" },
  { cardId: "bird", name: "Bird" },
  { cardId: "brush", name: "Brush" },
  { cardId: "buff", name: "Buff" },
  { cardId: "gold", name: "Gold" },
  { cardId: "mech", name: "Mech" },
  { cardId: "recruit", name: "Recruit" },
  { cardId: "reflection", name: "Reflection" },
  { cardId: "sand-soldier", name: "Sand Soldier" },
  { cardId: "shadow-clone", name: "Shadow Clone" },
  { cardId: "sprite", name: "Sprite" },
  { cardId: "tentacle", name: "Tentacle" },
  { cardId: "xp-tracker", name: "XP Tracker" },
];

const CARD_TYPES = ["legend", "unit", "rune", "spell", "gear", "battlefield", "other"];

function find(...texts: (string | null | undefined)[]): string[] {
  return findTokenReferences(texts, TOKENS, CARD_TYPES);
}

describe("findTokenReferences", () => {
  describe("real printing text", () => {
    it("matches a typed reference behind glyph markup", () => {
      expect(
        find(
          ":rb_energy_1: :rb_rune_fury:, Recycle a unit from your trash, :rb_exhaust:: Play a 3 :rb_might: Mech unit token to your base.",
        ),
      ).toEqual(["mech"]);
    });

    it("matches a gear token", () => {
      expect(
        find(
          ":rb_energy_1:, :rb_exhaust:: Return a friendly unit at a battlefield to its owner's hand. Play a Gold gear token exhausted.",
        ),
      ).toEqual(["gold"]);
    });

    it("matches a battlefield token mid-sentence", () => {
      expect(
        find(
          "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter there.",
        ),
      ).toEqual(["baron-pit"]);
    });

    it("matches a plural reference", () => {
      expect(find(":rb_exhaust:: Play three 1 :rb_might: Recruit unit tokens.")).toEqual([
        "recruit",
      ]);
    });

    it("matches a reference followed by a keyword bracket", () => {
      expect(
        find(
          ":rb_energy_4:, :rb_exhaust:: Play a ready 3 :rb_might: Sprite unit token with [Temporary]. This ability costs :rb_energy_1: less for each friendly unit with [Temporary].",
        ),
      ).toEqual(["sprite"]);
    });

    it("matches when the type word is omitted", () => {
      expect(find("Play a Recruit token.")).toEqual(["recruit"]);
    });
  });

  describe("implicit tokens", () => {
    it("derives Buff from the verb, which is how every buff card is written", () => {
      expect(
        find(
          ":rb_energy_1:, :rb_exhaust:: Buff a friendly unit. _(If it doesn't have a buff, it gets a +1 :rb_might: buff.)_",
        ),
      ).toEqual(["buff"]);
    });

    it("derives Buff from a rules line about buffs", () => {
      expect(find("A unit may have no more than one buff at a time.")).toEqual(["buff"]);
    });

    it("derives XP Tracker from a level gate", () => {
      expect(
        find(
          "[Level 6][>] This costs :rb_energy_2: less. _(While you have 6+ XP, get the effect.)_",
        ),
      ).toEqual(["xp-tracker"]);
    });

    it("derives XP Tracker from spending XP", () => {
      expect(find("Spend 3 XP: Give your units here [Ganking] this turn.")).toEqual(["xp-tracker"]);
    });

    it("does not derive XP Tracker from a lowercase 'xp'", () => {
      expect(find("The xp of a long journey.")).toEqual([]);
    });

    it("combines an implicit token with a phrase-matched one", () => {
      expect(find("Buff a friendly unit, then play a Gold gear token.")).toEqual(["buff", "gold"]);
    });

    it("skips a rule whose token card is absent from the catalog", () => {
      const tokens = [{ cardId: "gold", name: "Gold" }];
      expect(findTokenReferences(["Buff a friendly unit."], tokens, CARD_TYPES)).toEqual([]);
    });
  });

  describe("names that are also ordinary words", () => {
    it("ignores Bird as a tag in a list", () => {
      expect(find("As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag.")).toEqual([]);
    });

    it("ignores 'token' with no name in front of it", () => {
      expect(find("Kill a token you control.")).toEqual([]);
    });

    it("does not match a name embedded in a longer word", () => {
      expect(find("Goldsmith token")).toEqual([]);
    });

    it("requires a real card type between the name and 'token'", () => {
      expect(find("Gold from the token pile")).toEqual([]);
    });
  });

  describe("multiple sources", () => {
    it("collects distinct tokens across one text", () => {
      expect(find("Play a Recruit unit token and a Gold gear token.")).toEqual(["gold", "recruit"]);
    });

    it("dedupes the same token across several texts", () => {
      expect(find("Play a Sprite unit token.", "Play another Sprite unit token.")).toEqual([
        "sprite",
      ]);
    });

    it("unions errata text with printing text", () => {
      expect(find("Play a Mech unit token.", null, "Play a Bird unit token.")).toEqual([
        "bird",
        "mech",
      ]);
    });

    it("returns ids in the token-list order, not the text order", () => {
      expect(find("Play a Sprite unit token, then a Bird unit token.")).toEqual(["bird", "sprite"]);
    });
  });

  describe("normalization", () => {
    it("matches across a line break", () => {
      expect(find("Play a Sand Soldier unit\ntoken.")).toEqual(["sand-soldier"]);
    });

    it("matches across an interleaved glyph", () => {
      expect(find("Play a Gold :rb_energy_1: gear token.")).toEqual(["gold"]);
    });

    it("is case-insensitive", () => {
      expect(find("play a RECRUIT UNIT TOKEN")).toEqual(["recruit"]);
    });

    it("matches a two-word name", () => {
      expect(find("Play a 3 :rb_might: Sand Soldier unit token.")).toEqual(["sand-soldier"]);
    });
  });

  describe("edge cases", () => {
    it("returns nothing for no texts", () => {
      expect(find()).toEqual([]);
    });

    it("returns nothing when every text is empty", () => {
      expect(find(null, undefined, "")).toEqual([]);
    });

    it("returns nothing when there are no token cards", () => {
      expect(findTokenReferences(["Play a Gold gear token."], [], CARD_TYPES)).toEqual([]);
    });

    it("still matches the bare form when no card types are supplied", () => {
      expect(findTokenReferences(["Play a Recruit token."], TOKENS, [])).toEqual(["recruit"]);
    });

    it("treats regex metacharacters in a name as literal", () => {
      const tokens = [{ cardId: "odd", name: "A.B" }];
      expect(findTokenReferences(["Play an AxB unit token."], tokens, CARD_TYPES)).toEqual([]);
      expect(findTokenReferences(["Play an A.B unit token."], tokens, CARD_TYPES)).toEqual(["odd"]);
    });

    it("prefers the longer name when one is a prefix of another", () => {
      const tokens = [
        { cardId: "bird", name: "Bird" },
        { cardId: "bird-of-prey", name: "Bird of Prey" },
      ];
      expect(findTokenReferences(["Play a Bird of Prey unit token."], tokens, CARD_TYPES)).toEqual([
        "bird-of-prey",
      ]);
    });
  });
});
