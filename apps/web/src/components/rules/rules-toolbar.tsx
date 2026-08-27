import type { RuleKind } from "@openrift/shared";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronsDownUpIcon, ChevronsUpDownIcon, FileClockIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { SearchInput } from "@/components/filters/search-input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRulesFoldStore } from "@/stores/rules-fold-store";
import { useRulesSearchStore } from "@/stores/rules-search-store";
import { useRulesShowChangesStore } from "@/stores/rules-show-changes-store";

// Lives in its own component so its `foldedRules.size`-based selector doesn't
// re-render the whole RulesContent tree on every fold toggle.
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
      {/* A disabled toggle takes no pointer events, so the tooltip hangs off a
          wrapper span rather than the toggle itself. */}
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Toggle
          variant="outline"
          pressed={isOn}
          disabled={!hasPreviousVersion}
          onPressedChange={(next) => setShow(kind, next)}
          aria-label="Show changes since previous version"
          // Persistent primary fill for the pressed state (incl. on hover), overriding
          // the base toggle's muted active look — same treatment as the card-browser
          // and deck-list toolbar toggles.
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
        // Keeps ?q= across the switch: looking the same term up in the other
        // document is the reason you press this.
        navigate({ to: "/rules/$kind", params: { kind: value }, search: (prev) => prev });
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
  // Local draft state keeps each keystroke's re-render scoped to this component
  // instead of bubbling up and re-rendering the entire rules list.
  const urlQuery = useSearch({ strict: false, select: (search) => search.q });
  const [draft, setDraft] = useState(typeof urlQuery === "string" ? urlQuery : "");
  const setQuery = useRulesSearchStore((state) => state.setQuery);
  const resetSignal = useRulesSearchStore((state) => state.resetSignal);
  const navigate = useNavigate();
  const debouncedApply = useDebouncedCallback(
    (next: string) => {
      setQuery(next);
      // Mirrored to the URL so a rules search is a link. Debounced with the
      // store update and replacing rather than pushing, so typing one query
      // leaves one history entry.
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, q: next === "" ? undefined : next }),
        replace: true,
      });
    },
    { wait: 150 },
  );

  // Arriving with ?q= (a shared link, the command palette's rules row) seeds
  // both the store and the input. Typing cannot loop back through here: by the
  // time the URL carries the new query the store already holds it, so the
  // guard is false and the draft is left alone mid-keystroke.
  useEffect(() => {
    if (typeof urlQuery === "string" && urlQuery !== useRulesSearchStore.getState().query) {
      setDraft(urlQuery);
      setQuery(urlQuery);
    }
  }, [urlQuery, setQuery]);

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
