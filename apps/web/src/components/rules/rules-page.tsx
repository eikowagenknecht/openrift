import type { RuleResponse, RuleVersionResponse, RulesListResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useRules, useRuleVersions } from "@/hooks/use-rules";
import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { cn, PAGE_PADDING } from "@/lib/utils";

// ── Server functions (public, no auth) ───────────────────────────────────────

const fetchRulesByVersionFn = createServerFn({ method: "GET" })
  .inputValidator((input: { version: string }) => input)
  .handler(async ({ data }): Promise<RulesListResponse> => {
    const params = new URLSearchParams({ version: data.version });
    const res = await fetch(`${API_URL}/api/v1/rules?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Rules fetch failed: ${res.status}`);
    }
    return res.json() as Promise<RulesListResponse>;
  });

const searchRulesFn = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<RulesListResponse> => {
    const params = new URLSearchParams({ q: data.query });
    const res = await fetch(`${API_URL}/api/v1/rules?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Rules search failed: ${res.status}`);
    }
    return res.json() as Promise<RulesListResponse>;
  });

/**
 * Formats a rule number for display by stripping trailing dots.
 *
 * @returns Cleaned rule number string.
 */
function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/, "");
}

function RuleRow({ rule, searchQuery }: { rule: RuleResponse; searchQuery: string }) {
  const isTitle = rule.ruleType === "title";
  const isSubtitle = rule.ruleType === "subtitle";
  const indentClass =
    rule.depth === 0 ? "" : rule.depth === 1 ? "pl-6" : rule.depth === 2 ? "pl-12" : "pl-18";

  const highlight = searchQuery && rule.content.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div
      id={`rule-${rule.ruleNumber}`}
      className={cn(
        "border-border/50 flex gap-3 border-b py-1.5 text-sm",
        indentClass,
        isTitle && "bg-muted/50 border-border mt-4 first:mt-0",
        isSubtitle && "border-border mt-2",
        highlight && "bg-yellow-500/10",
        rule.changeType === "modified" && "bg-blue-500/5",
        rule.changeType === "added" && rule.version !== "initial" && "bg-green-500/5",
      )}
    >
      <span
        className={cn(
          "text-muted-foreground w-24 shrink-0 font-mono text-xs",
          isTitle && "font-semibold",
        )}
      >
        {formatRuleNumber(rule.ruleNumber)}
      </span>
      <span className={cn(isTitle && "text-base font-bold", isSubtitle && "font-semibold")}>
        {rule.content}
      </span>
    </div>
  );
}

function VersionSlider({
  versions,
  selectedIndex,
  onChange,
}: {
  versions: RuleVersionResponse[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  if (versions.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground shrink-0 font-mono text-xs">
        {versions[0].version}
      </span>
      <Slider
        value={[selectedIndex]}
        onValueChange={(value) => {
          const index = Array.isArray(value) ? value[0] : value;
          onChange(index);
        }}
        min={0}
        max={versions.length - 1}
        step={1}
        className="flex-1"
      />
      <span className="text-muted-foreground shrink-0 font-mono text-xs">
        {versions.at(-1)?.version}
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

  const activeData =
    searchQuery.length >= 2 ? searchResultsQuery.data : isLatest ? latestData : versionedQuery.data;

  const rules = activeData?.rules ?? [];
  const isEmpty = rules.length === 0 && !searchQuery;

  return (
    <div className={`mx-auto w-full max-w-6xl ${PAGE_PADDING}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Riftbound Rules</h1>
        {selectedVersion && (
          <span className="text-muted-foreground font-mono text-sm">v{selectedVersion}</span>
        )}
      </div>

      {versions.length > 1 && (
        <div className="mb-4 max-w-md">
          <VersionSlider
            versions={versions}
            selectedIndex={selectedVersionIndex}
            onChange={setSelectedVersionIndex}
          />
        </div>
      )}

      <div className="relative mb-4 max-w-md">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search rules..."
          className="pl-9"
        />
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
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} searchQuery={searchQuery} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
