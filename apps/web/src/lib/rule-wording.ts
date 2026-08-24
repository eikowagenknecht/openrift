import type {
  FilterRange,
  ListIntent,
  ListKind,
  ListRuleCombine,
  TradeKeepPer,
} from "@openrift/shared";

/**
 * The user-facing copy for one list's rule editor (ADR-034). A rule's *shape*
 * follows the list's kind (card/printing lists match the catalog, copy lists
 * draw on owned copies), but the words around it follow the list's intent: the
 * same "keep N per card, emit the rest" split reads as offering surplus on a
 * trade list and as leaving copies off on an organize list.
 */
export interface RuleWording {
  /** True when the rule draws on owned copies (list kind = copy), not the catalog. */
  isCopy: boolean;
  /** The dialog's subtitle. */
  description: string;
  /** Shown in place of the rule blocks while the list has no rules yet. */
  emptyMessage: string;
  /**
   * Label above the quantity control. `keepPer` only matters on copy lists,
   * where the count applies per card or per printing.
   * @returns The control's label.
   */
  quantityLabel: (keepPer: TradeKeepPer) => string;
  /**
   * The sentence under the quantity control.
   * @returns The explanation.
   */
  quantityHint: (keepPer: TradeKeepPer) => string;
  /** Label for the copy-list grouping select (unused on card/printing lists). */
  groupLabel: string;
  /** Combine-mode options for the list's kind, in display order. */
  combineOptions: readonly { value: ListRuleCombine; label: string }[];
  /**
   * The sentence under the combine-mode select.
   * @returns The explanation for the selected mode.
   */
  combineHint: (combine: ListRuleCombine) => string;
  /**
   * Verb for the per-rule count phrase. Card/printing rules that net owned
   * copies report a shortfall rather than a match count, so their verb changes.
   * @returns The verb, e.g. "matches" in "matches 42 cards".
   */
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

/**
 * Wording for wish lists (kind card or printing): the rule says what you want.
 * `noun` is the list's own granularity, "card" or "printing".
 * @returns The wish wording.
 */
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

/** Wording for trade lists (kind copy): the rule says what you offer. */
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

/**
 * Wording for organize lists of kind card or printing (ADR-034 amendment 4).
 * @returns The organize card/printing wording.
 */
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
 * Wording for organize lists of kind copy (ADR-034 amendment 4). The underlying
 * rule is the same keep/offer split a trade list uses, but nothing is offered
 * here, so the held-back copies read as "left out" of the list instead.
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

/**
 * The rule-editor copy for a list. Kind decides the rule's shape and therefore
 * which controls appear; intent decides how they are described (ADR-034
 * amendment 4).
 * @returns The wording for this list's rule editor.
 */
export function ruleWording(intent: ListIntent, kind: ListKind): RuleWording {
  const isCopy = kind === "copy";
  const noun = kind === "printing" ? "printing" : "card";
  if (intent === "organize") {
    return { ...(isCopy ? ORGANIZE_COPY_WORDING : organizeCardWording(noun)), isCopy };
  }
  return { ...(isCopy ? TRADE_WORDING : wishWording(noun)), isCopy };
}

/**
 * Pluralized rule-count label, e.g. "42 cards" / "1 printing" / "3 copies".
 * @returns The count with its pluralized noun.
 */
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

/**
 * Hint for the "only what I'm missing" switch. A price range narrows what the
 * list asks for but never which of your copies count toward it (ADR-034
 * amendment 6), which is worth saying while a bound is set: the two readings
 * are easy to confuse, and the wrong one makes owned copies look ignored.
 * @returns The hint text, with the price clause only while a bound is set.
 */
export function netOwnedHint(price: FilterRange): string {
  if (price.min === null && price.max === null) {
    return NET_OWNED_HINT;
  }
  return `${NET_OWNED_HINT} The price range limits what the list asks for, not which of your copies count.`;
}

/**
 * The per-rule count phrase next to a rule's title. A card/printing rule with
 * "Only what I'm missing" on shows a post-netting shortfall, so its verb is
 * "missing" rather than "matches" (the number shrinks as owned copies fill the
 * wants, which "matches" would misrepresent).
 * @returns The verb + count phrase, e.g. "matches 42 cards" / "missing 3 cards".
 */
export function ruleCountLabel(
  count: number,
  kind: ListKind,
  wording: RuleWording,
  netOwned: boolean,
): string {
  return `${wording.countVerb(netOwned)} ${matchLabel(count, kind)}`;
}
