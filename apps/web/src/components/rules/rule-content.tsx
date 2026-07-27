import type { RuleResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import type { HastNode, MdNode } from "@/lib/rules-markdown";
import {
  diffRuleMarkdown,
  preprocessRuleMarkdown,
  rehypeHighlightPenalties,
  remarkLinkifyRuleReferences,
} from "@/lib/rules-markdown";
import { cn } from "@/lib/utils";
import { useRulesSearchStore } from "@/stores/rules-search-store";

/**
 * Formats a rule number for display by stripping trailing dots.
 *
 * @returns Cleaned rule number string.
 */
export function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/u, "");
}

export async function copyRuleLink(ruleNumber: string): Promise<void> {
  const url = `${globalThis.location.origin}${globalThis.location.pathname}#rule-${ruleNumber}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success(`Link to rule ${formatRuleNumber(ruleNumber)} copied`);
  } catch {
    toast.error("Could not copy link");
  }
}

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
const TERM_DEFINITION_REGEX = new RegExp(`^\\*(${TITLE_CASE_PHRASE})\\*\\.?$`, "u");
const HEADING_TEXT_REGEX = new RegExp(`^${TITLE_CASE_PHRASE}$`, "u");

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
  if (/[^aeiou]ies$/u.test(key)) {
    map.set(`${key.slice(0, -3)}y`, ruleNumber);
  } else if (/[^aeiou]y$/u.test(key)) {
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
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
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
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  return map;
}

const TERM_TRAILING_PUNCT_REGEX = /[.,:;]+$/u;
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
export const EMPTY_TERM_ANCHORS: ReadonlyMap<string, string> = new Map();

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
  // and reflect the hash in the URL. Use pushState (not replaceState) so the
  // browser back button returns the user to where they were reading.
  event.preventDefault();
  flushSync(() => {
    useRulesSearchStore.getState().reset();
  });
  const target = document.querySelector(targetSelector);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start" });
    history.pushState(null, "", href);
  }
}

export function RuleMarkdownAnchor({ href, children }: { href?: string; children?: ReactNode }) {
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
}

export function RuleMarkdownSpan({
  penalty,
  diff,
  children,
}: {
  penalty?: string;
  diff?: string;
  children?: ReactNode;
}) {
  if (penalty && PENALTY_STYLES[penalty]) {
    return (
      <span className={cn("rounded px-1.5 py-0.5 text-sm font-semibold", PENALTY_STYLES[penalty])}>
        {children}
      </span>
    );
  }
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
  return <span>{children}</span>;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => <RuleMarkdownAnchor href={href}>{children}</RuleMarkdownAnchor>,
  span: ({ children, ...props }) => (
    <RuleMarkdownSpan
      penalty={(props as { "data-penalty"?: string })["data-penalty"]}
      diff={(props as { "data-diff"?: string })["data-diff"]}
    >
      {children}
    </RuleMarkdownSpan>
  ),
};

const ALLOWED_MARKDOWN_ELEMENTS = ["em", "strong", "code", "a", "br", "span"];

// Stable references — re-creating these arrays each render busts ReactMarkdown's
// memoization, forcing a full remark/rehype reparse for every rule on every keystroke.
const REMARK_PLUGINS = [remarkLinkifyRuleReferences];
const REHYPE_PLUGINS = [rehypeHighlightPenalties];

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
  const processed = preprocessRuleMarkdown(content);
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
  h2: ({ children }) => <h2 className="font-heading mt-3 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3">
      {children}
    </blockquote>
  ),
};

export function VersionComments({ markdown }: { markdown: string }) {
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
 * Renders one node of the merged diff tree produced by `diffRuleMarkdown`,
 * reusing the same anchor and badge components as the markdown pipeline.
 *
 * @returns The rendered node.
 */
function renderDiffNode(node: HastNode, key: number): ReactNode {
  if (node.type === "text") {
    return node.value ?? "";
  }
  const children = (node.children ?? []).map((child, index) => renderDiffNode(child, index));
  switch (node.tagName) {
    case "br": {
      return <br key={key} />;
    }
    case "em": {
      return <em key={key}>{children}</em>;
    }
    case "strong": {
      return <strong key={key}>{children}</strong>;
    }
    case "code": {
      return <code key={key}>{children}</code>;
    }
    case "a": {
      const href = node.properties?.href;
      return (
        <RuleMarkdownAnchor key={key} href={typeof href === "string" ? href : undefined}>
          {children}
        </RuleMarkdownAnchor>
      );
    }
    default: {
      const penalty = node.properties?.["data-penalty"];
      const diff = node.properties?.["data-diff"];
      return (
        <RuleMarkdownSpan
          key={key}
          penalty={typeof penalty === "string" ? penalty : undefined}
          diff={typeof diff === "string" ? diff : undefined}
        >
          {children}
        </RuleMarkdownSpan>
      );
    }
  }
}

/**
 * Renders an inline word-level diff between two rule contents. Both versions
 * are parsed through the full markdown pipeline first and diffed structurally
 * (see `diffRuleMarkdown`), so `*emphasis*`, links, and penalty badges are
 * preserved alongside the diff highlights and can't be mangled by the diff.
 *
 * @returns The diffed rule body with markdown rendering intact.
 */
export function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const nodes = diffRuleMarkdown(oldText, newText);
  return <>{nodes.map((node, index) => renderDiffNode(node, index))}</>;
}
