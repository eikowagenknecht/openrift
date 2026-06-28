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
  /** Stored selection value (typically a slug). */
  value: string;
  /** Visible label rendered in the row. Long labels wrap onto multiple lines. */
  label: string;
  /**
   * Optional short code (e.g. a set code like "UNL") rendered in a fixed-width
   * gutter column before the label, so codes/labels line up across rows. It's
   * folded back into the trigger summary and search text as `"<prefix> — <label>"`.
   */
  prefix?: string;
}

/**
 * An extra, independently-selected section rendered below the primary options
 * under its own header (e.g. Finish hosted inside the Variant dropdown). Each
 * group owns its own selection array + `onChange`; the combobox routes a click
 * back to the section that owns it. Groups carry plain label/count rows — no
 * icons, prefixes, or muted styling (those stay on the primary `options`).
 */
interface MultiSelectGroup {
  /** Section header shown above this group's options. */
  label: string;
  options: readonly MultiSelectOption[];
  /** Currently selected values within this group. */
  selected: string[];
  /** Called with the group's new selection on every change. */
  onChange: (next: string[]) => void;
  /** Optional per-option faceted match count, shown inline and dimmed at zero. */
  counts?: Map<string, number>;
}

interface MultiSelectComboboxProps {
  /** Trigger label (e.g. "Channels", "Markers"). */
  label: string;
  options: readonly MultiSelectOption[];
  /** Currently selected values. */
  selected: string[];
  /** Called with the new selection on every change. */
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /**
   * Trigger appearance. "chip" (default) is the rounded badge used inside the
   * expanded filter panel; "button" is the outline button used in the compact
   * filter bar so every dropdown shares the toggle-group's button language;
   * "menu" is a full-width row that matches a dropdown-menu item, for hosting a
   * searchable dimension inside the compact bar's "More" menu.
   */
  triggerStyle?: "chip" | "button" | "menu";
  /** Optional per-option icon path (e.g. type / supertype icons). */
  icon?: (value: string) => string | undefined;
  /**
   * Render the per-option icon after the label (right-aligned) instead of
   * before it. Used by the compact filter bar so the Type / Supertype rows
   * keep their labels left-aligned with the icon-less dropdowns.
   */
  iconAfterLabel?: boolean;
  /** Optional per-option faceted match count, shown right-aligned and dimmed at zero. */
  counts?: Map<string, number>;
  /** Options to render dimmed when unselected (e.g. supplemental sets). */
  mutedOptions?: ReadonlySet<string>;
  /**
   * Header shown above the primary `options` block. Only renders when the
   * dropdown also hosts `groups` below — a single-section dropdown stays
   * headerless. Ignored when `groups` is empty.
   */
  primaryLabel?: string;
  /**
   * Extra labeled sections appended after the primary options, each with its
   * own selection + `onChange` (e.g. Finish hosted inside the Variant
   * dropdown). Rendered under their own headers, separated by a divider.
   */
  groups?: readonly MultiSelectGroup[];
  /**
   * An extra tri-state flag rendered as a regular list row at the end (e.g. the
   * Signed filter hosted inside Art Variant). It's a real combobox row, so it
   * inherits the same hover/keyboard styling as the options; only the indicator
   * differs — a check for include, a minus for exclude, nothing when off. It is
   * never part of the `selected` value.
   */
  flag?: MultiSelectFlag;
  /**
   * Size the option list to its content and only scroll once it would overflow
   * the viewport — like a dropdown menu — instead of the default fixed cap
   * (~18rem) that scrolls early. Use for short, grouped dropdowns (e.g. Variant)
   * where the cap looks like a needless scrollbar; leave off for long lists
   * (sets, types) that should stay compact.
   */
  fitContent?: boolean;
}

interface MultiSelectFlag {
  label: string;
  /** Tri-state: null = off, true = include, false = exclude. */
  state: boolean | null;
  count?: number;
  onToggle: () => void;
}

/** Sentinel list value backing {@link MultiSelectFlag} — never stored in the selection. */
const FLAG_VALUE = "__flag__";

/**
 * Outline-button styling matched to the Domain/Rarity toggle group, shared by
 * the compact bar's button-style filter triggers (value dropdowns, Stats, More):
 * a transparent resting fill (so the toolbar's blur shows through, like the
 * toggles) instead of the Button outline variant's solid `bg-background`.
 * Combine with {@link FILTER_TRIGGER_ACTIVE_CLASS} when a filter is set.
 */
export const FILTER_TRIGGER_CLASS =
  "border-input bg-transparent hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted";

/** The toggle group's pressed look (`bg-muted`), applied when a filter is active. */
export const FILTER_TRIGGER_ACTIVE_CLASS = "bg-muted dark:bg-muted";

/**
 * This app's brand theme sets `accent === primary` (gold), so the menu/combobox
 * primitives' default gold focus highlight is heavy in the filter chrome — and
 * unusable behind the gold-filled range sliders. Apply this to a popover/menu
 * surface to remap `accent` to the neutral muted highlight the rest of the app
 * uses (e.g. the header's `hover:bg-muted`), so every entry — combobox rows,
 * flags, dimension rows, and sliders — shares one subtle hover instead of gold.
 * Each portaled surface needs it directly (popups don't inherit it from a
 * parent's DOM subtree).
 */
export const NEUTRAL_HOVER_SCOPE =
  "[--accent:var(--muted)] [--accent-foreground:var(--foreground)]";

/**
 * Namespace separator for group item ids. A space never appears in a slug, so a
 * group option's id (`" <groupIndex> <value>"`) can't collide with a primary
 * option's raw value or another group's, and `decodeId` can route a click back
 * to the section that owns it.
 */
const GROUP_SEP = " ";

/** Internal, ordered view over the primary options plus any extra `groups`. */
interface Section {
  /** 0 for the primary options; 1-based for each extra group. */
  index: number;
  /** Header shown above the section; absent on a headerless single section. */
  label?: string;
  options: readonly MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  counts?: Map<string, number>;
  icon?: (value: string) => string | undefined;
  iconAfterLabel?: boolean;
  mutedOptions?: ReadonlySet<string>;
}

// Encodes a section-local value into a globally-unique combobox item id.
function encodeId(sectionIndex: number, value: string): string {
  return sectionIndex === 0 ? value : `${GROUP_SEP}${sectionIndex}${GROUP_SEP}${value}`;
}

// Splits a combobox item id back into its owning section index and raw value.
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

// Membership-only equality — order doesn't matter for a filter selection.
function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/**
 * Multi-select combobox with a searchable popover list. Built on the shadcn
 * BaseUI Combobox recipe — selection, filtering, and keyboard navigation are
 * handled by the primitive; this wrapper adapts the trigger styling and the row
 * rendering (optional icon + faceted count) to match the surrounding filter
 * chrome.
 *
 * A single axis is the common case (pass `options` + `selected` + `onChange`).
 * Pass `groups` to host extra independently-selected sections in the same
 * popover, each under its own header — e.g. the Variant dropdown that folds Art
 * Variant, Finish, and the Signed flag together to save bar space.
 *
 * @returns The combobox trigger and popover.
 */
export function MultiSelectCombobox({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  triggerStyle = "chip",
  icon,
  iconAfterLabel,
  counts,
  mutedOptions,
  primaryLabel,
  groups,
  flag,
  fitContent,
}: MultiSelectComboboxProps) {
  const hasGroups = (groups?.length ?? 0) > 0;
  // The primary options ride as section 0; each extra group follows in order.
  // The primary header only shows once a group sits below it — a lone section
  // stays headerless so existing single-axis dropdowns are unchanged.
  const sections: Section[] = [
    {
      index: 0,
      label: hasGroups ? primaryLabel : undefined,
      options,
      selected,
      onChange,
      counts,
      icon,
      iconAfterLabel,
      mutedOptions,
    },
    ...(groups ?? []).map(
      (group, groupIndex): Section => ({
        index: groupIndex + 1,
        label: group.label,
        options: group.options,
        selected: group.selected,
        onChange: group.onChange,
        counts: group.counts,
      }),
    ),
  ];

  // Flatten every section's options into the combobox's id-keyed item list (and
  // a lookup back to the owning section/option), with the flag riding last via
  // its sentinel. The flag never enters the selection — its click is translated
  // to flag.onToggle below.
  const items: string[] = [];
  const idMeta = new Map<string, { section: Section; option: MultiSelectOption }>();
  for (const section of sections) {
    for (const option of section.options) {
      const id = encodeId(section.index, option.value);
      items.push(id);
      idMeta.set(id, { section, option });
    }
    // Keep selected values that have dropped out of `options` visible, appended
    // right after their section's real options. `options` is derived from the
    // currently-available data (e.g. a collection's printings), so a selection
    // can outlive its option — move every OGN card out of a collection and OGN
    // vanishes from availableFilters while still sitting in the filter state.
    // Without this row the filter is stuck: the trigger shows it active, but the
    // list has no checkbox to clear it. The orphan has no idMeta, so it renders
    // as a plain (slug-labelled) untickable row via the fallbacks below.
    for (const value of section.selected) {
      if (!section.options.some((option) => option.value === value)) {
        items.push(encodeId(section.index, value));
      }
    }
  }
  if (flag) {
    items.push(FLAG_VALUE);
  }

  const selectedIds = sections.flatMap((section) =>
    section.selected.map((value) => encodeId(section.index, value)),
  );
  const hasSelection = selectedIds.length > 0;
  const flagActive = flag !== undefined && flag.state !== null;
  const isActive = hasSelection || flagActive;
  const labelFor = (id: string) => {
    if (id === FLAG_VALUE && flag) {
      return flag.label;
    }
    const option = idMeta.get(id)?.option;
    if (!option) {
      return decodeId(id).value;
    }
    return option.prefix ? `${option.prefix} — ${option.label}` : option.label;
  };
  // A single selection shows that option's name (e.g. "Unit") so the chosen
  // value is visible at a glance; multiple collapse to a "Type (3)" count.
  const triggerLabel =
    selectedIds.length === 1
      ? labelFor(selectedIds[0] ?? "")
      : hasSelection
        ? `${label} (${selectedIds.length})`
        : label;

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // Mirror the combobox's case-insensitive substring filter so we know which
  // rows are currently visible when deciding where dividers/headers belong.
  const isVisible = (id: string) => needle === "" || labelFor(id).toLowerCase().includes(needle);

  // Sets arrive partitioned (main first, then supplemental/muted). Drop a
  // divider above the first muted option (e.g. between main and supplemental
  // sets) — but only while a non-muted option is still visible above it, so a
  // search that filters every main set away doesn't leave a stray divider at
  // the top. Muted styling only applies to the primary options (sets), which
  // never carry groups, so this works off the raw section-0 ids.
  const dividerBeforeValue = ((): string | undefined => {
    if (!mutedOptions) {
      return;
    }
    let seenVisibleMain = false;
    for (const value of items) {
      if (value === FLAG_VALUE || !isVisible(value)) {
        continue;
      }
      if (mutedOptions.has(value)) {
        return seenVisibleMain ? value : undefined;
      }
      seenVisibleMain = true;
    }
  })();

  // Section headers: above the first currently-visible option of each labeled
  // section, render its header — with a divider when a visible row precedes it,
  // so a search that empties the sections above doesn't leave a stray rule. The
  // per-item render below can't wrap a range in a ComboboxGroup, so the header
  // is a styled row matching ComboboxLabel rather than a semantic group label.
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

  // The flag row (e.g. Signed inside Art Variant) is a distinct concern from the
  // options above it, so set it off with a divider — but only while at least one
  // option is still visible above, so a search that filters every option away
  // (or matches only the flag itself) doesn't leave a stray divider at the top.
  const showFlagDivider =
    flag !== undefined && items.some((id) => id !== FLAG_VALUE && isVisible(id));

  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={selectedIds}
      onValueChange={(next) => {
        // The flag sentinel never persists in the selection: a click on it
        // toggles the flag's tri-state instead.
        let working = next;
        if (flag && working.includes(FLAG_VALUE)) {
          flag.onToggle();
          working = working.filter((id) => id !== FLAG_VALUE);
        }
        // Route the change back to the one section that owns the toggled item.
        for (const section of sections) {
          const subset = working
            .filter((id) => decodeId(id).sectionIndex === section.index)
            .map((id) => decodeId(id).value);
          if (!sameMembers(subset, section.selected)) {
            section.onChange(subset);
          }
        }
      }}
      onInputValueChange={(value) => setQuery(value)}
      itemToStringLabel={labelFor}
    >
      {/* ComboboxTrigger appends its own chevron, so the trigger children only
          carry the label. The button trigger mirrors the Domain/Rarity toggle
          group (outline, h-7) with the toggle's pressed `bg-muted` when active. */}
      {triggerStyle === "menu" ? (
        <ComboboxTrigger
          render={
            // A full-width row mirroring DropdownMenuSubTrigger so a searchable
            // dimension sits among the "More" menu's items: the same hover/focus
            // accent and a trailing right-chevron. The combobox appends its own
            // down-chevron, which we hide ([&>svg:last-of-type]) in favour of the
            // right-chevron that matches the sibling submenu rows.
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- label injected as ComboboxTrigger children below
            <button
              type="button"
              className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none [&>svg:last-of-type]:hidden"
            />
          }
        >
          <span className="min-w-0 flex-1 text-left">{triggerLabel}</span>
          <ChevronRightIcon className="ml-auto size-4 shrink-0" />
        </ComboboxTrigger>
      ) : triggerStyle === "button" ? (
        <ComboboxTrigger
          render={
            // Outline matched to the Domain/Rarity toggle group (transparent
            // resting, `bg-muted` when active) rather than the primary fill, so a
            // set filter reads as selected, not highlighted.
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "font-medium [&>svg]:text-current",
                FILTER_TRIGGER_CLASS,
                isActive && FILTER_TRIGGER_ACTIVE_CLASS,
              )}
            />
          }
        >
          {triggerLabel}
        </ComboboxTrigger>
      ) : (
        <ComboboxTrigger
          render={
            <Badge
              variant={isActive ? "default" : "outline"}
              className="cursor-pointer [&>svg]:text-current"
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- label injected as ComboboxTrigger children below
              render={<button type="button" />}
            />
          }
        >
          {triggerLabel}
        </ComboboxTrigger>
      )}
      {/* Override the default w-(--anchor-width) so the popup grows to fit
          its widest item (e.g. long breadcrumbs), capped at 90vw on narrow
          screens with an 18rem floor so the search input stays usable. */}
      <ComboboxContent className={cn(NEUTRAL_HOVER_SCOPE, "w-max max-w-[90vw] min-w-72")}>
        {/* Home/End (including Shift+Home/End) belong to the search text field,
            not the option list. The combobox's list-navigation layer otherwise
            claims them without honouring Shift, swallowing text selection.
            Intercept in the capture phase so the browser's native caret +
            selection behaviour wins; arrow keys still navigate the list. */}
        <ComboboxInput
          placeholder={searchPlaceholder}
          showTrigger={false}
          onKeyDownCapture={(event) => {
            if (event.key === "Home" || event.key === "End") {
              event.stopPropagation();
            }
          }}
        />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        {/* fitContent drops the list's fixed ~18rem cap so it grows to its
            content and only scrolls when it would overflow the viewport — the
            (--available-height) the popup itself already respects, minus the
            search input's row. */}
        <ComboboxList
          className={cn(fitContent && "max-h-[calc(var(--available-height)---spacing(9))]")}
        >
          {(value: string) => {
            // The flag rides as a normal row — same hover/keyboard styling as the
            // options — but with a tri-state indicator (check = include, minus =
            // exclude, none = off) instead of the default selection checkmark.
            if (flag && value === FLAG_VALUE) {
              const flagItem = (
                <ComboboxItem key={value} value={value}>
                  <span className="min-w-0 flex-1 break-words whitespace-normal">
                    {flag.label}
                    {flag.count !== undefined && (
                      <span
                        className={cn(
                          "text-muted-foreground text-2xs ml-1.5 tabular-nums",
                          flag.count === 0 && "opacity-50",
                        )}
                      >
                        ({flag.count})
                      </span>
                    )}
                  </span>
                  {flag.state !== null && (
                    <span className="absolute right-2 flex size-4 items-center justify-center">
                      {flag.state ? (
                        <CheckIcon className="size-4" />
                      ) : (
                        <MinusIcon className="size-4" />
                      )}
                    </span>
                  )}
                </ComboboxItem>
              );
              if (showFlagDivider) {
                return (
                  <Fragment key={value}>
                    <ComboboxSeparator />
                    {flagItem}
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
            const item = (
              <ComboboxItem key={value} value={value} className={cn(isMuted && "opacity-65")}>
                {iconPath && !section?.iconAfterLabel && (
                  <CardIcon src={iconPath} className="size-4" />
                )}
                {/* Fixed-width, muted code gutter (e.g. set codes) so the codes
                    and the names that follow line up across every row regardless
                    of code length. */}
                {prefix && (
                  <span className="text-muted-foreground w-9 shrink-0 tabular-nums">{prefix}</span>
                )}
                {/* Wrap long labels (e.g. breadcrumb paths) instead of truncating
                    when the popover is capped on narrow screens. The count sits
                    inline right after the label (muted) rather than right-aligned,
                    so an unchecked row doesn't leave a gap before the checkmark. */}
                <span className="min-w-0 flex-1 break-words whitespace-normal">
                  {name}
                  {/* When `iconAfterLabel`, the icon sits inline right after the
                      name (before the muted count) so the labels stay
                      left-aligned with the icon-less dropdowns. */}
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
              </ComboboxItem>
            );
            // Section header (with a divider above when a section precedes it),
            // e.g. the "Art Variant" / "Finish" headers inside the Variant menu.
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
            // Divider above the first muted option (e.g. between main and
            // supplemental sets). Keyed so the fragment stays stable.
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
