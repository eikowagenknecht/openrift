import { WellKnown } from "@openrift/shared";

import type { DraftRule } from "@/stores/rule-editor-store";
import { emptyDraft } from "@/stores/rule-editor-store";

/**
 * Catalog context a preset may draw on when building its rules. Presets are
 * static definitions, so anything DB-driven (set slugs) arrives here at
 * apply time.
 */
export interface RulePresetContext {
  /** The user's preferred languages; seeds each rule's language facet like a blank rule. */
  languages?: string[];
  /** Slugs of the catalog's main (non-supplemental) sets, for set-scoped presets. */
  mainSetSlugs?: string[];
}

/**
 * A one-click starting point for the rule editor: a common setup rendered as a
 * button in the editor's empty state. Applying a preset only seeds draft rules —
 * the user can still tweak every field before saving, and nothing persists
 * until they hit Save.
 */
export interface RulePreset {
  id: string;
  /** The button's title, e.g. "One of everything". */
  label: string;
  /** One or two sentences under the title saying what the preset does. */
  description: string;
  /**
   * Builds the preset's draft rules from the apply-time context.
   * @returns Fresh draft rules ready to append to the editor store.
   */
  build: (ctx?: RulePresetContext) => DraftRule[];
}

/** Presets offered on wish lists ("want these cards"). */
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
            // Snapshot of the current main sets — a set released later joins
            // the rule only when the user re-applies the preset or edits the
            // sets facet (there is no live set-type filter dimension).
            sets: ctx?.mainSetSlugs ?? [],
            isStandard: true,
            // isStandard already rejects non-normal art variants; the explicit
            // exclude keeps the intent visible (and the rule intact) if the
            // user later switches the standard toggle off.
            artVariantsExclude: [WellKnown.artVariant.OVERNUMBERED],
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

/** Presets offered on trade lists ("offer these copies"). */
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
