import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import { WellKnown } from "@openrift/shared/well-known";

import type { DraftRule } from "@/features/rules/lib/rule-draft";
import { emptyDraft } from "@/features/rules/lib/rule-draft";

/**
 * Presets are static definitions; DB-driven data like set slugs arrives here at apply time.
 */
interface RulePresetContext {
  languages?: string[];
  mainSetSlugs?: string[];
}

/**
 * A one-click starting point for the rule editor. Applying a preset only seeds
 * draft rules; nothing persists until the user hits Save.
 */
export interface RulePreset {
  id: string;
  label: string;
  description: string;
  build: (ctx?: RulePresetContext) => DraftRule[];
}

export const WISH_RULE_PRESETS: RulePreset[] = [
  {
    id: "one-of-everything",
    label: "One of everything",
    description: "Want a single copy of everything you don't own yet.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        quantity: { mode: "fixed", n: 1 },
        netOwned: true,
      },
    ],
  },
  {
    id: "playset-of-everything",
    label: "A playset of everything",
    description: "Want a full playset of everything, minus the copies you already own.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        quantity: { mode: "playset", multiplier: 1 },
        netOwned: true,
      },
    ],
  },
  {
    id: "main-set-playsets",
    label: "Playsets of the main sets",
    description:
      "Collect a full playset of every card in the main sets, without runes and " +
      "tokens. The list asks only for the basic version of each card, but any copies " +
      "you already own count, even foils and alt arts. Once a card is complete, it " +
      "disappears from the list. Overnumbered cards are excluded because most people " +
      "don't have them in their active decks. If you do, remove that filter from the rule.",
    build: (ctx) => {
      const draft = emptyDraft(ctx?.languages);
      return [
        {
          ...draft,
          filter: {
            ...draft.filter,
            // Snapshot of the current main sets; a later-released set joins only
            // when the user re-applies the preset or edits the sets facet.
            sets: ctx?.mainSetSlugs ?? [],
            isStandard: true,
            // isStandard already excludes overnumbered prints; the explicit
            // flag keeps the rule intact if the user later turns standard off.
            isOvernumbered: false,
            typesExclude: [WellKnown.cardType.RUNE],
            superTypesExclude: [WellKnown.superType.TOKEN],
          },
          quantity: { mode: "playset", multiplier: 1 },
          netOwned: true,
          countSpecialVersions: true,
        },
      ];
    },
  },
];

export const TRADE_RULE_PRESETS: RulePreset[] = [
  {
    id: "keep-playset",
    label: "Keep a playset, trade the rest",
    description: "Offers every copy beyond a full playset of each card.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        keepPerCard: { mode: "playset", multiplier: 1 },
        keepPer: "card",
      },
    ],
  },
  {
    id: "keep-one-per-card",
    label: "Keep one of each card",
    description: "Offers your duplicates, keeping a single copy of each card.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "card",
      },
    ],
  },
  {
    id: "keep-one-per-printing",
    label: "Keep one of each printing",
    description: "Keeps a copy of every printing separately and offers the rest.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "printing",
      },
    ],
  },
];

export const ORGANIZE_CARD_RULE_PRESETS: RulePreset[] = [
  {
    id: "organize-everything",
    label: "Everything in the catalog",
    description: "Puts every card on the list. Narrow it down with the filters below.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        quantity: { mode: "fixed", n: 1 },
      },
    ],
  },
  {
    id: "organize-missing",
    label: "Only what I'm missing",
    description: "Puts every card you don't own yet on the list, and drops each one as you get it.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        quantity: { mode: "fixed", n: 1 },
        netOwned: true,
      },
    ],
  },
];

export const ORGANIZE_COPY_RULE_PRESETS: RulePreset[] = [
  {
    id: "organize-all-copies",
    label: "Every copy I own",
    description: "Puts every copy in your collection on the list, filters permitting.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        keepPerCard: { mode: "fixed", n: 0 },
        keepPer: "card",
      },
    ],
  },
  {
    id: "organize-duplicates",
    label: "Duplicates only",
    description: "Leaves out your nicest copy of each card and lists the spares.",
    build: (ctx) => [
      {
        ...emptyDraft(ctx?.languages),
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "card",
      },
    ],
  },
];

export function rulePresetsFor(intent: ListIntent, kind: ListKind): RulePreset[] {
  if (intent === "organize") {
    return kind === "copy" ? ORGANIZE_COPY_RULE_PRESETS : ORGANIZE_CARD_RULE_PRESETS;
  }
  return kind === "copy" ? TRADE_RULE_PRESETS : WISH_RULE_PRESETS;
}
