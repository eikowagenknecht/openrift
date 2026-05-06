import type { RuleChangesResponse, RuleKind, RuleResponse } from "@openrift/shared";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  SearchIcon,
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
// oxlint-disable no-unused-vars -- perf experiment; will restore markdown rendering shortly
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { PageToc } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import { PAGE_TOP_BAR_STICKY } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuleVersions, useRulesAtVersion } from "@/hooks/use-rules";
import type { DiffSegment } from "@/lib/text-diff";
import { textDiff } from "@/lib/text-diff";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useRulesDiffExpandStore } from "@/stores/rules-diff-expand-store";
import { useRulesFoldStore } from "@/stores/rules-fold-store";
import { useRulesSearchStore } from "@/stores/rules-search-store";
import { useRulesShowChangesStore } from "@/stores/rules-show-changes-store";

/**
 * Formats a rule number for display by stripping trailing dots.
 *
 * @returns Cleaned rule number string.
 */
function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/, "");
}

async function copyRuleLink(ruleNumber: string): Promise<void> {
  const url = `${globalThis.location.origin}${globalThis.location.pathname}#rule-${ruleNumber}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success(`Link to rule ${formatRuleNumber(ruleNumber)} copied`);
  } catch {
    toast.error("Could not copy link");
  }
}

// Rule references inside rule body text. Three forms:
//   - "rule N" / "Rule N" / "rules N" → same-page anchor (#rule-N)
//   - bare "N.M…" with at least one dot, starting at 3 digits → same-page anchor
//   - "CR N" → cross-link to the core rules page
//
// The number's tail is constrained: digits, optional `.digit` segments,
// optional single `.letter` segment, optional final `.digit`. This keeps
// matches from bleeding into the next sentence (e.g. "rule 540.4.b. Continue"
// matches "540.4.b", not "540.4.b.C…").
const RULE_REFERENCE_REGEX =
  /(?:\b([Rr]ules?|CR)\s+(\d+(?:\.\d+)*(?:\.[a-z](?:\.\d+)?)?)|\b(\d{3}(?:\.\d+)+(?:\.[a-z](?:\.\d+)?)?))/g;

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
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

function visitTextNodes(node: MdNode): void {
  if (!node.children) {
    return;
  }
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (child.type === "link") {
      // Don't relink text inside an existing link.
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      const replacements = splitTextOnRuleReferences(child.value);
      const isUnchanged =
        replacements.length === 1 &&
        replacements[0].type === "text" &&
        replacements[0].value === child.value;
      if (!isUnchanged) {
        node.children.splice(index, 1, ...replacements);
        index += replacements.length - 1;
      }
      continue;
    }
    visitTextNodes(child);
  }
}

const remarkLinkifyRuleReferences = () => (tree: MdNode) => {
  visitTextNodes(tree);
};

// Game terms that get auto-linked when they appear in italics. Three sources:
//   - Subtitles (depth-0 section headings: "Game Objects" → 120, "Combat" → 454)
//   - Text rules whose body is a Title Case `*Term*` phrase (verbs like
//     "*Stun*" → 423, keyword glossary entries like "*Accelerate*" → 805,
//     multi-word terms like "*Battlefield Zone*" → 107.2)
//   - Depth-0 text rules whose body is plain Title Case (no italics) acting
//     as section headings — "Passive Abilities" → 363, "Replacement Effects"
//     → 367. These are styled as headings in the source but stored without
//     asterisks, so we detect them structurally.
// Later passes override earlier ones: italic terms beat heading-style ones,
// and subtitles override everything.
const TITLE_WORD = "[A-Z][A-Za-z0-9-]*";
const HEADING_STOP_WORD = "(?:of|or|the|and|to|a|an)";
const TITLE_CASE_PHRASE = `${TITLE_WORD}(?:\\s+(?:${TITLE_WORD}|${HEADING_STOP_WORD}))*`;
const TERM_DEFINITION_REGEX = new RegExp(`^\\*(${TITLE_CASE_PHRASE})\\*\\.?$`);
const HEADING_TEXT_REGEX = new RegExp(`^${TITLE_CASE_PHRASE}$`);

function addTermAnchor(map: Map<string, string>, term: string, ruleNumber: string): void {
  const key = term.toLowerCase();
  map.set(key, ruleNumber);
  // Plural ↔ singular fallback so "*Battlefield*" finds the "Battlefields"
  // anchor and vice versa. Always overwrite — the singular and plural form
  // share semantics, so they should always point to the same anchor as the
  // most recent definition.
  // Handle the `-y/-ies` pattern explicitly (Ability/Abilities) before falling
  // back to the trailing-`s` rule, which would otherwise produce nonsense
  // forms like "abilitie" or "abilitys".
  if (/[^aeiou]ies$/.test(key)) {
    map.set(`${key.slice(0, -3)}y`, ruleNumber);
  } else if (/[^aeiou]y$/.test(key)) {
    map.set(`${key.slice(0, -1)}ies`, ruleNumber);
  } else if (key.endsWith("s") && key.length > 2) {
    map.set(key.slice(0, -1), ruleNumber);
  } else if (key.length > 1) {
    map.set(`${key}s`, ruleNumber);
  }
}

export function buildTermAnchors(rules: RuleResponse[]): Map<string, string> {
  const map = new Map<string, string>();
  // Pass 1: depth-0 text rules whose body is plain Title Case (no italics).
  // These are section headings stored as text rules — e.g. "Passive Abilities"
  // (363), "Replacement Effects" (367). Done first so later italicized-term
  // entries override them when the same term is defined both ways.
  for (const rule of rules) {
    if (rule.ruleType !== "text" || rule.depth !== 0) {
      continue;
    }
    if (rule.content.includes("*")) {
      continue;
    }
    if (!HEADING_TEXT_REGEX.test(rule.content)) {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/i)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  // Pass 2: text rules whose entire body is `*Term*` (or a Title Case phrase
  // wrapped in asterisks, e.g. `*Battlefield Zone*`). Iterating in document
  // order with last-wins means the keyword glossary at 805+ overrides earlier
  // subsection headings (e.g. `*Action*` resolves to the keyword at 806, not
  // the timing subsection at 158.2.a).
  for (const rule of rules) {
    if (rule.ruleType !== "text") {
      continue;
    }
    const match = rule.content.match(TERM_DEFINITION_REGEX);
    if (match) {
      addTermAnchor(map, match[1], rule.ruleNumber);
    }
  }
  // Pass 3: subtitles override everything. Split on " and " so compound
  // headings like "Chains and Showdowns" anchor both halves at the same rule.
  for (const rule of rules) {
    if (rule.ruleType !== "subtitle") {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/i)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  return map;
}

const TERM_TRAILING_PUNCT_REGEX = /[.,:;]+$/;
// Strip a possessive 's (straight or curly apostrophe) so "*Card's*" resolves
// to the "Card" anchor.
const TERM_POSSESSIVE_REGEX = /['‘’]s$/u;

interface TermLinkContext {
  anchors: ReadonlyMap<string, string>;
  currentRuleNumber?: string;
}

function visitEmphasisForTerms(node: MdNode, context: TermLinkContext): void {
  if (!node.children) {
    return;
  }
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (child.type === "link") {
      continue;
    }
    if (child.type === "emphasis" && child.children?.length === 1) {
      const inner = child.children[0];
      if (inner.type === "text" && typeof inner.value === "string") {
        const stripped = inner.value
          .trim()
          .replace(TERM_TRAILING_PUNCT_REGEX, "")
          .replace(TERM_POSSESSIVE_REGEX, "");
        const target = context.anchors.get(stripped.toLowerCase());
        if (target && target !== context.currentRuleNumber) {
          node.children[index] = {
            type: "link",
            url: `#rule-${target}`,
            children: [child],
          };
          continue;
        }
      }
    }
    visitEmphasisForTerms(child, context);
  }
}

function makeRemarkLinkifyTerms(context: TermLinkContext) {
  return () => (tree: MdNode) => {
    if (context.anchors.size === 0) {
      return;
    }
    visitEmphasisForTerms(tree, context);
  };
}

// Stable empty-map reference for callers that don't supply term anchors.
const EMPTY_TERM_ANCHORS: ReadonlyMap<string, string> = new Map();

// Tournament penalty labels — matched as literal `[Label]` strings inside rule
// bodies and styled with the IPG-derived color codes.
const PENALTY_STYLES: Record<string, string> = {
  Warning: "bg-[#ffe599] text-black",
  Warnings: "bg-[#ffe599] text-black",
  "Game Loss": "bg-[#f9cb9c] text-black",
  "No Penalty": "bg-[#cccccc] text-black",
  "Match Loss": "bg-[#ea9999] text-black",
  Disqualification: "bg-[#990000] text-white",
};

const PENALTY_REGEX = /\[(Warnings?|Game Loss|No Penalty|Match Loss|Disqualification)\]/g;

// IPG-style sources often italicize the label inside the brackets, e.g.
// `[*Warnings*]`. Strip the inner emphasis markers so the regex above (and the
// markdown parser) see clean `[Label]` tokens.
const PENALTY_NORMALIZE_REGEX =
  /\[\s*[*_]*\s*(Warnings?|Game Loss|No Penalty|Match Loss|Disqualification)\s*[*_]*\s*\]/g;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

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
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (child.type === "text" && typeof child.value === "string") {
      if (!PENALTY_REGEX.test(child.value)) {
        PENALTY_REGEX.lastIndex = 0;
        continue;
      }
      PENALTY_REGEX.lastIndex = 0;
      const replacements = splitTextOnPenalties(child.value);
      node.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
      continue;
    }
    visitHastTextNodes(child);
  }
}

const rehypeHighlightPenalties = () => (tree: HastNode) => {
  visitHastTextNodes(tree);
};

function handleSamePageAnchorClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  // Modifier-clicks and non-primary buttons should keep their default behavior
  // (open in new tab, etc.) — don't intercept those.
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const targetId = href.slice(1);
  if (!targetId) {
    return;
  }
  // Rule IDs contain dots (e.g. `rule-540.4.b`); escape so CSS doesn't read
  // them as class separators.
  const targetSelector = `#${CSS.escape(targetId)}`;
  // If the target is currently rendered, let the browser handle the scroll.
  if (document.querySelector(targetSelector)) {
    return;
  }
  // Otherwise the rule is filtered out by an active search. Reset the search
  // synchronously so React commits the unfiltered list, then scroll into view
  // and reflect the hash in the URL.
  event.preventDefault();
  flushSync(() => {
    useRulesSearchStore.getState().reset();
  });
  const target = document.querySelector(targetSelector);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start" });
    history.replaceState(null, "", href);
  }
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (typeof href === "string" && href.startsWith("#")) {
      return (
        <a
          href={href}
          className="text-primary hover:underline"
          onClick={(event) => handleSamePageAnchorClick(event, href)}
        >
          {children}
        </a>
      );
    }
    if (typeof href === "string" && href.startsWith("/rules/core#")) {
      // Cross-link from the tournament page (or anywhere) into the latest core
      // rules version, with the matching anchor preserved through the redirect.
      const hash = href.slice("/rules/core#".length);
      return (
        <Link
          to="/rules/$kind"
          params={{ kind: "core" }}
          hash={hash}
          className="text-primary hover:underline"
        >
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {children}
      </a>
    );
  },
  span: ({ children, ...props }) => {
    const penalty = (props as { "data-penalty"?: string })["data-penalty"];
    if (penalty && PENALTY_STYLES[penalty]) {
      return (
        <span
          className={cn("rounded px-1.5 py-0.5 text-sm font-semibold", PENALTY_STYLES[penalty])}
        >
          {children}
        </span>
      );
    }
    const diff = (props as { "data-diff"?: string })["data-diff"];
    if (diff === "added") {
      return (
        <mark className="rounded-xs bg-emerald-500/15 px-0.5 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
          {children}
        </mark>
      );
    }
    if (diff === "removed") {
      return (
        <span className="bg-destructive/10 text-destructive rounded-xs px-0.5 line-through decoration-from-font">
          {children}
        </span>
      );
    }
    return <span {...props}>{children}</span>;
  },
};

const ALLOWED_MARKDOWN_ELEMENTS = ["em", "strong", "code", "a", "br", "span"];

// Private Use Area sentinels marking diff segments inside merged rule content.
// They survive markdown parsing as opaque characters and are converted to
// <span data-diff="..."> nodes by `rehypeHighlightDiffs` so they render with
// styling (and the surrounding markdown, emphasis, links, still works).
const DIFF_ADDED_START = "\uE000";
const DIFF_ADDED_END = "\uE001";
const DIFF_REMOVED_START = "\uE002";
const DIFF_REMOVED_END = "\uE003";
const DIFF_REGEX = /\uE000([^\uE001]*)\uE001|\uE002([^\uE003]*)\uE003/g;

function splitTextOnDiffs(text: string): HastNode[] {
  const result: HastNode[] = [];
  let last = 0;
  DIFF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = DIFF_REGEX.exec(text);
  while (match !== null) {
    if (match.index > last) {
      result.push({ type: "text", value: text.slice(last, match.index) });
    }
    const isAdded = match[0].startsWith(DIFF_ADDED_START);
    result.push({
      type: "element",
      tagName: "span",
      properties: { "data-diff": isAdded ? "added" : "removed" },
      children: [{ type: "text", value: isAdded ? match[1] : match[2] }],
    });
    last = match.index + match[0].length;
    match = DIFF_REGEX.exec(text);
  }
  if (last < text.length) {
    result.push({ type: "text", value: text.slice(last) });
  }
  return result;
}

function visitHastTextNodesForDiffs(node: HastNode): void {
  if (!node.children) {
    return;
  }
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index];
    if (child.type === "text" && typeof child.value === "string") {
      DIFF_REGEX.lastIndex = 0;
      if (!DIFF_REGEX.test(child.value)) {
        DIFF_REGEX.lastIndex = 0;
        continue;
      }
      DIFF_REGEX.lastIndex = 0;
      const replacements = splitTextOnDiffs(child.value);
      node.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
      continue;
    }
    visitHastTextNodesForDiffs(child);
  }
}

const rehypeHighlightDiffs = () => (tree: HastNode) => {
  visitHastTextNodesForDiffs(tree);
};

// Stable references — re-creating these arrays each render busts ReactMarkdown's
// memoization, forcing a full remark/rehype reparse for every rule on every keystroke.
const REMARK_PLUGINS = [remarkLinkifyRuleReferences];
const REHYPE_PLUGINS = [rehypeHighlightPenalties];
const DIFF_REHYPE_PLUGINS = [rehypeHighlightPenalties, rehypeHighlightDiffs];

/**
 * Renders a rule's body as a constrained markdown subset, with rule-number
 * references (e.g. `rule 540`, `603.7`, `CR 116`) auto-linked to their anchor.
 * When `termAnchors` is supplied, italicized game terms (e.g. `*Combat*`,
 * `*Accelerate*`) also link to their defining rule.
 *
 * @returns The rendered rule body.
 */
export function RuleContent({
  content,
  termAnchors,
  ruleNumber,
}: {
  content: string;
  termAnchors?: ReadonlyMap<string, string>;
  ruleNumber?: string;
}) {
  // Treat every newline in the source as a hard line break by appending the
  // markdown two-space hard-break marker before each \n. Normalize penalty
  // labels first so `[*Warning*]` collapses to `[Warning]` and the rehype
  // matcher recognizes it as a single text node.
  const processed = content.replaceAll(PENALTY_NORMALIZE_REGEX, "[$1]").replaceAll("\n", "  \n");
  // Per-rule plugin set: when termAnchors is non-empty, append the term
  // linkifier with this rule's number so it can skip self-links. The compiler
  // memoizes both the array and the closure across re-renders of the same
  // rule, so ReactMarkdown's parse cache stays warm during search keystrokes.
  const remarkPlugins =
    termAnchors && termAnchors.size > 0
      ? [
          remarkLinkifyRuleReferences,
          makeRemarkLinkifyTerms({ anchors: termAnchors, currentRuleNumber: ruleNumber }),
        ]
      : REMARK_PLUGINS;
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
      allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      skipHtml
    >
      {processed}
    </ReactMarkdown>
  );
}

const VERSION_COMMENT_MARKDOWN_ELEMENTS = [
  "p",
  "em",
  "strong",
  "code",
  "a",
  "br",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "hr",
];

const VERSION_COMMENT_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 ml-6 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-6 list-decimal">{children}</ol>,
  h2: ({ children }) => <h2 className="mt-3 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3">
      {children}
    </blockquote>
  ),
};

function VersionComments({ markdown }: { markdown: string }) {
  return (
    <div className="border-border bg-muted/30 mb-4 rounded-md border p-3">
      <ReactMarkdown
        components={VERSION_COMMENT_COMPONENTS}
        allowedElements={VERSION_COMMENT_MARKDOWN_ELEMENTS}
        unwrapDisallowed
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Computes, for each foldable rule, the half-open `[start, end)` range of
 * sibling indices that collapse with it. Three grouping rules apply:
 *
 * - A `title` groups every rule until the next `title` (or the end of list).
 * - A `subtitle` groups every rule until the next `subtitle` or `title`.
 * - A `text` rule groups any directly dot-nested descendants
 *   (e.g. `103` groups `103.1`, `103.1.a`, etc.).
 *
 * Only rules that actually have at least one child get an entry.
 *
 * @returns Map of rule number to the index range of its children.
 */
function computeFoldGroups(rules: RuleResponse[]): Map<string, [number, number]> {
  const groups = new Map<string, [number, number]>();
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    let endExclusive = index + 1;
    if (rule.ruleType === "title") {
      while (endExclusive < rules.length && rules[endExclusive].ruleType !== "title") {
        endExclusive++;
      }
    } else if (rule.ruleType === "subtitle") {
      while (
        endExclusive < rules.length &&
        rules[endExclusive].ruleType !== "subtitle" &&
        rules[endExclusive].ruleType !== "title"
      ) {
        endExclusive++;
      }
    } else {
      const prefix = `${rule.ruleNumber}.`;
      while (endExclusive < rules.length && rules[endExclusive].ruleNumber.startsWith(prefix)) {
        endExclusive++;
      }
    }
    if (endExclusive > index + 1) {
      groups.set(rule.ruleNumber, [index + 1, endExclusive]);
    }
  }
  return groups;
}

/**
 * Inverts `computeFoldGroups` to map each rule number to the rule numbers
 * whose folding would hide it. A rule is hidden iff at least one of its
 * ancestors is in the folded set. Pre-computing this lets each row check
 * its visibility from the fold store without scanning the full fold map.
 *
 * @returns Map of rule number to the rule numbers that own a fold group covering it.
 */
function computeAncestorsByRule(
  rules: RuleResponse[],
  groups: Map<string, [number, number]>,
): Map<string, string[]> {
  const ancestorsByRule = new Map<string, string[]>();
  for (const [ancestor, [start, end]] of groups) {
    for (let index = start; index < end; index++) {
      const childRuleNumber = rules[index].ruleNumber;
      const existing = ancestorsByRule.get(childRuleNumber);
      if (existing) {
        existing.push(ancestor);
      } else {
        ancestorsByRule.set(childRuleNumber, [ancestor]);
      }
    }
  }
  return ancestorsByRule;
}

// Stable empty-array reference for rows with no ancestors — keeps the prop
// Object.is-equal across renders so the compiler can cache the .map() result.
const EMPTY_ANCESTORS: readonly string[] = [];

// Stable empty Set/Map references used when no moves are present.
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();
const EMPTY_STRING_MAP: ReadonlyMap<string, string> = new Map();

function parseSearchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function ruleMatches(rule: RuleResponse, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const content = rule.content.toLowerCase();
  return terms.every((term) => content.includes(term));
}

/**
 * Collects the indices that should be shown alongside a match: the most
 * recent enclosing title, the most recent enclosing subtitle, and every
 * dot-nested parent rule (e.g. `103.1.a` pulls in `103.1` and `103`).
 *
 * @returns Indices of ancestor rules within the original list.
 */
function findAncestorIndices(
  rules: RuleResponse[],
  matchIndex: number,
  rulesByNumber: Map<string, number>,
): number[] {
  const ancestors = new Set<number>();
  for (let index = matchIndex - 1; index >= 0; index--) {
    if (rules[index].ruleType === "title") {
      ancestors.add(index);
      break;
    }
  }
  for (let index = matchIndex - 1; index >= 0; index--) {
    if (rules[index].ruleType === "title") {
      break;
    }
    if (rules[index].ruleType === "subtitle") {
      ancestors.add(index);
      break;
    }
  }
  const stripped = rules[matchIndex].ruleNumber.replace(/\.$/, "");
  const parts = stripped.split(".");
  for (let length = parts.length - 1; length >= 1; length--) {
    const prefix = parts.slice(0, length).join(".");
    const ancestorIndex = rulesByNumber.get(prefix);
    if (ancestorIndex !== undefined && ancestorIndex < matchIndex) {
      ancestors.add(ancestorIndex);
    }
  }
  return [...ancestors];
}

interface SearchResult {
  visibleIndices: number[];
  matchSet: Set<number>;
  ancestorSet: Set<number>;
}

function computeSearchResult(rules: RuleResponse[], terms: string[]): SearchResult {
  const matchSet = new Set<number>();
  const ancestorSet = new Set<number>();
  if (terms.length === 0) {
    return { visibleIndices: [], matchSet, ancestorSet };
  }
  const rulesByNumber = new Map<string, number>();
  for (let index = 0; index < rules.length; index++) {
    rulesByNumber.set(rules[index].ruleNumber.replace(/\.$/, ""), index);
  }
  for (let index = 0; index < rules.length; index++) {
    if (ruleMatches(rules[index], terms)) {
      matchSet.add(index);
      for (const ancestorIndex of findAncestorIndices(rules, index, rulesByNumber)) {
        ancestorSet.add(ancestorIndex);
      }
    }
  }
  const combined = new Set<number>([...matchSet, ...ancestorSet]);
  const visibleIndices = [...combined].toSorted((a, b) => a - b);
  return { visibleIndices, matchSet, ancestorSet };
}

/**
 * Builds a single markdown string from word-diff segments by wrapping
 * non-equal segments in invisible PUA sentinels. The merged string is fed
 * back through the same markdown pipeline, and `rehypeHighlightDiffs`
 * converts the sentinels into styled spans — so emphasis/links/penalty
 * highlighting still render in the diff view.
 *
 * @returns The merged markdown source with sentinel-wrapped diff regions.
 */
function buildDiffMarkdown(segments: DiffSegment[]): string {
  let out = "";
  for (const seg of segments) {
    if (seg.type === "equal") {
      out += seg.text;
    } else if (seg.type === "added") {
      out += `${DIFF_ADDED_START}${seg.text}${DIFF_ADDED_END}`;
    } else {
      out += `${DIFF_REMOVED_START}${seg.text}${DIFF_REMOVED_END}`;
    }
  }
  return out;
}

/**
 * Renders an inline word-level diff between two rule contents through the
 * full markdown pipeline, so `*emphasis*`, links, and other formatting are
 * preserved alongside the diff highlights.
 *
 * @returns The diffed rule body with markdown rendering intact.
 */
function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const segments = textDiff(oldText, newText);
  const merged = buildDiffMarkdown(segments);
  const processed = merged.replaceAll(PENALTY_NORMALIZE_REGEX, "[$1]").replaceAll("\n", "  \n");
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={DIFF_REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
      allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      skipHtml
    >
      {processed}
    </ReactMarkdown>
  );
}

type ChangeKind = "new" | "changed" | "moved" | "replaced" | "removed";

const CHANGE_KIND_BADGE: Record<ChangeKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  },
  changed: {
    label: "Changed",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  },
  moved: {
    label: "Moved",
    className: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  },
  replaced: {
    label: "Replaced",
    className: "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  },
  removed: {
    label: "Removed",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
};

interface RuleMoves {
  /** Map from a source rule_number (removed or modified) to its new home. */
  oldToNew: Map<string, string>;
  /** Map from a target rule_number (added or modified) back to the source. */
  newToOld: Map<string, string>;
  /** Source rule_numbers that were tombstones — used to suppress those rows. */
  fromRemovedSet: Set<string>;
  /** Target rule_numbers that are brand-new adds (vs. modified). */
  toAddedSet: Set<string>;
  /**
   * Modified rule_numbers whose previous content went elsewhere AND that did
   * not themselves receive content from another tracked rule. These rows are
   * "replaced": the rule_number now holds different content, but the old
   * content lives at a new rule_number. Their stored `previousContent` is
   * misleading (it's now at the new home), so the diff is suppressed.
   */
  displacedSet: Set<string>;
}

// Fresh instance of the rule-reference regex, used by the move-detection
// normalizer. Derived from `RULE_REFERENCE_REGEX.source` so the two stay in
// sync, but with its own `lastIndex` state to avoid clobbering the markdown
// pipeline's iteration.
const RULE_REFERENCE_NORMALIZE_REGEX = new RegExp(RULE_REFERENCE_REGEX.source, "g");

/**
 * Canonicalizes rule content for move detection: strips emphasis/code
 * markers, collapses whitespace, and replaces rule cross-references
 * (`rule 173`, `CR 540`, bare `540.4.b`) with a placeholder. This way a
 * rule whose only change is renumbered cross-refs (an inevitable consequence
 * of section reorganization) still matches its previous-version twin.
 * Brackets, parens, and other punctuation stay — they carry semantic content
 * (e.g. `[Warning]` penalty labels).
 *
 * @returns The canonical form for content equality comparison.
 */
function normalizeForMoveDetection(text: string): string {
  return text
    .replaceAll(RULE_REFERENCE_NORMALIZE_REGEX, "REF")
    .replaceAll(/[*_`]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Detects "moves" — content that ended up under a different rule_number than
 * it had in the previous version. Two flavors:
 *
 * - **removed → added/modified**: a tombstone's content matches a target row's
 *   current content (classic renumber).
 * - **modified → modified**: a modified rule's *previous* content matches
 *   another rule's current content (renumber-shift, where both rule_numbers
 *   exist in both versions but the content swapped/shifted).
 *
 * Both are surfaced as a single "Moved" entry on the target, with the source
 * rule_number in a tooltip.
 *
 * @returns Move maps and per-source/target kind sets for summary accounting.
 */
function detectMoves(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
): RuleMoves {
  const addedSet = new Set(changes.added);

  // Index: target rule's current content (normalized) → its rule_number,
  // considering only rules that changed in this version (added or modified).
  // First-write-wins for duplicates, so generic boilerplate doesn't generate
  // spurious moves.
  const targetByContent = new Map<string, string>();
  for (const rule of rules) {
    const isAdded = addedSet.has(rule.ruleNumber);
    const isModifiedNow = rule.changeType === "modified" && rule.version === version;
    if (!isAdded && !isModifiedNow) {
      continue;
    }
    const norm = normalizeForMoveDetection(rule.content);
    if (!norm) {
      continue;
    }
    if (!targetByContent.has(norm)) {
      targetByContent.set(norm, rule.ruleNumber);
    }
  }

  const oldToNew = new Map<string, string>();
  const newToOld = new Map<string, string>();
  const fromRemovedSet = new Set<string>();
  const toAddedSet = new Set<string>();

  function tryRecordMove(oldRuleNumber: string, oldContent: string, fromRemoved: boolean) {
    const norm = normalizeForMoveDetection(oldContent);
    if (!norm) {
      return;
    }
    if (oldToNew.has(oldRuleNumber)) {
      return;
    }
    const newRuleNumber = targetByContent.get(norm);
    if (newRuleNumber === undefined || newRuleNumber === oldRuleNumber) {
      return;
    }
    if (newToOld.has(newRuleNumber)) {
      return;
    }
    oldToNew.set(oldRuleNumber, newRuleNumber);
    newToOld.set(newRuleNumber, oldRuleNumber);
    if (fromRemoved) {
      fromRemovedSet.add(oldRuleNumber);
    }
    if (addedSet.has(newRuleNumber)) {
      toAddedSet.add(newRuleNumber);
    }
  }

  // Pass 1: tombstone sources (removed-then-added/modified).
  for (const tombstone of changes.removed) {
    tryRecordMove(tombstone.ruleNumber, tombstone.content, true);
  }
  // Pass 2: modified-rule sources (renumber-shifts where both old + new
  // rule_numbers exist in both versions).
  for (const [oldRuleNumber, prevContent] of Object.entries(changes.modifiedPrev)) {
    tryRecordMove(oldRuleNumber, prevContent, false);
  }

  // A modified rule is "displaced" iff its old content moved elsewhere but
  // it didn't itself receive content from another tracked rule (i.e. the
  // new content is fresh / from outside the tracked diff).
  const displacedSet = new Set<string>();
  for (const oldRuleNumber of oldToNew.keys()) {
    if (fromRemovedSet.has(oldRuleNumber)) {
      continue;
    }
    if (newToOld.has(oldRuleNumber)) {
      continue;
    }
    displacedSet.add(oldRuleNumber);
  }

  return { oldToNew, newToOld, fromRemovedSet, toAddedSet, displacedSet };
}

/**
 * Compares two rule numbers in their natural numeric/alphabetic order so that
 * `100 < 100.1 < 100.1.a < 200 < 1000`. Each dot-separated segment is parsed
 * as a number when possible; pure-digit segments sort before letter segments
 * at the same depth.
 *
 * @returns Negative if a < b, positive if a > b, 0 if equal.
 */
function compareRuleNumbers(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const len = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const partA = partsA[i];
    const partB = partsB[i];
    const numA = Number(partA);
    const numB = Number(partB);
    const aIsNum = !Number.isNaN(numA) && partA !== "";
    const bIsNum = !Number.isNaN(numB) && partB !== "";
    if (aIsNum && bIsNum) {
      if (numA !== numB) {
        return numA - numB;
      }
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return partsA.length - partsB.length;
}

/**
 * Builds a map from rule_number → ChangeKind for the given version's diff.
 * A rule whose new content matches some other rule's previous content is
 * tagged "moved" — whether it's brand-new or just modified. Tombstones whose
 * content moved to a new rule_number (per `movedTombstones`) are skipped.
 *
 * @returns Map of rule_number to its change kind in this version.
 */
function buildChangeKindMap(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
  newToOld: ReadonlyMap<string, string>,
  displacedSet: ReadonlySet<string>,
  movedTombstones: ReadonlySet<string>,
): Map<string, ChangeKind> {
  const map = new Map<string, ChangeKind>();
  const addedSet = new Set(changes.added);
  for (const rule of rules) {
    if (rule.version !== version) {
      continue;
    }
    if (newToOld.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "moved");
    } else if (displacedSet.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "replaced");
    } else if (addedSet.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "new");
    } else if (rule.changeType === "modified") {
      map.set(rule.ruleNumber, "changed");
    }
  }
  for (const tombstone of changes.removed) {
    if (!movedTombstones.has(tombstone.ruleNumber)) {
      map.set(tombstone.ruleNumber, "removed");
    }
  }
  return map;
}

/**
 * Interleaves tombstones into the rules list at their natural rule-number
 * position. Skips tombstones whose content moved to a new rule_number — those
 * are surfaced as "Moved" badges on the new rule instead.
 *
 * `sort_order` is per-version and collides across versions, so we sort on
 * `rule_number` (natural order) when in diff mode to keep new + tombstone
 * rows in their canonical document position.
 *
 * @returns The merged list ordered by rule_number.
 */
function mergeTombstones(
  rules: readonly RuleResponse[],
  tombstones: readonly RuleResponse[],
  movedTombstones: ReadonlySet<string>,
): RuleResponse[] {
  const visibleTombstones = tombstones.filter((t) => !movedTombstones.has(t.ruleNumber));
  return [...rules, ...visibleTombstones].toSorted((a, b) =>
    compareRuleNumbers(a.ruleNumber, b.ruleNumber),
  );
}

function RuleRow({
  rule,
  ancestors,
  hasChildren,
  isContext,
  termAnchors,
  changeKind,
  previousContent,
  relatedRuleNumber,
}: {
  rule: RuleResponse;
  ancestors: readonly string[];
  hasChildren: boolean;
  isContext?: boolean;
  termAnchors: ReadonlyMap<string, string>;
  changeKind?: ChangeKind;
  /** For `changed` rules: the rule's content as of the previous version. */
  previousContent?: string;
  /**
   * For `moved` rules: the rule_number this content used to live under.
   * For `replaced` rules: the rule_number where the previous content now lives.
   */
  relatedRuleNumber?: string;
}) {
  // Per-row store subscriptions: only this row re-renders when its own fold
  // state or any of its ancestors' fold state flips. The parent doesn't
  // subscribe to fold state at all, so its `.map()` result stays cached
  // across fold toggles and the React Compiler can do its job.
  const isFolded = useRulesFoldStore((state) => state.foldedRules.has(rule.ruleNumber));
  const isHidden = useRulesFoldStore((state) =>
    ancestors.some((ancestor) => state.foldedRules.has(ancestor)),
  );
  const toggle = useRulesFoldStore((state) => state.toggle);
  const isDiffExpanded = useRulesDiffExpandStore((state) =>
    state.expandedRules.has(rule.ruleNumber),
  );
  const toggleDiff = useRulesDiffExpandStore((state) => state.toggle);

  const isTitle = rule.ruleType === "title";
  const isSubtitle = rule.ruleType === "subtitle";
  const contentIndentClass =
    rule.depth === 0
      ? ""
      : rule.depth === 1
        ? "pl-3 sm:pl-6"
        : rule.depth === 2
          ? "pl-6 sm:pl-12"
          : "pl-9 sm:pl-18";

  const isRemoved = changeKind === "removed";
  const isChanged = changeKind === "changed";
  const badge = changeKind ? CHANGE_KIND_BADGE[changeKind] : null;
  const showInlineDiff = isChanged && isDiffExpanded && previousContent !== undefined;

  return (
    <div
      id={`rule-${rule.ruleNumber}`}
      className={cn(
        "border-border/50 flex scroll-mt-14 items-baseline border-b py-1.5 text-sm",
        isHidden && "hidden",
        isTitle && "border-border mt-4 first:mt-0",
        isSubtitle && "border-border mt-2",
        isContext && "opacity-60",
        isRemoved && "line-through decoration-from-font opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => {
          void copyRuleLink(rule.ruleNumber);
        }}
        aria-label={`Copy link to rule ${formatRuleNumber(rule.ruleNumber)}`}
        className={cn(
          "group/rule-number text-muted-foreground hover:text-foreground mr-3 flex shrink-0 cursor-pointer items-start gap-1 text-left font-mono text-xs no-underline",
          isTitle && "font-semibold",
        )}
      >
        <span>{formatRuleNumber(rule.ruleNumber)}</span>
        <CopyIcon
          aria-hidden="true"
          className="hidden size-3 opacity-0 transition-opacity group-hover/rule-number:opacity-100 sm:inline-block"
        />
      </button>
      <span
        className={cn(
          "min-w-0 flex-1",
          contentIndentClass,
          isTitle && "text-base font-bold",
          isSubtitle && "font-semibold",
        )}
      >
        {badge ? (
          isChanged && previousContent !== undefined ? (
            <Badge
              render={
                <button
                  type="button"
                  onClick={() => toggleDiff(rule.ruleNumber)}
                  aria-expanded={isDiffExpanded}
                  aria-label={
                    isDiffExpanded
                      ? `Hide diff for rule ${formatRuleNumber(rule.ruleNumber)}`
                      : `Show diff for rule ${formatRuleNumber(rule.ruleNumber)}`
                  }
                />
              }
              className={cn(
                "mr-2 cursor-pointer align-baseline no-underline hover:opacity-80",
                badge.className,
              )}
            >
              {badge.label}
            </Badge>
          ) : (changeKind === "moved" || changeKind === "replaced") &&
            relatedRuleNumber !== undefined ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      className={cn(
                        "mr-2 cursor-help align-baseline no-underline",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </Badge>
                  }
                />
                <TooltipContent>
                  {changeKind === "moved"
                    ? `Moved from ${formatRuleNumber(relatedRuleNumber)}`
                    : `Previous content moved to ${formatRuleNumber(relatedRuleNumber)}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge className={cn("mr-2 align-baseline no-underline", badge.className)}>
              {badge.label}
            </Badge>
          )
        ) : null}
        {hasChildren ? (
          <span className="float-right ml-3 flex size-4 shrink-0 items-start">
            <button
              type="button"
              onClick={() => toggle(rule.ruleNumber)}
              aria-label={isFolded ? "Expand rule group" : "Collapse rule group"}
              aria-expanded={!isFolded}
              className="text-muted-foreground hover:text-foreground flex size-4 items-center justify-center rounded no-underline"
            >
              {isFolded ? (
                <ChevronRightIcon className="size-3" />
              ) : (
                <ChevronDownIcon className="size-3" />
              )}
            </button>
          </span>
        ) : null}
        {showInlineDiff ? (
          <InlineDiff oldText={previousContent} newText={rule.content} />
        ) : isTitle || isSubtitle ? (
          rule.content
        ) : (
          <RuleContent
            content={rule.content}
            termAnchors={termAnchors}
            ruleNumber={rule.ruleNumber}
          />
        )}
      </span>
    </div>
  );
}

function buildRulesTocItems(rules: RuleResponse[]): PageTocItem[] {
  return rules
    .filter((rule) => rule.ruleType === "title" || rule.ruleType === "subtitle")
    .map((rule) => ({
      id: `rule-${rule.ruleNumber}`,
      label: `${formatRuleNumber(rule.ruleNumber)} ${rule.content}`,
      level: rule.ruleType === "subtitle" ? 1 : 0,
    }));
}

const KIND_TITLES: Record<RuleKind, string> = {
  core: "Core Rules",
  tournament: "Tournament Rules",
};

// Lives in its own component so its `foldedRules.size`-based selector doesn't
// re-render the whole RulesContent tree on every fold toggle.
function ExpandCollapseAllButton({ foldGroupKeys }: { foldGroupKeys: string[] }) {
  const allCollapsed = useRulesFoldStore(
    (state) => foldGroupKeys.length > 0 && state.foldedRules.size >= foldGroupKeys.length,
  );
  const collapseAll = useRulesFoldStore((state) => state.collapseAll);
  const expandAll = useRulesFoldStore((state) => state.expandAll);

  const label = allCollapsed ? "Expand all" : "Collapse all";
  const handleClick = () => {
    if (allCollapsed) {
      expandAll();
    } else {
      collapseAll(foldGroupKeys);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClick}
        aria-label={label}
        className="sm:hidden"
      >
        {allCollapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
      </Button>
      <button
        type="button"
        onClick={handleClick}
        className="text-muted-foreground hover:text-foreground hidden text-xs font-medium sm:inline-flex"
      >
        {label}
      </button>
    </>
  );
}

function ChangesSummary({
  previousVersion,
  changes,
  moves,
}: {
  previousVersion: string;
  changes: RuleChangesResponse;
  moves: RuleMoves;
}) {
  const movesCount = moves.newToOld.size;
  const replacedCount = moves.displacedSet.size;
  const movedFromAdded = moves.toAddedSet.size;
  const movedFromModified = movesCount - movedFromAdded;
  const newCount = changes.added.length - movedFromAdded;
  const changedCount = Object.keys(changes.modifiedPrev).length - movedFromModified - replacedCount;
  const removedCount = changes.removed.length - moves.fromRemovedSet.size;
  if (
    newCount === 0 &&
    changedCount === 0 &&
    removedCount === 0 &&
    movesCount === 0 &&
    replacedCount === 0
  ) {
    return null;
  }
  return (
    <div className="border-border bg-muted/30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs">
      <span className="text-muted-foreground">Changes from v{previousVersion}:</span>
      <span className="text-emerald-700 dark:text-emerald-300">
        <span className="font-semibold">{newCount}</span> new
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-amber-700 dark:text-amber-300">
        <span className="font-semibold">{changedCount}</span> changed
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-sky-700 dark:text-sky-300">
        <span className="font-semibold">{movesCount}</span> moved
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-violet-700 dark:text-violet-300">
        <span className="font-semibold">{replacedCount}</span> replaced
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-destructive">
        <span className="font-semibold">{removedCount}</span> removed
      </span>
    </div>
  );
}

function ShowChangesToggle({
  kind,
  hasPreviousVersion,
}: {
  kind: RuleKind;
  hasPreviousVersion: boolean;
}) {
  const checked = useRulesShowChangesStore((state) => state.byKind[kind]);
  const setShow = useRulesShowChangesStore((state) => state.setShow);

  const switchEl = (
    <Switch
      size="sm"
      checked={hasPreviousVersion && checked}
      disabled={!hasPreviousVersion}
      onCheckedChange={(next) => setShow(kind, next)}
      aria-label="Show changes since previous version"
    />
  );

  const label = (
    <label className="text-muted-foreground hover:text-foreground data-disabled:hover:text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs font-medium select-none data-disabled:cursor-not-allowed">
      {switchEl}
      <span>Show changes</span>
    </label>
  );

  if (hasPreviousVersion) {
    return label;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>{label}</TooltipTrigger>
        <TooltipContent>First version — no prior to compare</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Returns the version immediately before `current` in the chronologically
 * ascending `versions` list, or null if there is no earlier version.
 *
 * @returns The previous version string or null.
 */
function getPreviousVersion(
  versions: readonly { version: string }[],
  current: string,
): string | null {
  const index = versions.findIndex((entry) => entry.version === current);
  if (index <= 0) {
    return null;
  }
  return versions[index - 1].version;
}

function KindTabs({ kind }: { kind: RuleKind }) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        if (value !== "core" && value !== "tournament") {
          return;
        }
        if (value === kind) {
          return;
        }
        navigate({ to: "/rules/$kind", params: { kind: value } });
      }}
    >
      <TabsList variant="line">
        <TabsTrigger value="core">Core</TabsTrigger>
        <TabsTrigger value="tournament">Tournament</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function RulesPage({ kind, version }: { kind: RuleKind; version: string | null }) {
  if (version === null) {
    return <RulesEmpty kind={kind} />;
  }
  return <RulesContent kind={kind} version={version} />;
}

function RulesEmpty({ kind }: { kind: RuleKind }) {
  return (
    <div className={`mx-auto w-full max-w-4xl ${PAGE_PADDING}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{KIND_TITLES[kind]}</h1>
      </div>
      <div className="mb-4">
        <KindTabs kind={kind} />
      </div>
      <div className="text-muted-foreground py-16 text-center">
        <p className="text-lg font-medium">No rules available yet</p>
        <p>Rules will appear here once imported by an administrator.</p>
      </div>
    </div>
  );
}

function RulesSearchBar() {
  // Local draft state keeps each keystroke's re-render scoped to this component
  // instead of bubbling up and re-rendering the entire rules list.
  const [draft, setDraft] = useState("");
  const setQuery = useRulesSearchStore((state) => state.setQuery);
  const resetSignal = useRulesSearchStore((state) => state.resetSignal);
  const debouncedSetQuery = useDebouncedCallback(setQuery, { wait: 150 });

  // Programmatic resets (e.g. an anchor click that needs to reveal a hidden
  // rule) bump resetSignal — clear the local draft so the input mirrors the
  // store. We deliberately gate on resetSignal rather than the query value:
  // during normal typing the store is briefly empty until the debounce fires,
  // which would otherwise wipe the draft mid-keystroke.
  useEffect(() => {
    if (resetSignal > 0) {
      setDraft("");
    }
  }, [resetSignal]);

  return (
    <div className="relative max-w-md flex-1">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
      <Input
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          debouncedSetQuery(next);
        }}
        placeholder="Search rules..."
        className="pl-9"
      />
    </div>
  );
}

function RulesContent({ kind, version }: { kind: RuleKind; version: string }) {
  const navigate = useNavigate();
  const { data: rulesData } = useRulesAtVersion(kind, version);
  const { data: versionsData } = useRuleVersions(kind);
  const debouncedSearchQuery = useRulesSearchStore((state) => state.query);

  // Reset fold state when navigating between rules documents — the store is
  // global, so without this it would leak across pages.
  const expandAll = useRulesFoldStore((state) => state.expandAll);
  const resetSearch = useRulesSearchStore((state) => state.reset);
  const resetDiffExpands = useRulesDiffExpandStore((state) => state.reset);
  useEffect(() => {
    expandAll();
    resetSearch();
    resetDiffExpands();
  }, [kind, version, expandAll, resetSearch, resetDiffExpands]);

  const versions = versionsData.versions;
  const comments = versions.find((v) => v.version === version)?.comments ?? null;
  const previousVersion = getPreviousVersion(versions, version);

  const baseRules = rulesData.rules;
  const changes = rulesData.changes;
  const searchTerms = parseSearchTerms(debouncedSearchQuery);
  const isSearching = searchTerms.length > 0 && debouncedSearchQuery.trim().length >= 2;
  const isEmpty = baseRules.length === 0;

  const showChangesPref = useRulesShowChangesStore((state) => state.byKind[kind]);
  const showChanges =
    showChangesPref && previousVersion !== null && changes !== undefined && !isSearching;

  const moves = showChanges && changes ? detectMoves(baseRules, changes, version) : null;
  const movedTombstones = moves?.fromRemovedSet ?? EMPTY_STRING_SET;
  const rules =
    showChanges && changes
      ? mergeTombstones(baseRules, changes.removed, movedTombstones)
      : baseRules;
  const changeKindByRule =
    showChanges && changes
      ? buildChangeKindMap(
          rules,
          changes,
          version,
          moves?.newToOld ?? EMPTY_STRING_MAP,
          moves?.displacedSet ?? EMPTY_STRING_SET,
          movedTombstones,
        )
      : null;

  const foldGroups = computeFoldGroups(rules);
  const ancestorsByRule = computeAncestorsByRule(rules, foldGroups);
  const foldGroupKeys = [...foldGroups.keys()];
  const termAnchors = rules.length > 0 ? buildTermAnchors(rules) : EMPTY_TERM_ANCHORS;
  const searchResult = isSearching ? computeSearchResult(rules, searchTerms) : null;
  const noSearchResults =
    isSearching && searchResult !== null && searchResult.visibleIndices.length === 0;

  return (
    <div className={`mx-auto w-full max-w-4xl ${PAGE_PADDING}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{KIND_TITLES[kind]}</h1>
        {versions.length > 1 ? (
          <Select
            value={version}
            onValueChange={(nextVersion) => {
              if (typeof nextVersion !== "string" || nextVersion === version) {
                return;
              }
              navigate({
                to: "/rules/$kind/$version",
                params: { kind, version: nextVersion },
              });
            }}
          >
            <SelectTrigger size="sm" className="text-muted-foreground font-mono">
              v<SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.toReversed().map((entry) => (
                <SelectItem key={entry.version} value={entry.version}>
                  v{entry.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground font-mono text-sm">v{version}</span>
        )}
      </div>

      <div className="mb-4">
        <KindTabs kind={kind} />
      </div>

      {isEmpty ? (
        <div className="text-muted-foreground py-16 text-center">
          <p className="text-lg font-medium">No rules available yet</p>
          <p>Rules will appear here once imported by an administrator.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <PageToc items={buildRulesTocItems(rules)} />
          <div className="min-w-0 flex-1">
            <div className={cn(PAGE_TOP_BAR_STICKY, "mb-4 flex flex-wrap items-center gap-3 px-0")}>
              <RulesSearchBar />
              {foldGroupKeys.length > 0 && !isSearching && (
                <ExpandCollapseAllButton foldGroupKeys={foldGroupKeys} />
              )}
              {!isSearching && (
                <ShowChangesToggle kind={kind} hasPreviousVersion={previousVersion !== null} />
              )}
            </div>
            {comments && !isSearching && <VersionComments markdown={comments} />}
            {showChanges && previousVersion && changes && moves && (
              <ChangesSummary previousVersion={previousVersion} changes={changes} moves={moves} />
            )}
            {noSearchResults ? (
              <div className="text-muted-foreground py-16 text-center">
                <p className="text-lg font-medium">No rules match your search</p>
                <p>Try fewer or different terms.</p>
              </div>
            ) : searchResult === null ? (
              rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  ancestors={ancestorsByRule.get(rule.ruleNumber) ?? EMPTY_ANCESTORS}
                  hasChildren={foldGroups.has(rule.ruleNumber)}
                  termAnchors={termAnchors}
                  changeKind={changeKindByRule?.get(rule.ruleNumber)}
                  previousContent={
                    showChanges && changes && !moves?.displacedSet.has(rule.ruleNumber)
                      ? changes.modifiedPrev[rule.ruleNumber]
                      : undefined
                  }
                  relatedRuleNumber={
                    moves?.newToOld.get(rule.ruleNumber) ?? moves?.oldToNew.get(rule.ruleNumber)
                  }
                />
              ))
            ) : (
              searchResult.visibleIndices.map((index) => {
                const rule = rules[index];
                const isContext =
                  searchResult.ancestorSet.has(index) && !searchResult.matchSet.has(index);
                return (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    ancestors={EMPTY_ANCESTORS}
                    hasChildren={false}
                    isContext={isContext}
                    termAnchors={termAnchors}
                  />
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
