import { RULE_REFERENCE_REGEX } from "@openrift/shared/rules";
import { fromMarkdown } from "mdast-util-from-markdown";

export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function splitTextOnRuleReferences(text: string): MdNode[] {
  const result: MdNode[] = [];
  let last = 0;
  RULE_REFERENCE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = RULE_REFERENCE_REGEX.exec(text);
  while (match !== null) {
    if (match.index > last) {
      result.push({ type: "text", value: text.slice(last, match.index) });
    }
    const keyword = match[1];
    const ruleNumber = match[2] ?? match[3];
    const url = keyword === "CR" ? `/rules/core#rule-${ruleNumber}` : `#rule-${ruleNumber}`;
    result.push({
      type: "link",
      url,
      children: [{ type: "text", value: match[0] }],
    });
    last = match.index + match[0].length;
    match = RULE_REFERENCE_REGEX.exec(text);
  }
  if (last < text.length) {
    result.push({ type: "text", value: text.slice(last) });
  }
  return result;
}

function visitMdastTextNodes(node: MdNode): void {
  if (!node.children) {
    return;
  }
  const rebuilt: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "link") {
      // Don't relink text inside an existing link.
      rebuilt.push(child);
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      const replacements = splitTextOnRuleReferences(child.value);
      const [only] = replacements;
      const isUnchanged =
        replacements.length === 1 && only?.type === "text" && only.value === child.value;
      rebuilt.push(...(isUnchanged ? [child] : replacements));
      continue;
    }
    visitMdastTextNodes(child);
    rebuilt.push(child);
  }
  node.children = rebuilt;
}

/** Wraps rule references (`rule 540`, `603.7`, `CR 116`) in links to their anchors. */
export const remarkLinkifyRuleReferences = () => (tree: MdNode) => {
  visitMdastTextNodes(tree);
};

const PENALTY_REGEX =
  /\[(?<penalty>Warnings?|Game Loss|No Penalty|Match Loss|Disqualification)\]/gu;

// IPG-style sources often italicize the label, e.g. `[*Warnings*]`; strip the
// inner emphasis markers so the regex above sees a clean `[Label]` token.
const PENALTY_NORMALIZE_REGEX =
  /\[\s*[*_]*\s*(?<penalty>Warnings?|Game Loss|No Penalty|Match Loss|Disqualification)\s*[*_]*\s*\]/gu;

function splitTextOnPenalties(text: string): HastNode[] {
  const result: HastNode[] = [];
  let last = 0;
  PENALTY_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = PENALTY_REGEX.exec(text);
  while (match !== null) {
    if (match.index > last) {
      result.push({ type: "text", value: text.slice(last, match.index) });
    }
    result.push({
      type: "element",
      tagName: "span",
      properties: { "data-penalty": match[1] },
      children: [{ type: "text", value: match[0] }],
    });
    last = match.index + match[0].length;
    match = PENALTY_REGEX.exec(text);
  }
  if (last < text.length) {
    result.push({ type: "text", value: text.slice(last) });
  }
  return result;
}

function visitHastTextNodes(node: HastNode): void {
  if (node.tagName === "a") {
    // Don't restyle text inside an existing link.
    return;
  }
  if (!node.children) {
    return;
  }
  const rebuilt: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      if (!PENALTY_REGEX.test(child.value)) {
        PENALTY_REGEX.lastIndex = 0;
        rebuilt.push(child);
        continue;
      }
      PENALTY_REGEX.lastIndex = 0;
      rebuilt.push(...splitTextOnPenalties(child.value));
      continue;
    }
    visitHastTextNodes(child);
    rebuilt.push(child);
  }
  node.children = rebuilt;
}

/** Wraps `[Warning]`-style penalty labels in `<span data-penalty>` elements. */
export const rehypeHighlightPenalties = () => (tree: HastNode) => {
  visitHastTextNodes(tree);
};

/**
 * Collapses italicized penalty labels to plain `[Label]` tokens and turns
 * every newline into a markdown hard break.
 */
export function preprocessRuleMarkdown(content: string): string {
  return content.replaceAll(PENALTY_NORMALIZE_REGEX, "[$<penalty>]").replaceAll("\n", "  \n");
}

// Diffing raw markdown source is unsafe: interleaving the emphasis markers of
// two versions can pair them up differently than in either version. Instead
// both versions are parsed, flattened to word tokens carrying their
// formatting context, diffed by text only, then rebuilt into a merged tree.

interface InlineFrame {
  tag: "em" | "strong" | "code" | "a" | "penalty" | "diff";
  href?: string;
  penalty?: string;
  diff?: "added" | "removed";
}

interface WsAtom {
  hardBreak: boolean;
  value: string;
}

interface InlineToken {
  text: string;
  pre: WsAtom[];
  frames: InlineFrame[];
}

const WORD_OR_WS_REGEX = /(?<ws>\s+)|(?<word>\w+)|(?<punct>[^\w\s]+)/gu;

const BLOCK_TYPES = new Set(["paragraph", "heading", "list", "listItem", "blockquote"]);

interface FlattenState {
  tokens: InlineToken[];
  pendingWs: WsAtom[];
}

function pushTextTokens(text: string, frames: InlineFrame[], state: FlattenState): void {
  WORD_OR_WS_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = WORD_OR_WS_REGEX.exec(text);
  while (match !== null) {
    const ws = match.groups?.ws;
    if (ws === undefined) {
      state.tokens.push({ text: match[0], pre: state.pendingWs, frames });
      state.pendingWs = [];
    } else {
      state.pendingWs.push({ hardBreak: false, value: ws });
    }
    match = WORD_OR_WS_REGEX.exec(text);
  }
}

function flattenText(text: string, frames: InlineFrame[], state: FlattenState): void {
  // Match penalty labels (e.g. `[Warning]`) as single tokens before word splitting.
  const penaltyRegex = new RegExp(PENALTY_REGEX.source, "gu");
  let last = 0;
  let match: RegExpExecArray | null = penaltyRegex.exec(text);
  while (match !== null) {
    if (match.index > last) {
      pushTextTokens(text.slice(last, match.index), frames, state);
    }
    state.tokens.push({
      text: match[0],
      pre: state.pendingWs,
      frames: [...frames, { tag: "penalty", penalty: match[1] }],
    });
    state.pendingWs = [];
    last = match.index + match[0].length;
    match = penaltyRegex.exec(text);
  }
  if (last < text.length) {
    pushTextTokens(text.slice(last), frames, state);
  }
}

function flattenNode(node: MdNode, frames: InlineFrame[], state: FlattenState): void {
  switch (node.type) {
    case "text": {
      flattenText(node.value ?? "", frames, state);
      return;
    }
    case "inlineCode": {
      state.tokens.push({
        text: node.value ?? "",
        pre: state.pendingWs,
        frames: [...frames, { tag: "code" }],
      });
      state.pendingWs = [];
      return;
    }
    case "break": {
      state.pendingWs.push({ hardBreak: true, value: "" });
      return;
    }
    case "emphasis": {
      flattenChildren(node, [...frames, { tag: "em" }], state);
      return;
    }
    case "strong": {
      flattenChildren(node, [...frames, { tag: "strong" }], state);
      return;
    }
    case "link": {
      flattenChildren(node, [...frames, { tag: "a", href: node.url }], state);
      return;
    }
    default: {
      flattenChildren(node, frames, state);
    }
  }
}

function flattenChildren(node: MdNode, frames: InlineFrame[], state: FlattenState): void {
  let previousWasBlock = false;
  for (const child of node.children ?? []) {
    const isBlock = BLOCK_TYPES.has(child.type);
    if (isBlock && previousWasBlock) {
      state.pendingWs.push({ hardBreak: true, value: "" });
    }
    flattenNode(child, frames, state);
    previousWasBlock = isBlock || previousWasBlock;
  }
}

function flattenTree(tree: MdNode): InlineToken[] {
  const state: FlattenState = { tokens: [], pendingWs: [] };
  flattenChildren(tree, [], state);
  return state.tokens;
}

interface DiffEntry {
  type: "equal" | "added" | "removed";
  token: InlineToken;
}

/**
 * LCS over the token texts only; formatting is ignored, so a word whose
 * emphasis, link, or badge changed but whose text didn't compares equal.
 */
function lcsCell(dp: number[][], row: number, column: number): number {
  const value = dp[row]?.[column];
  if (value === undefined) {
    throw new Error(`rules-markdown: no LCS cell at ${row},${column}`);
  }
  return value;
}

function diffTokens(oldTokens: InlineToken[], newTokens: InlineToken[]): DiffEntry[] {
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: number[][] = [Array.from({ length: m + 1 }, () => 0)];
  for (const [oldIndex, oldToken] of oldTokens.entries()) {
    const row: number[] = [0];
    let left = 0;
    for (const [newIndex, newToken] of newTokens.entries()) {
      const value =
        oldToken.text === newToken.text
          ? lcsCell(dp, oldIndex, newIndex) + 1
          : Math.max(lcsCell(dp, oldIndex, newIndex + 1), left);
      row.push(value);
      left = value;
    }
    dp.push(row);
  }

  const reversed: DiffEntry[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const oldToken = oldTokens[i - 1];
    const newToken = newTokens[j - 1];
    if (oldToken !== undefined && newToken !== undefined && oldToken.text === newToken.text) {
      reversed.push({ type: "equal", token: newToken });
      i--;
      j--;
    } else if (
      newToken !== undefined &&
      (oldToken === undefined || lcsCell(dp, i, j - 1) >= lcsCell(dp, i - 1, j))
    ) {
      reversed.push({ type: "added", token: newToken });
      j--;
    } else if (oldToken === undefined) {
      throw new Error("rules-markdown: LCS backtrack ran past both token lists");
    } else {
      reversed.push({ type: "removed", token: oldToken });
      i--;
    }
  }
  return reversed.toReversed();
}

function frameEquals(a: InlineFrame, b: InlineFrame): boolean {
  return a.tag === b.tag && a.href === b.href && a.penalty === b.penalty && a.diff === b.diff;
}

function frameToElement(frame: InlineFrame): HastNode {
  switch (frame.tag) {
    case "a": {
      return { type: "element", tagName: "a", properties: { href: frame.href }, children: [] };
    }
    case "penalty": {
      return {
        type: "element",
        tagName: "span",
        properties: { "data-penalty": frame.penalty },
        children: [],
      };
    }
    case "diff": {
      return {
        type: "element",
        tagName: "span",
        properties: { "data-diff": frame.diff },
        children: [],
      };
    }
    default: {
      return { type: "element", tagName: frame.tag, properties: {}, children: [] };
    }
  }
}

function appendText(container: HastNode, value: string): void {
  if (!value) {
    return;
  }
  const last = container.children?.at(-1);
  if (last?.type === "text" && typeof last.value === "string") {
    last.value += value;
    return;
  }
  container.children?.push({ type: "text", value });
}

function buildMergedTree(entries: DiffEntry[]): HastNode[] {
  const root: HastNode = { type: "root", children: [] };
  const stack: { frame: InlineFrame; node: HastNode }[] = [];

  const container = () => stack.at(-1)?.node ?? root;

  for (const entry of entries) {
    const frames =
      entry.type === "equal"
        ? entry.token.frames
        : [...entry.token.frames, { tag: "diff", diff: entry.type } satisfies InlineFrame];

    let common = 0;
    for (const [depth, frame] of frames.entries()) {
      const open = stack[depth];
      if (open === undefined || !frameEquals(open.frame, frame)) {
        break;
      }
      common = depth + 1;
    }
    stack.length = common;

    // Whitespace between tokens goes outside the frames being opened/closed,
    // so a space between an italic word and a plain word lands between the
    // elements, and a space between two added words stays inside the mark.
    for (const atom of entry.token.pre) {
      if (atom.hardBreak) {
        container().children?.push({
          type: "element",
          tagName: "br",
          properties: {},
          children: [],
        });
      } else {
        appendText(container(), atom.value);
      }
    }

    for (const frame of frames.slice(common)) {
      const node = frameToElement(frame);
      container().children?.push(node);
      stack.push({ frame, node });
    }

    appendText(container(), entry.token.text);
  }

  return root.children ?? [];
}

function parseRuleMarkdown(source: string): MdNode {
  const tree = fromMarkdown(preprocessRuleMarkdown(source)) as unknown as MdNode;
  remarkLinkifyRuleReferences()(tree);
  return tree;
}

/**
 * Computes an inline word-level diff between two rule bodies as a merged
 * HAST-like tree. Both versions run through the full parse pipeline first,
 * so formatting can't be mangled by the diff.
 */
export function diffRuleMarkdown(oldSource: string, newSource: string): HastNode[] {
  const newTokens = flattenTree(parseRuleMarkdown(newSource));
  if (oldSource === newSource) {
    return buildMergedTree(newTokens.map((token) => ({ type: "equal", token })));
  }
  const oldTokens = flattenTree(parseRuleMarkdown(oldSource));
  return buildMergedTree(diffTokens(oldTokens, newTokens));
}

/**
 * Whether `diffRuleMarkdown` would render any add/remove marks for this pair.
 * Bodies differing only in whitespace, emphasis, or link markup are silent.
 */
export function hasVisibleRuleChanges(oldSource: string, newSource: string): boolean {
  if (oldSource === newSource) {
    return false;
  }
  const oldTokens = flattenTree(parseRuleMarkdown(oldSource));
  const newTokens = flattenTree(parseRuleMarkdown(newSource));
  if (oldTokens.length !== newTokens.length) {
    return true;
  }
  // Equal-length token sequences with pairwise-equal text are exactly the
  // pairs whose LCS covers everything, i.e. an all-`equal` diff.
  return oldTokens.some((token, index) => token.text !== newTokens[index]?.text);
}
