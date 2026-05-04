import type { RuleResponse, RulesListResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useRef, useState } from "react";
// oxlint-disable no-unused-vars -- perf experiment; will restore markdown rendering shortly
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRules, useRuleVersions } from "@/hooks/use-rules";
import { KEYWORD_INFO, keywordAnchorSlug } from "@/lib/glossary";
import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { cn, PAGE_PADDING } from "@/lib/utils";

// ── Server functions (public, no auth) ───────────────────────────────────────

const fetchRulesByVersionFn = createServerFn({ method: "GET" })
  .inputValidator((input: { version: string }) => input)
  .handler(({ data }): Promise<RulesListResponse> => {
    const params = new URLSearchParams({ version: data.version });
    return fetchApiJson<RulesListResponse>({
      errorTitle: "Couldn't load rules",
      path: `/api/v1/rules?${params.toString()}`,
    });
  });

const searchRulesFn = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string }) => input)
  .handler(({ data }): Promise<RulesListResponse> => {
    const params = new URLSearchParams({ q: data.query });
    return fetchApiJson<RulesListResponse>({
      errorTitle: "Couldn't search rules",
      path: `/api/v1/rules?${params.toString()}`,
    });
  });

/**
 * Formats a rule number for display by stripping trailing dots.
 *
 * @returns Cleaned rule number string.
 */
function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/, "");
}

const KEYWORD_REGEX = (() => {
  const names = Object.keys(KEYWORD_INFO).toSorted((a, b) => b.length - a.length);
  const escaped = names.map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
  return new RegExp(String.raw`(?<![A-Za-z])(${escaped.join("|")})(?![A-Za-z])`, "g");
})();

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

function splitTextOnKeywords(text: string): MdNode[] {
  const parts = text.split(KEYWORD_REGEX);
  if (parts.length === 1) {
    return [{ type: "text", value: text }];
  }
  const result: MdNode[] = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (KEYWORD_INFO[part]) {
      result.push({
        type: "link",
        url: `/glossary#${keywordAnchorSlug(part)}`,
        children: [{ type: "text", value: part }],
      });
    } else {
      result.push({ type: "text", value: part });
    }
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
      // Don't linkify text inside an existing link.
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      const replacements = splitTextOnKeywords(child.value);
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

const remarkLinkifyKeywords = () => (tree: MdNode) => {
  visitTextNodes(tree);
};

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (typeof href === "string" && href.startsWith("/glossary#")) {
      const hash = href.slice("/glossary#".length);
      return (
        <Link to="/glossary" hash={hash} className="text-primary hover:underline">
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
};

const ALLOWED_MARKDOWN_ELEMENTS = ["em", "strong", "code", "a", "br"];

/**
 * Renders a rule's body as a constrained markdown subset, with any known
 * keyword names automatically linked into the /glossary page's anchor.
 *
 * @returns The rendered rule body.
 */
export function RuleContent({ content }: { content: string }) {
  // Treat every newline in the source as a hard line break by appending the
  // markdown two-space hard-break marker before each \n.
  const processed = content.replaceAll("\n", "  \n");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkLinkifyKeywords]}
      components={MARKDOWN_COMPONENTS}
      allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      skipHtml
    >
      {processed}
    </ReactMarkdown>
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

function RuleRow({
  rule,
  hasChildren,
  isFolded,
  onToggleFold,
}: {
  rule: RuleResponse;
  hasChildren: boolean;
  isFolded: boolean;
  onToggleFold: (ruleNumber: string) => void;
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
      <span
        className={cn(
          "text-muted-foreground w-24 shrink-0 font-mono text-xs",
          isTitle && "font-semibold",
        )}
      >
        {formatRuleNumber(rule.ruleNumber)}
      </span>
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

function RulesToc({ rules }: { rules: RuleResponse[] }) {
  const sections = rules.filter((r) => r.ruleType === "title" || r.ruleType === "subtitle");

  return (
    <nav className="space-y-0.5">
      {sections.map((rule) => (
        <a
          key={rule.ruleNumber}
          href={`#rule-${rule.ruleNumber}`}
          className={cn(
            "text-muted-foreground hover:text-foreground block truncate text-xs",
            rule.ruleType === "title" && "mt-2 font-semibold first:mt-0",
            rule.ruleType === "subtitle" && "pl-3",
          )}
        >
          {formatRuleNumber(rule.ruleNumber)} {rule.content}
        </a>
      ))}
    </nav>
  );
}

export function RulesPage() {
  const { data: latestData } = useRules();
  const { data: versionsData } = useRuleVersions();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(
    versionsData.versions.length - 1,
  );
  const [foldedRules, setFoldedRules] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const versions = versionsData.versions;
  const isLatest = selectedVersionIndex === versions.length - 1;
  const selectedVersion = versions[selectedVersionIndex]?.version;

  const versionedQuery = useQuery({
    queryKey: queryKeys.rules.byVersion(selectedVersion ?? ""),
    queryFn: () => fetchRulesByVersionFn({ data: { version: selectedVersion ?? "" } }),
    enabled: !isLatest && Boolean(selectedVersion),
    staleTime: 5 * 60 * 1000,
  });

  const searchResultsQuery = useQuery({
    queryKey: queryKeys.rules.search(searchQuery),
    queryFn: () => searchRulesFn({ data: { query: searchQuery } }),
    enabled: searchQuery.length >= 2,
    staleTime: 60 * 1000,
  });

  const isSearching = searchQuery.length >= 2;
  const activeData = isSearching
    ? searchResultsQuery.data
    : isLatest
      ? latestData
      : versionedQuery.data;

  const rules = activeData?.rules ?? [];
  const isEmpty = rules.length === 0 && !searchQuery;

  const foldGroups = computeFoldGroups(rules);
  const hidden = isSearching
    ? Array.from<boolean>({ length: rules.length }).fill(false)
    : computeHiddenIndices(rules, foldGroups, foldedRules);
  const visibleRules = rules.filter((_, index) => !hidden[index]);

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
        <h1 className="text-2xl font-bold">Riftbound Rules</h1>
        {selectedVersion &&
          (versions.length > 1 ? (
            <Select
              value={selectedVersion}
              onValueChange={(value) => {
                const nextIndex = versions.findIndex((v) => v.version === value);
                if (nextIndex === -1) {
                  return;
                }
                setSelectedVersionIndex(nextIndex);
              }}
            >
              <SelectTrigger size="sm" className="text-muted-foreground font-mono">
                v<SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.toReversed().map((version) => (
                  <SelectItem key={version.version} value={version.version}>
                    v{version.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-muted-foreground font-mono text-sm">v{selectedVersion}</span>
          ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rules..."
            className="pl-9"
          />
        </div>
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
          <p className="text-sm">Rules will appear here once imported by an administrator.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-16 max-h-[calc(100vh-5rem)] overflow-y-auto">
              <RulesToc rules={rules} />
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            {visibleRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                hasChildren={foldGroups.has(rule.ruleNumber)}
                isFolded={foldedRules.has(rule.ruleNumber)}
                onToggleFold={toggleFold}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
