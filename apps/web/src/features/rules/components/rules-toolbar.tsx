import type { RuleKind } from "@openrift/shared/types/api/rules";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronsDownUpIcon, ChevronsUpDownIcon, FileClockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchInput } from "@/features/cards/components/search-input";
import { useRulesFoldStore } from "@/features/rules/stores/rules-fold-store";
import { useRulesSearchStore } from "@/features/rules/stores/rules-search-store";
import { useRulesShowChangesStore } from "@/features/rules/stores/rules-show-changes-store";
import { useScopeEffect } from "@/hooks/use-scope-effect";

// Keep as its own component: inlining the `foldedRules.size` selector here
// would re-render the whole RulesContent tree on every fold toggle.
export function ExpandCollapseAllButton({ foldGroupKeys }: { foldGroupKeys: string[] }) {
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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleClick}
            aria-label={label}
          />
        }
      >
        {allCollapsed ? <ChevronsUpDownIcon /> : <ChevronsDownUpIcon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ShowChangesToggle({
  kind,
  hasPreviousVersion,
}: {
  kind: RuleKind;
  hasPreviousVersion: boolean;
}) {
  const checked = useRulesShowChangesStore((state) => state.byKind[kind]);
  const setShow = useRulesShowChangesStore((state) => state.setShow);

  const isOn = hasPreviousVersion && checked;
  const label = hasPreviousVersion
    ? "Show changes since previous version"
    : "First version, no prior to compare";

  return (
    <Tooltip>
      {/* A disabled toggle takes no pointer events: the tooltip trigger wraps
          it in a span instead of attaching to the toggle. */}
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Toggle
          variant="outline"
          pressed={isOn}
          disabled={!hasPreviousVersion}
          onPressedChange={(next) => setShow(kind, next)}
          aria-label="Show changes since previous version"
          className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground"
        >
          <FileClockIcon />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function KindTabs({ kind }: { kind: RuleKind }) {
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
        void navigate({ to: "/rules/$kind", params: { kind: value }, search: (prev) => prev });
      }}
    >
      <TabsList variant="line">
        <TabsTrigger value="core">Core</TabsTrigger>
        <TabsTrigger value="tournament">Tournament</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function RulesSearchBar({ trailing }: { trailing: string }) {
  const urlQuery = useSearch({ strict: false, select: (search) => search.q });
  const [draft, setDraft] = useState(typeof urlQuery === "string" ? urlQuery : "");
  const setQuery = useRulesSearchStore((state) => state.setQuery);
  const resetSignal = useRulesSearchStore((state) => state.resetSignal);
  const navigate = useNavigate();
  const debouncedApply = useDebouncedCallback(
    (next: string) => {
      setQuery(next);
      // Use replace, not push: avoids one history entry per keystroke.
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, q: next === "" ? undefined : next }),
        replace: true,
      });
    },
    { wait: 150 },
  );

  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (seenUrlQuery !== urlQuery) {
    setSeenUrlQuery(urlQuery);
    if (typeof urlQuery === "string" && urlQuery !== draft) {
      setDraft(urlQuery);
    }
  }
  useScopeEffect(urlQuery, (query) => {
    if (typeof query === "string" && query !== useRulesSearchStore.getState().query) {
      setQuery(query);
    }
  });

  // Gated on resetSignal, not the query value: during normal typing the store
  // is briefly empty until the debounce fires, which would wipe the draft.
  const [handledSignal, setHandledSignal] = useState(resetSignal);
  if (handledSignal !== resetSignal) {
    setHandledSignal(resetSignal);
    if (resetSignal > 0) {
      setDraft("");
    }
  }

  return (
    <SearchInput
      value={draft}
      onValueChange={(next) => {
        setDraft(next);
        debouncedApply(next);
      }}
      onClear={() => {
        setDraft("");
        debouncedApply("");
      }}
      placeholder="Search rules..."
      trailing={trailing}
      className="min-w-[200px] flex-1"
    />
  );
}
