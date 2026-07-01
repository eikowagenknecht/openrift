import type { CardFilters, PresenceDimension, PresenceState } from "@openrift/shared";
import { getAvailableFilters } from "@openrift/shared";
import { InfoIcon, PlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import { useCustomTagList, useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { cycleIncludeExclude } from "@/lib/filter-cycle";
import { PRESENCE_LABELS } from "@/lib/presence-filter";

/**
 * Makes the `button`-style combobox trigger match the SelectTrigger on the other
 * rows: same height (h-8, vs the button's `size="sm"` h-7), text size (text-sm,
 * vs `text-[0.8rem]`), weight (normal, vs the button's `font-medium`), radius,
 * and the subtle input fill — so every control in the editor is identical.
 */
export const CONTROL_WIDTH =
  "h-8 w-44 justify-between rounded-lg bg-transparent text-sm font-normal hover:bg-muted dark:bg-input/30 dark:hover:bg-input/50";

const STANDARD_HINT =
  "A standard printing is the plain version of a card: normal art, unsigned, and no promo stamp, with a plain finish — normal for commons and uncommons, normal or foil for rarer cards. Metal and metal-deluxe finishes are never standard.";

/**
 * One form row: title on the left, control on the right (mirrors the Enable-rule
 * row). The title is a plain span, not a `<label>`, since the control to its
 * right (a dropdown or switch) carries its own accessible name. An optional
 * `hint` adds an info tooltip next to the title for derived/non-obvious fields;
 * an optional `onRemove` adds a trailing button to take the row back out.
 * @returns The row node.
 */
export function FilterRow({
  label,
  hint,
  onRemove,
  children,
}: {
  label: string;
  hint?: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1 text-sm font-medium">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger
              className="text-muted-foreground hover:text-foreground cursor-default"
              aria-label={`${label} — what's this?`}
            >
              <InfoIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </span>
      {onRemove ? (
        <div className="flex items-center gap-1">
          {children}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label} filter`}
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

/** Array-valued keys of CardFilters (every include/exclude multi-select dimension). */
type ArrayKey = {
  [K in keyof CardFilters]: CardFilters[K] extends string[] ? K : never;
}[keyof CardFilters];

/** Boolean-tri-state keys of CardFilters. */
type FlagKey = {
  [K in keyof CardFilters]: CardFilters[K] extends boolean | null ? K : never;
}[keyof CardFilters];

/** Which group a dimension belongs to in the "Add filter" menu. */
type DimGroup = "standard" | "card" | "printing";

/** One addable/removable criterion in the rule's filter. */
interface DimEntry {
  key: string;
  label: string;
  group: DimGroup;
  /** Whether the dimension has options to offer (gates the Add menu only). */
  available: boolean;
  /** Whether the current filter carries a value for this dimension. */
  active: boolean;
  /** The rendered row (only shown when active or explicitly added). */
  node: ReactNode;
}

/**
 * The full controlled facet editor for a dynamic list rule (ADR-034 §V). Renders
 * the same dimensions as the card-browser filter panel — search, the tri-state
 * flags, and every multi-select with its negation companion — bound to a local
 * `CardFilters` instead of the URL. Criteria are added on demand from a grouped
 * "Add filter" menu (Standard, then Card, then Printing), so an unused rule stays
 * compact; each shown row carries a remove button. Each multi-select hosts an
 * "Exclude" group in the same dropdown, so a dimension can both include and
 * exclude values.
 * @returns The editor rows plus the add control.
 */
export function RuleFilterEditor({
  value,
  onChange,
}: {
  value: CardFilters;
  onChange: (next: CardFilters) => void;
}) {
  const { allPrintings, sets } = useCards();
  const { orders, labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const { all: customTags } = useCustomTagList();
  const available = getAvailableFilters(allPrintings, { orders, sets });

  // Dimensions the user explicitly added but hasn't given a value yet. They
  // render alongside the active ones; a value-bearing dimension is always shown
  // regardless. Resets on remount (the dialog unmounts when closed).
  const [added, setAdded] = useState<readonly string[]>([]);

  const patch = (next: Partial<CardFilters>) => onChange({ ...value, ...next });

  // Writes a presence dimension's any/none state (or clears it) into the map,
  // rebuilding without the target key rather than a dynamic delete.
  const patchPresence = (dimension: PresenceDimension, state?: PresenceState) => {
    const nextPresence: Partial<Record<PresenceDimension, PresenceState>> = {};
    for (const [existing, existingState] of Object.entries(value.presence) as [
      PresenceDimension,
      PresenceState,
    ][]) {
      if (existing !== dimension) {
        nextPresence[existing] = existingState;
      }
    }
    if (state !== undefined) {
      nextPresence[dimension] = state;
    }
    patch({ presence: nextPresence });
  };

  const languageOptions: Option[] = [...new Set(allPrintings.map((printing) => printing.language))]
    .sort((first, second) => first.localeCompare(second))
    .map((language) => ({ value: language, label: languageLabels[language] ?? language }));

  const namedOptions = (slugs: readonly string[], lookup: Record<string, string>): Option[] =>
    slugs.map((slug) => ({ value: slug, label: lookup[slug] ?? slug }));

  const setNames = new Map(sets.map((set) => [set.slug, set.name]));

  /**
   * A multi-select dimension entry whose options cycle off → include → exclude →
   * off (ADR-034), the same way the card browser's filter badges and dropdowns
   * do. Removing it clears both its include and exclude values.
   * @returns The dimension entry.
   */
  const dimension = (
    key: string,
    label: string,
    group: DimGroup,
    includeKey: ArrayKey,
    excludeKey: ArrayKey,
    options: Option[],
  ): DimEntry => ({
    key,
    label,
    group,
    available: options.length > 0,
    active: value[includeKey].length > 0 || value[excludeKey].length > 0,
    node: (
      <FilterRow
        key={key}
        label={label}
        onRemove={() => {
          patch({ [includeKey]: [], [excludeKey]: [] });
          setAdded((current) => current.filter((entry) => entry !== key));
        }}
      >
        <MultiSelectCombobox
          triggerStyle="button"
          triggerClassName={CONTROL_WIDTH}
          placeholder="Any"
          label={label}
          searchPlaceholder={`Search ${label.toLowerCase()}…`}
          options={options}
          selected={value[includeKey]}
          excluded={value[excludeKey]}
          onCycle={(toggled) => {
            const next = cycleIncludeExclude(value[includeKey], value[excludeKey], toggled);
            patch({ [includeKey]: next.included, [excludeKey]: next.excluded });
          }}
        />
      </FilterRow>
    ),
  });

  /**
   * A boolean flag entry rendered with the same cycling dropdown as the
   * multi-selects: its single option cycles off → include (requires the trait) →
   * exclude (forbids it) → off, mapping to null → true → false → null. Removing
   * it resets the tri-state field to null.
   * @returns The flag entry.
   */
  const flag = (
    key: string,
    label: string,
    optionLabel: string,
    field: FlagKey,
    group: DimGroup,
    isAvailable: boolean,
    hint?: string,
  ): DimEntry => {
    const options: Option[] = [{ value: "1", label: optionLabel }];
    return {
      key,
      label,
      group,
      available: isAvailable,
      active: value[field] !== null,
      node: (
        <FilterRow
          key={key}
          label={label}
          hint={hint}
          onRemove={() => {
            patch({ [field]: null });
            setAdded((current) => current.filter((entry) => entry !== key));
          }}
        >
          <MultiSelectCombobox
            triggerStyle="button"
            triggerClassName={CONTROL_WIDTH}
            placeholder="Any"
            label={label}
            options={options}
            selected={value[field] === true ? ["1"] : []}
            excluded={value[field] === false ? ["1"] : []}
            onCycle={() => {
              const next = cycleIncludeExclude(
                value[field] === true ? ["1"] : [],
                value[field] === false ? ["1"] : [],
                "1",
              );
              patch({
                [field]: next.included.length > 0 ? true : next.excluded.length > 0 ? false : null,
              });
            }}
          />
        </FilterRow>
      ),
    };
  };

  /**
   * A presence entry: the same cycling dropdown as the flags, but bound to a
   * presence dimension's any/none state (off → any → none → off) instead of a
   * boolean field. Stays correct as the catalog grows because it never names
   * specific values (ADR-034). Removing it clears the dimension's presence.
   * @returns The presence entry.
   */
  const presence = (
    key: string,
    presenceDimension: PresenceDimension,
    group: DimGroup,
    isAvailable: boolean,
  ): DimEntry => {
    const label = PRESENCE_LABELS[presenceDimension];
    const current = value.presence[presenceDimension];
    const options: Option[] = [{ value: "1", label }];
    return {
      key,
      label,
      group,
      available: isAvailable,
      active: current !== undefined,
      node: (
        <FilterRow
          key={key}
          label={label}
          onRemove={() => {
            patchPresence(presenceDimension);
            setAdded((entries) => entries.filter((entry) => entry !== key));
          }}
        >
          <MultiSelectCombobox
            triggerStyle="button"
            triggerClassName={CONTROL_WIDTH}
            placeholder="Any"
            label={label}
            options={options}
            selected={current === "any" ? ["1"] : []}
            excluded={current === "none" ? ["1"] : []}
            onCycle={() => {
              const next = cycleIncludeExclude(
                current === "any" ? ["1"] : [],
                current === "none" ? ["1"] : [],
                "1",
              );
              patchPresence(
                presenceDimension,
                next.included.length > 0 ? "any" : next.excluded.length > 0 ? "none" : undefined,
              );
            }}
          />
        </FilterRow>
      ),
    };
  };

  const searchEntry: DimEntry = {
    key: "search",
    label: "Search",
    group: "card",
    available: true,
    active: value.search.trim() !== "",
    node: (
      <FilterRow
        key="search"
        label="Search"
        onRemove={() => {
          patch({ search: "" });
          setAdded((current) => current.filter((entry) => entry !== "search"));
        }}
      >
        <Input
          className="h-8 w-44"
          placeholder="Name, text, keyword…"
          value={value.search}
          onChange={(event) => patch({ search: event.target.value })}
          aria-label="Search text"
        />
      </FilterRow>
    ),
  };

  // Canonical order: Standard first, then the Card group, then the Printing
  // group. Active rows render top-to-bottom in this order regardless of add
  // order, so the layout never jumps.
  const entries: DimEntry[] = [
    flag(
      "standard",
      "Standard printings",
      "Standard",
      "isStandard",
      "standard",
      available.hasNonStandard,
      STANDARD_HINT,
    ),
    searchEntry,
    dimension(
      "types",
      "Types",
      "card",
      "types",
      "typesExclude",
      namedOptions(available.types, labels.cardTypes),
    ),
    dimension(
      "superTypes",
      "Supertype",
      "card",
      "superTypes",
      "superTypesExclude",
      namedOptions(available.superTypes, labels.superTypes),
    ),
    presence("superTypesPresence", "superTypes", "card", available.superTypes.length > 0),
    dimension(
      "domains",
      "Domains",
      "card",
      "domains",
      "domainsExclude",
      namedOptions(available.domains, labels.domains),
    ),
    dimension(
      "customTags",
      "Custom Tags",
      "card",
      "customTagSlugs",
      "customTagSlugsExclude",
      customTags.map((tag) => ({ value: tag.slug, label: tag.label })),
    ),
    presence("customTagsPresence", "customTags", "card", customTags.length > 0),
    dimension(
      "keywords",
      "Keywords",
      "card",
      "keywords",
      "keywordsExclude",
      available.keywords.map((keyword) => ({ value: keyword, label: keyword })),
    ),
    presence("keywordsPresence", "keywords", "card", available.keywords.length > 0),
    flag("banned", "Banned", "Banned", "isBanned", "card", available.hasBanned),
    dimension(
      "sets",
      "Sets",
      "printing",
      "sets",
      "setsExclude",
      available.sets.map((slug) => ({ value: slug, label: setNames.get(slug) ?? slug })),
    ),
    dimension(
      "rarities",
      "Rarities",
      "printing",
      "rarities",
      "raritiesExclude",
      namedOptions(available.rarities, labels.rarities),
    ),
    dimension(
      "finishes",
      "Finishes",
      "printing",
      "finishes",
      "finishesExclude",
      namedOptions(available.finishes, labels.finishes),
    ),
    dimension(
      "artVariants",
      "Art variants",
      "printing",
      "artVariants",
      "artVariantsExclude",
      namedOptions(available.artVariants, labels.artVariants),
    ),
    dimension(
      "languages",
      "Languages",
      "printing",
      "languages",
      "languagesExclude",
      languageOptions,
    ),
    dimension(
      "markers",
      "Markers",
      "printing",
      "markerSlugs",
      "markerSlugsExclude",
      available.markers.map((marker) => ({ value: marker.slug, label: marker.label })),
    ),
    presence("markersPresence", "markers", "printing", available.markers.length > 0),
    dimension(
      "channels",
      "Distribution Channels",
      "printing",
      "distributionChannelSlugs",
      "distributionChannelSlugsExclude",
      available.distributionChannels.map((channel) => ({
        value: channel.slug,
        label: channel.label,
      })),
    ),
    presence(
      "channelsPresence",
      "distributionChannels",
      "printing",
      available.distributionChannels.length > 0,
    ),
    flag("signed", "Signed", "Signed", "isSigned", "printing", available.hasSigned),
  ];

  const addedSet = new Set(added);
  const shown = entries.filter((entry) => entry.active || addedSet.has(entry.key));
  const addable = entries.filter(
    (entry) => entry.available && !entry.active && !addedSet.has(entry.key),
  );
  const addableInGroup = (group: DimGroup) => addable.filter((entry) => entry.group === group);

  const addStandard = addableInGroup("standard");
  const addCard = addableInGroup("card");
  const addPrinting = addableInGroup("printing");

  const renderItems = (group: DimEntry[]) =>
    group.map((entry) => (
      <DropdownMenuItem
        key={entry.key}
        onClick={() => setAdded((current) => [...current, entry.key])}
      >
        {entry.label}
      </DropdownMenuItem>
    ));

  return (
    <>
      {shown.map((entry) => entry.node)}

      {addable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" size="sm" className="self-start">
                <PlusIcon />
                Add filter
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {renderItems(addStandard)}
            {addStandard.length > 0 && (addCard.length > 0 || addPrinting.length > 0) && (
              <DropdownMenuSeparator />
            )}
            {addCard.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Card</DropdownMenuLabel>
                {renderItems(addCard)}
              </DropdownMenuGroup>
            )}
            {addPrinting.length > 0 && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Printing</DropdownMenuLabel>
                {renderItems(addPrinting)}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
