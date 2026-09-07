import { CheckIcon, ChevronRightIcon, MinusIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

interface MultiSelectOption {
  value: string;
  label: string;
  prefix?: string;
}

interface MultiSelectGroup {
  label: string;
  options: readonly MultiSelectOption[];
  included: string[];
  excluded: string[];
  onCycle: (value: string) => void;
  counts?: Map<string, number>;
}

export interface MultiSelectComboboxProps {
  label: string;
  options: readonly MultiSelectOption[];
  selected: string[];
  onChange?: (next: string[]) => void;
  excluded?: string[];
  onCycle?: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  triggerStyle?: "chip" | "button" | "menu";
  icon?: (value: string) => string | undefined;
  iconAfterLabel?: boolean;
  counts?: Map<string, number>;
  mutedOptions?: ReadonlySet<string>;
  primaryLabel?: string;
  groups?: readonly MultiSelectGroup[];
  flags?: readonly MultiSelectFlag[];
  flagPosition?: "top" | "bottom";
  fitContent?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  triggerSize?: "sm" | "default";
}

interface MultiSelectFlag {
  label: string;
  state: boolean | null;
  count?: number;
  onToggle: () => void;
}

const FLAG_PREFIX = "__flag__:";
const flagId = (index: number) => `${FLAG_PREFIX}${index}`;
const isFlagId = (id: string) => id.startsWith(FLAG_PREFIX);
const flagIndex = (id: string) => Number(id.slice(FLAG_PREFIX.length));

export const FILTER_TRIGGER_CLASS =
  "border-input bg-transparent hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted";

export const FILTER_TRIGGER_ACTIVE_CLASS = "bg-muted dark:bg-muted";

/**
 * A space never appears in a slug, so a group option's id (` <groupIndex> <value>`)
 * never collides with a primary option's raw value.
 */
const GROUP_SEP = " ";

interface Section {
  index: number;
  label?: string;
  options: readonly MultiSelectOption[];
  selected: string[];
  onChange?: (next: string[]) => void;
  excluded?: string[];
  onCycle?: (value: string) => void;
  counts?: Map<string, number>;
  icon?: (value: string) => string | undefined;
  iconAfterLabel?: boolean;
  mutedOptions?: ReadonlySet<string>;
}

function isCycleSection(section: Section): boolean {
  return section.onCycle !== undefined;
}

function encodeId(sectionIndex: number, value: string): string {
  return sectionIndex === 0 ? value : `${GROUP_SEP}${sectionIndex}${GROUP_SEP}${value}`;
}

function decodeId(id: string): { sectionIndex: number; value: string } {
  if (!id.startsWith(GROUP_SEP)) {
    return { sectionIndex: 0, value: id };
  }
  const rest = id.slice(GROUP_SEP.length);
  const separator = rest.indexOf(GROUP_SEP);
  return {
    sectionIndex: Number(rest.slice(0, separator)),
    value: rest.slice(separator + GROUP_SEP.length),
  };
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function MultiSelectCombobox({
  label,
  options,
  selected,
  onChange,
  excluded,
  onCycle,
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  triggerStyle = "chip",
  icon,
  iconAfterLabel,
  counts,
  mutedOptions,
  primaryLabel,
  groups,
  flags,
  flagPosition = "bottom",
  fitContent,
  placeholder,
  triggerClassName,
  triggerSize = "sm",
}: MultiSelectComboboxProps) {
  const hasGroups = (groups?.length ?? 0) > 0;
  const sections: Section[] = [
    {
      index: 0,
      label: hasGroups ? primaryLabel : undefined,
      options,
      selected,
      onChange,
      excluded,
      onCycle,
      counts,
      icon,
      iconAfterLabel,
      mutedOptions,
    },
    ...(groups ?? []).map((group, groupIndex): Section => ({
      index: groupIndex + 1,
      label: group.label,
      options: group.options,
      selected: group.included,
      excluded: group.excluded,
      onCycle: group.onCycle,
      counts: group.counts,
    })),
  ];

  const items: string[] = [];
  const idMeta = new Map<string, { section: Section; option: MultiSelectOption }>();
  const flagList = flags ?? [];
  if (flagPosition === "top") {
    items.push(...flagList.map((_, i) => flagId(i)));
  }
  for (const section of sections) {
    for (const option of section.options) {
      const id = encodeId(section.index, option.value);
      items.push(id);
      idMeta.set(id, { section, option });
    }
    // A selection can outlive its option (e.g. a set filter after the last card
    // in it leaves the collection); keep it as an orphan row so it stays clearable.
    for (const value of [...section.selected, ...(section.excluded ?? [])]) {
      if (!section.options.some((option) => option.value === value)) {
        items.push(encodeId(section.index, value));
      }
    }
  }
  if (flagPosition === "bottom") {
    items.push(...flagList.map((_, i) => flagId(i)));
  }

  // Cycling sections must stay out of the primitive's controlled value, or their
  // own check/minus indicator fights the primitive's checkmark.
  const cycleSections = sections.filter((section) => isCycleSection(section));
  const selectedIds = sections
    .filter((section) => !isCycleSection(section))
    .flatMap((section) => section.selected.map((value) => encodeId(section.index, value)));

  const includedCount = cycleSections.reduce(
    (total, section) => total + section.selected.length,
    0,
  );
  const excludedCount = cycleSections.reduce(
    (total, section) => total + (section.excluded?.length ?? 0),
    0,
  );
  const flagCount = flagList.filter((entry) => entry.state !== null).length;
  const firstActiveFlag = flagList.findIndex((entry) => entry.state !== null);
  const totalCount = selectedIds.length + includedCount + excludedCount + flagCount;
  const isActive = totalCount > 0;
  const labelFor = (id: string) => {
    if (isFlagId(id)) {
      return flagList[flagIndex(id)].label;
    }
    const option = idMeta.get(id)?.option;
    if (!option) {
      return decodeId(id).value;
    }
    return option.prefix ? `${option.prefix} — ${option.label}` : option.label;
  };
  const summarise = (section: Section, values: readonly string[]) =>
    values.length === 1
      ? labelFor(encodeId(section.index, values[0] ?? ""))
      : String(values.length);
  const hasExclude = excludedCount > 0 || flagList.some((entry) => entry.state === false);
  const signedSummary = (): string => {
    const parts: string[] = [];
    for (const section of sections) {
      if (isCycleSection(section)) {
        if (section.selected.length > 0) {
          parts.push(`+${summarise(section, section.selected)}`);
        }
        if ((section.excluded?.length ?? 0) > 0) {
          parts.push(`−${summarise(section, section.excluded ?? [])}`);
        }
      } else if (section.selected.length > 0) {
        parts.push(summarise(section, section.selected));
      }
    }
    for (const entry of flagList) {
      if (entry.state === true) {
        parts.push(entry.label);
      } else if (entry.state === false) {
        parts.push(`−${entry.label}`);
      }
    }
    return parts.join(", ");
  };
  const singleId =
    selectedIds[0] ??
    cycleSections.flatMap((section) =>
      section.selected.map((value) => encodeId(section.index, value)),
    )[0] ??
    (firstActiveFlag === -1 ? "" : flagId(firstActiveFlag));
  const triggerLabel = isActive
    ? hasExclude || (placeholder !== undefined && (includedCount > 0 || excludedCount > 0))
      ? signedSummary()
      : totalCount === 1
        ? labelFor(singleId)
        : placeholder === undefined
          ? `${label} (${totalCount})`
          : `${totalCount} selected`
    : (placeholder ?? label);

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const isVisible = (id: string) => needle === "" || labelFor(id).toLowerCase().includes(needle);

  const dividerBeforeValue = ((): string | undefined => {
    if (!mutedOptions) {
      return;
    }
    let seenVisibleMain = false;
    for (const value of items) {
      if (isFlagId(value) || !isVisible(value)) {
        continue;
      }
      if (mutedOptions.has(value)) {
        return seenVisibleMain ? value : undefined;
      }
      seenVisibleMain = true;
    }
  })();

  const headerBeforeId = new Map<string, { label: string; withDivider: boolean }>();
  {
    let seenVisibleSection = false;
    for (const section of sections) {
      const firstVisible = section.options
        .map((option) => encodeId(section.index, option.value))
        .find((id) => isVisible(id));
      if (section.label && firstVisible !== undefined) {
        headerBeforeId.set(firstVisible, { label: section.label, withDivider: seenVisibleSection });
      }
      if (firstVisible !== undefined) {
        seenVisibleSection = true;
      }
    }
  }

  const showFlagDivider = flagList.length > 0 && items.some((id) => !isFlagId(id) && isVisible(id));
  const visibleFlagIds = items.filter((id) => isFlagId(id) && isVisible(id));

  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={selectedIds}
      onValueChange={(next) => {
        let working = next;
        for (const id of working) {
          if (isFlagId(id)) {
            flagList[flagIndex(id)].onToggle();
          }
        }
        working = working.filter((id) => !isFlagId(id));
        // A cycling section's values are never in the controlled value, so the
        // primitive can only ever add the one the user just clicked to `next`.
        for (const id of working) {
          if (selectedIds.includes(id)) {
            continue;
          }
          const { sectionIndex, value } = decodeId(id);
          const section = sections.find((entry) => entry.index === sectionIndex);
          if (section && isCycleSection(section)) {
            section.onCycle?.(value);
          }
        }
        for (const section of sections) {
          if (isCycleSection(section)) {
            continue;
          }
          const subset = working
            .filter((id) => decodeId(id).sectionIndex === section.index)
            .map((id) => decodeId(id).value);
          if (!sameMembers(subset, section.selected)) {
            section.onChange?.(subset);
          }
        }
      }}
      onInputValueChange={(value) => setQuery(value)}
      itemToStringLabel={labelFor}
    >
      {triggerStyle === "menu" ? (
        <ComboboxTrigger
          render={
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bespoke menu-item-row trigger; matches DropdownMenu item styling, no primitive covers it yet; label injected as ComboboxTrigger children below
            <button
              type="button"
              className="hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none [&>svg:last-of-type]:hidden"
            />
          }
        >
          <span className="min-w-0 flex-1 text-left">{triggerLabel}</span>
          <ChevronRightIcon className="ml-auto size-4 shrink-0" />
        </ComboboxTrigger>
      ) : triggerStyle === "button" ? (
        <ComboboxTrigger
          render={
            <Button
              variant="outline"
              size={triggerSize}
              className={cn(
                "font-medium [&>svg]:text-current",
                FILTER_TRIGGER_CLASS,
                isActive && FILTER_TRIGGER_ACTIVE_CLASS,
                triggerClassName,
              )}
            />
          }
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
        </ComboboxTrigger>
      ) : (
        <ComboboxTrigger
          render={
            <Badge
              variant={isActive ? "default" : "outline"}
              className="cursor-pointer [&>svg]:text-current"
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; Badge owns all styling; label injected as ComboboxTrigger children below
              render={<button type="button" />}
            />
          }
        >
          {triggerLabel}
        </ComboboxTrigger>
      )}
      <ComboboxContent
        className={cn("w-max max-w-[90vw] min-w-72")}
        // The popup's typeahead in the "More" menu's ComboboxTrigger otherwise
        // claims every keystroke and preventDefaults it before it reaches the input.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ComboboxInput
          placeholder={searchPlaceholder}
          showTrigger={false}
          onKeyDownCapture={(event) => {
            // Home/End (incl. Shift+) belong to the search field's native
            // caret/selection; the list-navigation layer otherwise claims them.
            if (event.key === "Home" || event.key === "End") {
              event.stopPropagation();
            }
          }}
        />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList
          className={cn(fitContent && "max-h-[calc(var(--available-height)---spacing(9))]")}
        >
          {(value: string) => {
            if (isFlagId(value)) {
              const entry = flagList[flagIndex(value)];
              const flagItem = (
                <ComboboxItem key={value} value={value}>
                  <span className="min-w-0 flex-1 break-words whitespace-normal">
                    {entry.label}
                    {entry.count !== undefined && (
                      <span
                        className={cn(
                          "text-muted-foreground text-2xs ml-1.5 tabular-nums",
                          entry.count === 0 && "opacity-50",
                        )}
                      >
                        ({entry.count})
                      </span>
                    )}
                  </span>
                  {entry.state !== null && (
                    <span className="absolute right-2 flex size-4 items-center justify-center">
                      {entry.state ? (
                        <CheckIcon className="size-4" />
                      ) : (
                        <MinusIcon className="size-4" />
                      )}
                    </span>
                  )}
                </ComboboxItem>
              );
              const leads = flagPosition === "bottom" && value === visibleFlagIds[0];
              const trails = flagPosition === "top" && value === visibleFlagIds.at(-1);
              if (showFlagDivider && (leads || trails)) {
                return (
                  <Fragment key={value}>
                    {leads && <ComboboxSeparator />}
                    {flagItem}
                    {trails && <ComboboxSeparator />}
                  </Fragment>
                );
              }
              return flagItem;
            }
            const meta = idMeta.get(value);
            const section = meta?.section;
            const option = meta?.option;
            const rawValue = option?.value ?? decodeId(value).value;
            const prefix = option?.prefix;
            const name = option?.label ?? rawValue;
            const iconPath = section?.icon?.(rawValue);
            const count = section?.counts?.get(rawValue);
            const isMuted =
              section?.mutedOptions?.has(rawValue) && !section.selected.includes(rawValue);
            const ownerSection = sections.find(
              (entry) => entry.index === decodeId(value).sectionIndex,
            );
            const cycling = ownerSection !== undefined && isCycleSection(ownerSection);
            const isIncluded = cycling && (ownerSection?.selected.includes(rawValue) ?? false);
            const isExcluded = cycling && (ownerSection?.excluded?.includes(rawValue) ?? false);
            const item = (
              <ComboboxItem key={value} value={value} className={cn(isMuted && "opacity-65")}>
                {iconPath && !section?.iconAfterLabel && (
                  <CardIcon src={iconPath} className="size-4" />
                )}
                {prefix && (
                  <span className="text-muted-foreground w-9 shrink-0 tabular-nums">{prefix}</span>
                )}
                <span className="min-w-0 flex-1 break-words whitespace-normal">
                  {name}
                  {iconPath && section?.iconAfterLabel && (
                    <CardIcon
                      src={iconPath}
                      className="ml-1.5 inline-block size-4 align-text-bottom"
                    />
                  )}
                  {count !== undefined && (
                    <span
                      className={cn(
                        "text-muted-foreground text-2xs ml-1.5 tabular-nums",
                        count === 0 && "opacity-50",
                      )}
                    >
                      ({count})
                    </span>
                  )}
                </span>
                {cycling && (isIncluded || isExcluded) && (
                  <span className="absolute right-2 flex size-4 items-center justify-center">
                    {isIncluded ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <MinusIcon className="size-4" />
                    )}
                  </span>
                )}
              </ComboboxItem>
            );
            const header = headerBeforeId.get(value);
            if (header) {
              return (
                <Fragment key={value}>
                  {header.withDivider && <ComboboxSeparator />}
                  <div className="text-muted-foreground px-2 py-1.5 text-xs">{header.label}</div>
                  {item}
                </Fragment>
              );
            }
            if (value === dividerBeforeValue) {
              return (
                <Fragment key={value}>
                  <ComboboxSeparator />
                  {item}
                </Fragment>
              );
            }
            return item;
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
