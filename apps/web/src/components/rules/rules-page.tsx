import type { RuleKind, RuleResponse } from "@openrift/shared/types/api/rules";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PageToc, PageTocMobileTrigger } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import {
  PAGE_TOP_BAR_STICKY_BASE,
  PageTopBar,
  PageTopBarActions,
  PageTopBarSticky,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRuleVersions, useRulesAtVersion } from "@/hooks/use-rules";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import {
  buildChangeKindMap,
  computeAncestorsByRule,
  computeFoldGroups,
  computeSearchResult,
  detectMoves,
  detectSilentChanges,
  EMPTY_ANCESTORS,
  EMPTY_STRING_MAP,
  EMPTY_STRING_SET,
  mergeTombstones,
  parseSearchTerms,
} from "@/lib/rules-changes";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";
import { useRulesDiffExpandStore } from "@/stores/rules-diff-expand-store";
import { useRulesFoldStore } from "@/stores/rules-fold-store";
import { useRulesSearchStore } from "@/stores/rules-search-store";
import { useRulesShowChangesStore } from "@/stores/rules-show-changes-store";

import {
  buildTermAnchors,
  EMPTY_TERM_ANCHORS,
  formatRuleNumber,
  VersionComments,
} from "./rule-content";
import { RuleRow } from "./rule-row";
import { ChangesSummary } from "./rules-changes-summary";
import {
  ExpandCollapseAllButton,
  KindTabs,
  RulesSearchBar,
  ShowChangesToggle,
} from "./rules-toolbar";

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

/**
 * Returns the version immediately before `current` in the chronologically
 * ascending `versions` list, or null if there is no earlier version.
 */
function getPreviousVersion(
  versions: readonly { version: string }[],
  current: string,
): string | null {
  const index = versions.findIndex((entry) => entry.version === current);
  if (index <= 0) {
    return null;
  }
  return versions[index - 1]?.version ?? null;
}

export function RulesPage({ kind, version }: { kind: RuleKind; version: string | null }) {
  if (version === null) {
    return <RulesEmpty kind={kind} />;
  }
  return <RulesContent kind={kind} version={version} />;
}

function RulesEmpty({ kind }: { kind: RuleKind }) {
  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>{KIND_TITLES[kind]}</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "pt-3", PAGE_PADDING_NO_TOP)}>
        <div className="mb-4">
          <KindTabs kind={kind} />
        </div>
        <div className="text-muted-foreground py-16 text-center">
          <p className="text-lg font-medium">No rules available yet</p>
          <p>Rules will appear here once imported by an administrator.</p>
        </div>
      </div>
    </>
  );
}

function RulesContent({ kind, version }: { kind: RuleKind; version: string }) {
  const navigate = useNavigate();
  // The search toolbar sticks below the title bar, so its offset must include
  // the bar's measured height on top of the global header height.
  const [topBarEl, setTopBarEl] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarEl);
  const { data: rulesData } = useRulesAtVersion(kind, version);
  const { data: versionsData } = useRuleVersions(kind);
  const debouncedSearchQuery = useRulesSearchStore((state) => state.query);

  // Reset fold state when navigating between rules documents — the store is
  // global, so without this it would leak across pages.
  const expandAll = useRulesFoldStore((state) => state.expandAll);
  const resetSearch = useRulesSearchStore((state) => state.reset);
  const resetDiffExpands = useRulesDiffExpandStore((state) => state.reset);
  useScopeEffect(`${kind} ${version}`, () => {
    expandAll();
    resetSearch();
    resetDiffExpands();
  });

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
  const silentChanges =
    showChanges && changes
      ? detectSilentChanges(
          rules,
          changes,
          version,
          moves?.newToOld ?? EMPTY_STRING_MAP,
          moves?.displacedSet ?? EMPTY_STRING_SET,
        )
      : EMPTY_STRING_SET;
  const changeKindByRule =
    showChanges && changes
      ? buildChangeKindMap(
          rules,
          changes,
          version,
          moves?.newToOld ?? EMPTY_STRING_MAP,
          moves?.displacedSet ?? EMPTY_STRING_SET,
          movedTombstones,
          silentChanges,
        )
      : null;

  const foldGroups = computeFoldGroups(rules);
  const ancestorsByRule = computeAncestorsByRule(rules, foldGroups);
  const foldGroupKeys = [...foldGroups.keys()];
  const termAnchors = rules.length > 0 ? buildTermAnchors(rules) : EMPTY_TERM_ANCHORS;
  const searchResult = isSearching ? computeSearchResult(rules, searchTerms) : null;
  const noSearchResults =
    isSearching && searchResult !== null && searchResult.visibleIndices.length === 0;
  const tocItems = buildRulesTocItems(rules);
  const ruleCountLabel =
    searchResult === null
      ? `${rules.length} rules`
      : `${searchResult.matchSet.size} / ${rules.length} rules`;

  return (
    <>
      <PageTopBarSticky width="capped" ref={setTopBarEl}>
        <PageTopBar>
          <PageTopBarTitle>{KIND_TITLES[kind]}</PageTopBarTitle>
          <PageTopBarActions>
            {versions.length > 1 ? (
              <Select
                value={version}
                onValueChange={(nextVersion) => {
                  if (typeof nextVersion !== "string" || nextVersion === version) {
                    return;
                  }
                  void navigate({
                    to: "/rules/$kind/$version",
                    params: { kind, version: nextVersion },
                  });
                }}
              >
                <SelectTrigger className="text-muted-foreground font-mono">
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
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "pt-3", PAGE_PADDING_NO_TOP)}>
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
            <PageToc items={tocItems} />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  // Base, not PAGE_TOP_BAR_STICKY: this tier lives in the ToC's
                  // content column, so its surface must not bleed 100vw.
                  PAGE_TOP_BAR_STICKY_BASE,
                  // mx-safe-neg cancels the container gutter so the blur band
                  // reaches the physical edge; the bar's own px-safe re-insets controls.
                  "px-safe mx-safe-neg z-20 mb-4 flex flex-wrap items-center gap-3",
                )}
                // -1px matches PAGE_TOP_BAR_STICKY_BASE's own offset, keeping this tier flush.
                style={{ top: `calc(var(--header-height) + ${topBarHeight - 1}px)` }}
              >
                <PageTocMobileTrigger items={tocItems} />
                <RulesSearchBar trailing={ruleCountLabel} />
                {foldGroupKeys.length > 0 && !isSearching && (
                  <ExpandCollapseAllButton foldGroupKeys={foldGroupKeys} />
                )}
                {!isSearching && (
                  <ShowChangesToggle kind={kind} hasPreviousVersion={previousVersion !== null} />
                )}
              </div>
              {comments && !isSearching && <VersionComments markdown={comments} />}
              {showChanges && previousVersion && changes && moves && (
                <ChangesSummary
                  previousVersion={previousVersion}
                  changes={changes}
                  moves={moves}
                  silentChanges={silentChanges}
                />
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
                  if (!rule) {
                    return null;
                  }
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
    </>
  );
}
