import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckListGroupBy, DeckListSort } from "@/stores/deck-list-prefs-store";
import { useDeckListPrefsStore } from "@/stores/deck-list-prefs-store";

const SORT_ITEMS: { value: DeckListSort; label: string }[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently created" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
  { value: "cards-desc", label: "Most cards" },
  { value: "cards-asc", label: "Fewest cards" },
  { value: "value-desc", label: "Highest value" },
];

const GROUP_ITEMS: { value: DeckListGroupBy; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "format", label: "Group by format" },
  { value: "primary-domain", label: "Group by primary domain" },
  { value: "legend", label: "Group by legend" },
  { value: "validity", label: "Group by validity" },
];

function DomainChip({
  domain,
  active,
  onToggle,
}: {
  domain: Domain;
  active: boolean;
  onToggle: () => void;
}) {
  const lower = domain.toLowerCase();
  const ext = domain === WellKnown.domain.COLORLESS ? "svg" : "webp";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={active ? "default" : "outline"}
            size="icon-sm"
            aria-pressed={active}
            aria-label={`Filter by ${domain}`}
            onClick={onToggle}
          />
        }
      >
        <img src={`/images/domains/${lower}.${ext}`} alt="" className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{domain}</TooltipContent>
    </Tooltip>
  );
}

export function DeckListToolbar({ availableDomains }: { availableDomains: Domain[] }) {
  const search = useDeckListPrefsStore((state) => state.search);
  const setSearch = useDeckListPrefsStore((state) => state.setSearch);
  const sort = useDeckListPrefsStore((state) => state.sort);
  const setSort = useDeckListPrefsStore((state) => state.setSort);
  const density = useDeckListPrefsStore((state) => state.density);
  const setDensity = useDeckListPrefsStore((state) => state.setDensity);
  const groupBy = useDeckListPrefsStore((state) => state.groupBy);
  const setGroupBy = useDeckListPrefsStore((state) => state.setGroupBy);
  const formatFilter = useDeckListPrefsStore((state) => state.formatFilter);
  const setFormatFilter = useDeckListPrefsStore((state) => state.setFormatFilter);
  const validityFilter = useDeckListPrefsStore((state) => state.validityFilter);
  const setValidityFilter = useDeckListPrefsStore((state) => state.setValidityFilter);
  const domainFilter = useDeckListPrefsStore((state) => state.domainFilter);
  const toggleDomainFilter = useDeckListPrefsStore((state) => state.toggleDomainFilter);
  const showArchived = useDeckListPrefsStore((state) => state.showArchived);
  const setShowArchived = useDeckListPrefsStore((state) => state.setShowArchived);
  const resetFilters = useDeckListPrefsStore((state) => state.resetFilters);

  const hasActiveFilter =
    search !== "" || formatFilter !== "all" || validityFilter !== "all" || domainFilter.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: search + sort + group + density */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search decks…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
            aria-label="Search decks"
          />
          {search !== "" && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>

        <Select
          items={SORT_ITEMS}
          value={sort}
          onValueChange={(value) => {
            if (value !== null) {
              setSort(value);
            }
          }}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Sort decks">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={GROUP_ITEMS}
          value={groupBy}
          onValueChange={(value) => {
            if (value !== null) {
              setGroupBy(value);
            }
          }}
        >
          <SelectTrigger className="h-9 w-[200px]" aria-label="Group decks">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === "grid" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Grid view"
                  aria-pressed={density === "grid"}
                  onClick={() => setDensity("grid")}
                />
              }
            >
              <LayoutGridIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === "list" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="List view"
                  aria-pressed={density === "list"}
                  onClick={() => setDensity("list")}
                />
              }
            >
              <ListIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Row 2: filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">Format:</span>
          {(["all", "constructed", "freeform"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={formatFilter === value ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs capitalize"
              aria-pressed={formatFilter === value}
              onClick={() => setFormatFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">Validity:</span>
          {(["all", "valid", "invalid"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={validityFilter === value ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs capitalize"
              aria-pressed={validityFilter === value}
              onClick={() => setValidityFilter(value)}
            >
              {value}
            </Button>
          ))}
        </div>

        {availableDomains.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Domains:</span>
            {availableDomains.map((domain) => (
              <DomainChip
                key={domain}
                domain={domain}
                active={domainFilter.includes(domain)}
                onToggle={() => toggleDomainFilter(domain)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>

        {hasActiveFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={resetFilters}
          >
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}

export function ActiveFilterBadges() {
  const search = useDeckListPrefsStore((state) => state.search);
  const formatFilter = useDeckListPrefsStore((state) => state.formatFilter);
  const validityFilter = useDeckListPrefsStore((state) => state.validityFilter);
  const domainFilter = useDeckListPrefsStore((state) => state.domainFilter);

  const items: string[] = [];
  if (search.trim() !== "") {
    items.push(`"${search.trim()}"`);
  }
  if (formatFilter !== "all") {
    items.push(formatFilter);
  }
  if (validityFilter !== "all") {
    items.push(validityFilter);
  }
  for (const domain of domainFilter) {
    items.push(domain);
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((label) => (
        <Badge key={label} variant="secondary" className="text-xs capitalize">
          {label}
        </Badge>
      ))}
    </div>
  );
}
