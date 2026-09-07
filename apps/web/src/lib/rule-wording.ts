import type {
  FilterRange,
  ListIntent,
  ListKind,
  ListRuleCombine,
  TradeKeepPer,
} from "@openrift/shared";

/**
 * A rule's shape follows the list's kind (card/printing lists match the catalog,
 * copy lists draw on owned copies); the words around it follow the list's intent.
 */
export interface RuleWording {
  isCopy: boolean;
  description: string;
  emptyMessage: string;
  quantityLabel: (keepPer: TradeKeepPer) => string;
  quantityHint: (keepPer: TradeKeepPer) => string;
  groupLabel: string;
  combineOptions: readonly { value: ListRuleCombine; label: string }[];
  combineHint: (combine: ListRuleCombine) => string;
  countVerb: (netOwned: boolean) => string;
}

const QUANTITY_COMBINE_LABELS = [
  { value: "sum", label: "Add up the quantities" },
  { value: "max", label: "Highest rule wins" },
] as const satisfies readonly { value: ListRuleCombine; label: string }[];

const TRADE_COMBINE_LABELS = [
  { value: "protect", label: "Keep everything a rule keeps" },
  { value: "count-sum", label: "Keep the totals added up" },
  { value: "count-max", label: "Keep the highest total" },
] as const satisfies readonly { value: ListRuleCombine; label: string }[];

const ORGANIZE_COPY_COMBINE_LABELS = [
  { value: "protect", label: "Leave out everything a rule leaves out" },
  { value: "count-sum", label: "Leave out the totals added up" },
  { value: "count-max", label: "Leave out the highest total" },
] as const satisfies readonly { value: ListRuleCombine; label: string }[];

const wishWording = (noun: string): Omit<RuleWording, "isCopy"> => ({
  description: "Automatically want every card that matches these filters.",
  emptyMessage: "No rules yet. Add one to automatically want every card that matches a filter.",
  quantityLabel: () => "Want quantity",
  quantityHint: () => `How many of each matched ${noun} you want.`,
  groupLabel: "",
  combineOptions: QUANTITY_COMBINE_LABELS,
  combineHint: (combine) =>
    combine === "max"
      ? `A ${noun} matched by several rules is wanted as much as the most demanding rule.`
      : `A ${noun} matched by several rules is wanted once per rule, added together.`,
  countVerb: (netOwned) => (netOwned ? "missing" : "matches"),
});

const TRADE_WORDING: Omit<RuleWording, "isCopy"> = {
  description: "Automatically offer copies in your collection that match these filters.",
  emptyMessage:
    "No rule yet. Add one to automatically offer copies in your collection that match a filter.",
  quantityLabel: (keepPer) => (keepPer === "printing" ? "Keep per printing" : "Keep per card"),
  quantityHint: (keepPer) =>
    keepPer === "printing"
      ? "Keep this many of each printing, and offer the rest. 0 trades all."
      : "Keep this many per card, counted across all its printings, and offer the rest. 0 trades all.",
  groupLabel: "Keep counts per",
  combineOptions: TRADE_COMBINE_LABELS,
  combineHint: (combine) =>
    combine === "count-sum"
      ? "Adds up the keep counts per card (or printing) and keeps your best copies up to that total."
      : combine === "count-max"
        ? "Uses the highest keep count per card (or printing) and keeps your best copies up to it."
        : "A copy is only offered when every rule that matches it agrees to offer it.",
  // Copy rules never net owned copies, so the verb doesn't vary.
  countVerb: () => "offers",
};

const organizeCardWording = (noun: string): Omit<RuleWording, "isCopy"> => ({
  description: "Automatically include every card that matches these filters.",
  emptyMessage: "No rules yet. Add one to automatically include every card that matches a filter.",
  quantityLabel: () => "Quantity",
  quantityHint: () => `How many of each matched ${noun} the list tracks.`,
  groupLabel: "",
  combineOptions: QUANTITY_COMBINE_LABELS,
  combineHint: (combine) =>
    combine === "max"
      ? `A ${noun} matched by several rules is tracked at the most demanding rule's quantity.`
      : `A ${noun} matched by several rules is tracked once per rule, added together.`,
  countVerb: (netOwned) => (netOwned ? "missing" : "matches"),
});

/**
 * Reuses the trade list's keep/offer split, but nothing is offered here, so
 * held-back copies read as "left out" instead.
 */
const ORGANIZE_COPY_WORDING: Omit<RuleWording, "isCopy"> = {
  description: "Automatically include copies in your collection that match these filters.",
  emptyMessage:
    "No rule yet. Add one to automatically include copies in your collection that match a filter.",
  quantityLabel: (keepPer) =>
    keepPer === "printing" ? "Leave out per printing" : "Leave out per card",
  quantityHint: (keepPer) =>
    keepPer === "printing"
      ? "Leave out this many of each printing (nicest copies first) and include the rest. 0 includes every matching copy."
      : "Leave out this many per card, counted across all its printings (nicest copies first), and include the rest. 0 includes every matching copy.",
  groupLabel: "Leave-out counts per",
  combineOptions: ORGANIZE_COPY_COMBINE_LABELS,
  combineHint: (combine) =>
    combine === "count-sum"
      ? "Adds up the leave-out counts per card (or printing) and holds back your best copies up to that total."
      : combine === "count-max"
        ? "Uses the highest leave-out count per card (or printing) and holds back your best copies up to it."
        : "A copy is only included when every rule that matches it agrees to include it.",
  countVerb: () => "includes",
};

export function ruleWording(intent: ListIntent, kind: ListKind): RuleWording {
  const isCopy = kind === "copy";
  const noun = kind === "printing" ? "printing" : "card";
  if (intent === "organize") {
    return { ...(isCopy ? ORGANIZE_COPY_WORDING : organizeCardWording(noun)), isCopy };
  }
  return { ...(isCopy ? TRADE_WORDING : wishWording(noun)), isCopy };
}

/** Pluralized rule-count label, e.g. "42 cards" / "1 printing" / "3 copies". */
export function matchLabel(count: number, kind: ListKind): string {
  const [one, many] =
    kind === "card"
      ? ["card", "cards"]
      : kind === "printing"
        ? ["printing", "printings"]
        : ["copy", "copies"];
  return `${count} ${count === 1 ? one : many}`;
}

const NET_OWNED_HINT = "Shows only the shortfall toward the quantity above.";

export function netOwnedHint(price: FilterRange): string {
  if (price.min === null && price.max === null) {
    return NET_OWNED_HINT;
  }
  return `${NET_OWNED_HINT} The price range limits what the list asks for, not which of your copies count.`;
}

export function ruleCountLabel(
  count: number,
  kind: ListKind,
  wording: RuleWording,
  netOwned: boolean,
): string {
  return `${wording.countVerb(netOwned)} ${matchLabel(count, kind)}`;
}
