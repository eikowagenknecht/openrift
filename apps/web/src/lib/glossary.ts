import { slugifyName } from "@openrift/shared";

export interface KeywordEntry {
  summary: string;
  ruleNumber: string;
}

export const KEYWORD_INFO: Record<string, KeywordEntry> = {
  Accelerate: {
    summary:
      "Optional additional cost when playing me: pay 1 + 1 Power, and I enter ready instead of exhausted.",
    ruleNumber: "805",
  },
  Action: {
    summary: "I can be played or activated during showdowns on any player's turn.",
    ruleNumber: "806",
  },
  Add: {
    summary: "Game action that puts resources into a player's Rune Pool.",
    ruleNumber: "429",
  },
  Ambush: {
    summary:
      "I may be played to a battlefield where you control units, and gain Reaction while doing so.",
    ruleNumber: "822",
  },
  Assault: {
    summary: "While I am attacking, I have +X Might.",
    ruleNumber: "807",
  },
  Backline: {
    summary:
      "I must be assigned lethal damage after any non-Backline unit you control during the combat damage step.",
    ruleNumber: "826",
  },
  Buff: {
    summary: "Game action that places a Buff counter on a unit.",
    ruleNumber: "426",
  },
  Deathknell: {
    summary: "Triggered ability: when I die, [effect].",
    ruleNumber: "808",
  },
  Deflect: {
    summary: "Spells and abilities an opponent uses to choose me cost X more Power to play.",
    ruleNumber: "809",
  },
  Equip: {
    summary:
      "Activated ability on Equipment: pay the Equip cost to attach this gear to a unit you control.",
    ruleNumber: "818",
  },
  Ganking: {
    summary: "I may move to another battlefield from my current battlefield with a standard move.",
    ruleNumber: "810",
  },
  Hidden: {
    summary:
      "I may be played facedown to a battlefield. Starting next turn I gain Reaction and can be played, ignoring my base cost.",
    ruleNumber: "811",
  },
  Hunt: {
    summary: "When I Conquer or Hold, my controller gains X XP.",
    ruleNumber: "823",
  },
  Legion: {
    summary: "If you've played another card this turn, this card gains [text].",
    ruleNumber: "812",
  },
  Level: {
    summary: "While you have N or more XP, this card gains [text].",
    ruleNumber: "824",
  },
  Mighty: {
    summary: 'A unit "is Mighty" while its Might is 5 or greater.',
    ruleNumber: "706",
  },
  Predict: {
    summary: "Game action: look at the top X cards of your Main Deck and recycle any of them.",
    ruleNumber: "436",
  },
  "Quick-Draw": {
    summary: "Equipment with Reaction. When I'm played, attach me to a unit you control.",
    ruleNumber: "819",
  },
  Reaction: {
    summary:
      "I can be played or activated during closed states on any player's turn (and have Action's permissions too).",
    ruleNumber: "813",
  },
  Repeat: {
    summary:
      "Optional additional cost on a spell. If paid, the spell's instructions execute one additional time.",
    ruleNumber: "820",
  },
  Shield: {
    summary: "While I am defending, I have +X Might.",
    ruleNumber: "814",
  },
  Stun: {
    summary:
      "Game action: a stunned unit contributes no Might to combat damage and loses the status at the next Ending Step.",
    ruleNumber: "423",
  },
  Tank: {
    summary:
      "I must be assigned lethal damage before any non-Tank unit you control during the combat damage step.",
    ruleNumber: "815",
  },
  Temporary: {
    summary: "At the start of my controller's Beginning Phase, before scoring, I die.",
    ruleNumber: "816",
  },
  Unique: {
    summary: "Deck construction restriction: a deck may contain only one card with this name.",
    ruleNumber: "825",
  },
  Vision: {
    summary: "When I'm played, look at the top card of your Main Deck. You may recycle it.",
    ruleNumber: "817",
  },
  Weaponmaster: {
    summary:
      "When I'm played, choose an Equipment you control. Pay its Equip cost (reduced by [A]) to attach it to me.",
    ruleNumber: "821",
  },
};

export function keywordAnchorSlug(name: string): string {
  return `keyword-${slugifyName(name)}`;
}
