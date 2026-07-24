import type { DraftRule } from "@/stores/rule-editor-store";
import { emptyDraft } from "@/stores/rule-editor-store";

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
  /** One sentence under the title saying what the preset does. */
  description: string;
  /**
   * Builds the preset's draft rules. `languages` seeds each rule's language
   * facet (the user's preferred languages), same as a blank rule.
   * @returns Fresh draft rules ready to append to the editor store.
   */
  build: (languages?: string[]) => DraftRule[];
}

/** Presets offered on wish lists ("want these cards"). */
export const WISH_RULE_PRESETS: RulePreset[] = [
  {
    id: "one-of-everything",
    label: "One of everything",
    description: "Want a single copy of everything you don't own yet.",
    build: (languages) => [
      {
        ...emptyDraft(languages),
        quantity: { mode: "fixed", n: 1 },
        netOwned: true,
      },
    ],
  },
  {
    id: "playset-of-everything",
    label: "A playset of everything",
    description: "Want a full playset of everything, minus the copies you already own.",
    build: (languages) => [
      {
        ...emptyDraft(languages),
        quantity: { mode: "playset", multiplier: 1 },
        netOwned: true,
      },
    ],
  },
];

/** Presets offered on trade lists ("offer these copies"). */
export const TRADE_RULE_PRESETS: RulePreset[] = [
  {
    id: "keep-playset",
    label: "Keep a playset, trade the rest",
    description: "Offers every copy beyond a full playset of each card.",
    build: (languages) => [
      {
        ...emptyDraft(languages),
        keepPerCard: { mode: "playset", multiplier: 1 },
        keepPer: "card",
      },
    ],
  },
  {
    id: "keep-one-per-card",
    label: "Keep one of each card",
    description: "Offers your duplicates, keeping a single copy of each card.",
    build: (languages) => [
      {
        ...emptyDraft(languages),
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "card",
      },
    ],
  },
  {
    id: "keep-one-per-printing",
    label: "Keep one of each printing",
    description: "Keeps a copy of every printing separately and offers the rest.",
    build: (languages) => [
      {
        ...emptyDraft(languages),
        keepPerCard: { mode: "fixed", n: 1 },
        keepPer: "printing",
      },
    ],
  },
];
