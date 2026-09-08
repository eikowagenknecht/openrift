import type { SetReleases } from "@openrift/shared/set-release";

import type { KeywordEntry } from "@/features/rules/lib/glossary";

export interface Section {
  id: string;
  title: string;
}

interface Group {
  id: string;
  title: string;
  sections: Section[];
}

export const GROUPS: Group[] = [
  {
    id: "game-vocabulary",
    title: "Game vocabulary",
    sections: [
      { id: "domains", title: "Domains" },
      { id: "card-types", title: "Card types" },
      { id: "keywords", title: "Keywords" },
      { id: "symbols", title: "In-text symbols" },
    ],
  },
  {
    id: "printing-variants",
    title: "Printing variants",
    sections: [
      { id: "rarities", title: "Rarities" },
      { id: "booster-packs", title: "Booster pack contents" },
      { id: "art-variants", title: "Art variants" },
      { id: "finishes", title: "Finishes" },
      { id: "markers", title: "Markers" },
      { id: "artist-and-signature", title: "Artist and signature" },
    ],
  },
  {
    id: "sets-and-numbering",
    title: "Sets and numbering",
    sections: [
      { id: "sets", title: "Sets" },
      { id: "numbering", title: "Card numbering" },
    ],
  },
];

export const DOMAIN_RULES: Record<string, string> = {
  fury: "134.2.a",
  calm: "134.2.b",
  mind: "134.2.c",
  body: "134.2.d",
  chaos: "134.2.e",
  order: "134.2.f",
};

export const CARD_TYPE_RULES: Record<string, string> = {
  unit: "140",
  gear: "147",
  spell: "152",
  rune: "159",
  battlefield: "168",
  legend: "172",
};

interface SupertypeEntry {
  slug: string;
  label: string;
  description: string;
  ruleNumber: string;
}

export const SUPERTYPES: SupertypeEntry[] = [
  {
    slug: "champion",
    label: "Champion",
    description: "Applies exclusively to Units. Determines who can be your Chosen Champion.",
    ruleNumber: "133.7.a",
  },
  {
    slug: "signature",
    label: "Signature",
    description: "Can apply to any card type. Limited to 3 per deck, tied to your Champion's tag.",
    ruleNumber: "133.7.b",
  },
  {
    slug: "token",
    label: "Token",
    description: "Temporary game objects created by effects, not part of a deck.",
    ruleNumber: "133.7.c",
  },
];

export const ART_VARIANT_DESCRIPTIONS: Record<string, string> = {
  normal: "Standard art for the printing.",
  altart:
    "An additional artwork using the same card name and rarity. Distinguished by a lowercase letter suffix on the card number (e.g. 120a).",
  overnumbered:
    "Reprinted art with a card number that exceeds the printed set total, typically a special variant slotted into a later set.",
  ultimate:
    "A premium full-art treatment. The card itself usually keeps its original rarity (e.g. Showcase), since Ultimate describes the artwork, not the rarity.",
};

export const FINISH_DESCRIPTIONS: Record<string, string> = {
  normal: "Standard cardstock with no special treatment.",
  foil: "Glossy foil finish across the card face.",
  metal: "Premium metal-stamped collectible printing.",
  "metal-deluxe": "Higher-tier metal printing with extra finishing.",
};

interface PackSlotEntry {
  label: string;
  description: string;
}

export const PACK_SLOTS: PackSlotEntry[] = [
  {
    label: "7× Common",
    description: "Standard Common-rarity cards.",
  },
  {
    label: "3× Uncommon",
    description: "Standard Uncommon-rarity cards.",
  },
  {
    label: "2× Rare-or-better",
    description:
      "Each flex slot rolls Epic about 13.4% of the time and Rare otherwise, which works out to roughly 1 in 4 packs containing at least one Epic.",
  },
  {
    label: "1× Foil",
    description:
      "Usually a Common (~70%) or Uncommon (~25%) foil, occasionally upgrading to a Rare (~4%) or Epic (~1%) foil. The whole slot can be replaced by a Showcase alt-art (~1 per 12 packs), an overnumbered Showcase (1 per 72 packs), a signed Showcase (1 per 720 packs), or an Ultimate (~0.1% of packs, where the pool has one).",
  },
  {
    label: "1× Rune or Token",
    description:
      "Usually a basic Rune. Occasionally a foil Rune, sometimes a Token-supertype card (e.g. Sprite, Recruit), and very rarely an alt-art Rune.",
  },
];

interface PrintingDetailEntry {
  key: string;
  label: string;
  description: string;
}

export const PRINTING_DETAILS: PrintingDetailEntry[] = [
  {
    key: "artist",
    label: "Artist",
    description:
      "Illustrator credit printed on the card. Tracked per printing so reprints can credit the original artist.",
  },
  {
    key: "signature",
    label: "Signature",
    description:
      "A printing flag indicating the card carries the artist's signature, usually overlaid on a foil alt-art or Ultimate variant.",
  },
];

interface SymbolEntry {
  key: string;
  label: string;
  summary: string;
  icon?: string;
}

export const SYMBOLS: SymbolEntry[] = [
  {
    key: "might",
    label: "Might",
    summary: "A unit's combat power. Higher Might deals more damage and is harder to remove.",
    icon: "/images/glyphs/might.svg",
  },
  {
    key: "might-bonus",
    label: "Might bonus",
    summary:
      "A boxed Might value on Gear, indicating how much Might the gear adds to its equipped unit.",
  },
  {
    key: "exhaust",
    label: "Exhaust",
    summary:
      "Turning a card, rune, or legend sideways to use it. Once exhausted, it can't be exhausted again until something readies it.",
    icon: "/images/glyphs/exhaust.svg",
  },
  {
    key: "recycle",
    label: "Recycle",
    summary:
      "Place a card or rune from the board onto the bottom of its deck. Often used to pay Power costs.",
  },
  {
    key: "power-activation",
    label: "Power activation",
    summary:
      "Exhaust a rune of a specific domain to add its Power to your Rune Pool, then spend it to pay costs.",
  },
  {
    key: "energy",
    label: "Energy cost",
    summary:
      "Pay Energy by exhausting any rune, regardless of domain. Shown as a numeric cost on the card.",
  },
  {
    key: "rune-rainbow",
    label: "Power (any domain)",
    summary:
      "Marked [A]. A Power cost that can be paid with a rune of any domain. This is the wild Power symbol.",
    icon: "/images/glyphs/rune-rainbow.svg",
  },
];

interface NumberingPattern {
  pattern: string;
  summary: string;
}

export const NUMBERING_PATTERNS: NumberingPattern[] = [
  {
    pattern: "OGN-001",
    summary: "Set code followed by the printed card number.",
  },
  {
    pattern: "OGN-120a",
    summary:
      "A lowercase letter suffix marks an alt-art variant of the same base card. Distinct from the Showcase rarity, which is shown by the rarity glyph in the middle of the card.",
  },
  {
    pattern: "OGN-224",
    summary:
      "A number above the set's printed total is an Overnumbered variant, usually a special reprint slotted into a later set.",
  },
  {
    pattern: "SFD-T01",
    summary:
      "T prefix indicates a token printed for the set. T and R prefixes were introduced with Spiritforged. Origins used standard numbering for tokens and runes.",
  },
  {
    pattern: "SFD-R01",
    summary: "R prefix indicates a rune printed for the set (introduced in Spiritforged).",
  },
];

export interface SetEntry {
  slug: string;
  name: string;
  releases: SetReleases;
  setType: "main" | "supplemental";
  cardCount: number;
}

export interface KeywordRow {
  name: string;
  color?: string | null;
  darkText?: boolean;
  info?: KeywordEntry;
}
