import type { RuleKind, RuleResponse } from "@openrift/shared";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
// oxlint-disable no-unused-vars -- perf experiment; will restore markdown rendering shortly
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { PageToc } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRuleVersions, useRulesAtVersion } from "@/hooks/use-rules";
import { cn, PAGE_PADDING } from "@/lib/utils";

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

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (typeof href === "string" && href.startsWith("#")) {
      return (
        <a href={href} className="text-primary hover:underline">
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
    return <span {...props}>{children}</span>;
  },
};

const ALLOWED_MARKDOWN_ELEMENTS = ["em", "strong", "code", "a", "br", "span"];

// Stable references — re-creating these arrays each render busts ReactMarkdown's
// memoization, forcing a full remark/rehype reparse for every rule on every keystroke.
const REMARK_PLUGINS = [remarkLinkifyRuleReferences];
const REHYPE_PLUGINS = [rehypeHighlightPenalties];

/**
 * Renders a rule's body as a constrained markdown subset, with rule-number
 * references (e.g. `rule 540`, `603.7`, `CR 116`) auto-linked to their anchor.
 *
 * @returns The rendered rule body.
 */
export function RuleContent({ content }: { content: string }) {
  // Treat every newline in the source as a hard line break by appending the
  // markdown two-space hard-break marker before each \n. Normalize penalty
  // labels first so `[*Warning*]` collapses to `[Warning]` and the rehype
  // matcher recognizes it as a single text node.
  const processed = content.replaceAll(PENALTY_NORMALIZE_REGEX, "[$1]").replaceAll("\n", "  \n");
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
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
 * Builds an index-aligned boolean array marking which rules are hidden
 * because a fold range that covers them is collapsed.
 *
 * @returns Array of the same length as `rules`; true at positions that should be hidden.
 */
function computeHiddenIndices(
  rules: RuleResponse[],
  groups: Map<string, [number, number]>,
  foldedSet: Set<string>,
): boolean[] {
  const hidden = Array.from<boolean>({ length: rules.length }).fill(false);
  for (const ruleNumber of foldedSet) {
    const range = groups.get(ruleNumber);
    if (!range) {
      continue;
    }
    for (let index = range[0]; index < range[1]; index++) {
      hidden[index] = true;
    }
  }
  return hidden;
}

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

function RuleRow({
  rule,
  hasChildren,
  isFolded,
  onToggleFold,
  isContext,
}: {
  rule: RuleResponse;
  hasChildren: boolean;
  isFolded: boolean;
  onToggleFold: (ruleNumber: string) => void;
  isContext?: boolean;
}) {
  const isTitle = rule.ruleType === "title";
  const isSubtitle = rule.ruleType === "subtitle";
  const contentIndentClass =
    rule.depth === 0 ? "" : rule.depth === 1 ? "pl-6" : rule.depth === 2 ? "pl-12" : "pl-18";

  return (
    <div
      id={`rule-${rule.ruleNumber}`}
      className={cn(
        "border-border/50 flex gap-3 border-b py-1.5 text-sm",
        isTitle && "border-border mt-4 first:mt-0",
        isSubtitle && "border-border mt-2",
        isContext && "opacity-60",
      )}
    >
      <span className="flex w-4 shrink-0 items-start">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleFold(rule.ruleNumber)}
            aria-label={isFolded ? "Expand rule group" : "Collapse rule group"}
            aria-expanded={!isFolded}
            className="text-muted-foreground hover:text-foreground flex size-4 items-center justify-center rounded"
          >
            {isFolded ? (
              <ChevronRightIcon className="size-3" />
            ) : (
              <ChevronDownIcon className="size-3" />
            )}
          </button>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => {
          void copyRuleLink(rule.ruleNumber);
        }}
        aria-label={`Copy link to rule ${formatRuleNumber(rule.ruleNumber)}`}
        className={cn(
          "group/rule-number text-muted-foreground hover:text-foreground flex w-20 shrink-0 cursor-pointer items-start gap-1 text-left font-mono text-xs",
          isTitle && "font-semibold",
        )}
      >
        <span>{formatRuleNumber(rule.ruleNumber)}</span>
        <CopyIcon
          aria-hidden="true"
          className="size-3 opacity-0 transition-opacity group-hover/rule-number:opacity-100"
        />
      </button>
      <span
        className={cn(
          contentIndentClass,
          isTitle && "text-base font-bold",
          isSubtitle && "font-semibold",
        )}
      >
        {isTitle || isSubtitle ? rule.content : <RuleContent content={rule.content} />}
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
    <div className={`mx-auto w-full max-w-6xl ${PAGE_PADDING}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

function RulesSearchBar({ onDebouncedChange }: { onDebouncedChange: (value: string) => void }) {
  // Local draft state keeps each keystroke's re-render scoped to this component
  // instead of bubbling up and re-rendering the entire rules list.
  const [draft, setDraft] = useState("");
  const debouncedChange = useDebouncedCallback(onDebouncedChange, { wait: 150 });

  return (
    <div className="relative max-w-md flex-1">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
      <Input
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          debouncedChange(next);
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [foldedRules, setFoldedRules] = useState<Set<string>>(new Set());

  const versions = versionsData.versions;
  const comments = versions.find((v) => v.version === version)?.comments ?? null;

  const rules = rulesData?.rules ?? [];
  const searchTerms = parseSearchTerms(debouncedSearchQuery);
  const isSearching = searchTerms.length > 0 && debouncedSearchQuery.trim().length >= 2;
  const isEmpty = rules.length === 0;

  const foldGroups = computeFoldGroups(rules);
  const searchResult = isSearching ? computeSearchResult(rules, searchTerms) : null;
  const visibleIndices = (() => {
    if (searchResult) {
      return searchResult.visibleIndices;
    }
    const hidden = computeHiddenIndices(rules, foldGroups, foldedRules);
    const indices: number[] = [];
    for (let index = 0; index < rules.length; index++) {
      if (!hidden[index]) {
        indices.push(index);
      }
    }
    return indices;
  })();
  const noSearchResults = isSearching && visibleIndices.length === 0;

  const allCollapsed = foldGroups.size > 0 && foldedRules.size >= foldGroups.size;

  function toggleFold(ruleNumber: string) {
    setFoldedRules((previous) => {
      const next = new Set(previous);
      if (next.has(ruleNumber)) {
        next.delete(ruleNumber);
      } else {
        next.add(ruleNumber);
      }
      return next;
    });
  }

  function toggleAll() {
    setFoldedRules(allCollapsed ? new Set() : new Set(foldGroups.keys()));
  }

  return (
    <div className={`mx-auto w-full max-w-6xl ${PAGE_PADDING}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RulesSearchBar onDebouncedChange={setDebouncedSearchQuery} />
        {foldGroups.size > 0 && !isSearching && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
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
            {comments && !isSearching && <VersionComments markdown={comments} />}
            {noSearchResults ? (
              <div className="text-muted-foreground py-16 text-center">
                <p className="text-lg font-medium">No rules match your search</p>
                <p>Try fewer or different terms.</p>
              </div>
            ) : (
              visibleIndices.map((index) => {
                const rule = rules[index];
                const isContext =
                  searchResult !== null &&
                  searchResult.ancestorSet.has(index) &&
                  !searchResult.matchSet.has(index);
                return (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    hasChildren={searchResult === null && foldGroups.has(rule.ruleNumber)}
                    isFolded={foldedRules.has(rule.ruleNumber)}
                    onToggleFold={toggleFold}
                    isContext={isContext}
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
