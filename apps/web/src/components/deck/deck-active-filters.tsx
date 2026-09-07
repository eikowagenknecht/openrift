import { enumLabel } from "@openrift/shared";
import { MinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { useDeckListFilters } from "@/hooks/use-deck-list-filters";
import { useDeckFormatList, useEnumOrders } from "@/hooks/use-enums";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

// Visible only below `md`; the toolbar hides it above via CSS once the
// filter controls themselves are visible.
export function DeckActiveFilters() {
  const {
    search,
    formats,
    formatsExclude,
    validity,
    drafts,
    domains,
    domainsExclude,
    hasActiveFilters,
    setSearch,
    cycleFormat,
    setValidity,
    setDrafts,
    cycleDomain,
    clearAllFilters,
  } = useDeckListFilters();
  const { labels: formatLabels } = useDeckFormatList();
  const { labels: enumLabels } = useEnumOrders();

  if (!hasActiveFilters) {
    return null;
  }

  const chip = (
    key: string,
    label: string,
    excluded: boolean,
    onRemove: () => void,
    icon?: string,
  ) => (
    <Badge key={key} variant="secondary" className="gap-1">
      {excluded && <MinusIcon className="size-3 shrink-0" />}
      {icon && <img src={icon} alt="" className="size-3.5" />}
      <span className={cn(excluded && "line-through")}>{label}</span>
      <ChipRemoveButton
        aria-label={`${excluded ? "Stop excluding" : "Remove"} ${label}`}
        onClick={onRemove}
      />
    </Badge>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {search !== "" && (
        <Badge variant="secondary" className="gap-1">
          &ldquo;{search}&rdquo;
          <ChipRemoveButton aria-label="Clear search filter" onClick={() => setSearch("")} />
        </Badge>
      )}

      {formats.map((slug) =>
        chip(slug, formatLabels[slug] ?? slug, false, () => cycleFormat(slug)),
      )}
      {formatsExclude.map((slug) =>
        chip(`ex-${slug}`, formatLabels[slug] ?? slug, true, () => cycleFormat(slug)),
      )}

      {validity !== "all" &&
        chip("validity", "Legal", validity === "invalid", () => setValidity("all"))}

      {drafts !== "all" && chip("drafts", "Draft", drafts === "hide", () => setDrafts("all"))}

      {domains.map((domain) =>
        chip(
          domain,
          enumLabel(enumLabels.domains, domain),
          false,
          () => cycleDomain(domain),
          getFilterIconPath("domains", domain),
        ),
      )}
      {domainsExclude.map((domain) =>
        chip(
          `ex-${domain}`,
          enumLabel(enumLabels.domains, domain),
          true,
          () => cycleDomain(domain),
          getFilterIconPath("domains", domain),
        ),
      )}

      <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
        Clear all
      </Button>
    </div>
  );
}
