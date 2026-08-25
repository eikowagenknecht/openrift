import { Command as CommandPrimitive } from "cmdk";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useLayoutEffect, useRef } from "react";

import { Command, CommandGroup, CommandInput, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface PickerListProps {
  header?: ReactNode;
  /** When set, renders a type-to-filter input above the list. Rows are matched against their `keywords` prop only (never `value`, which is usually an opaque id), so every `PickerRow` must pass `keywords` for filtering to find it. */
  searchPlaceholder?: string;
  /** Currently highlighted row id. Always pass a string (use "" for "no initial choice"); cmdk skips its controlled-state sync if `value` is undefined. */
  highlightedId: string;
  onHighlightChange: (value: string) => void;
  /** Custom keyboard shortcuts (e.g. `-`, `+`). cmdk already handles arrows / Home / End / Enter. */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, highlightedId: string) => void;
  children: ReactNode;
}

/**
 * cmdk filter that matches the query against row `keywords` only. Row `value`s
 * are opaque ids here, so cmdk's default value matching would produce phantom
 * hits. Uniform scores (1/0) keep the rows in their original order instead of
 * cmdk's score-based reordering.
 *
 * @returns 1 when a keyword contains the query (or the query is empty), else 0.
 */
function keywordFilter(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase();
  if (!query) {
    return 1;
  }
  return keywords?.some((keyword) => keyword.toLowerCase().includes(query)) ? 1 : 0;
}

/**
 * Keyboard-navigable list intended to live inside a popover. Wraps cmdk's
 * Command primitive so arrow keys, Enter, hover-sync, and a11y semantics are
 * inherited; exposes a hook for custom shortcut keys that act on the
 * currently-highlighted row.
 *
 * @returns A focusable Command root + CommandList containing the children
 *   (typically `PickerRow`s).
 */
export function PickerList({
  header,
  searchPlaceholder,
  highlightedId,
  onHighlightChange,
  onKeyDown,
  children,
}: PickerListProps) {
  // cmdk's keydown handler only fires when focus lives inside the Command, so we
  // move focus to the root on mount — or to the filter input when search is
  // enabled, so typing starts immediately. NOT via the `autoFocus` DOM attribute:
  // React honors it by calling `.focus()` with no options, which scrolls the
  // element into view. When the picker lives in a popover anchored to a tile in
  // a window-virtualized grid, that scroll jumps the whole grid and detaches the
  // popover from its anchor. Focus explicitly with `preventScroll` instead.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = rootRef.current?.querySelector<HTMLElement>("[cmdk-input]");
    (input ?? rootRef.current)?.focus({ preventScroll: true });
  }, []);

  const searchable = searchPlaceholder !== undefined;
  return (
    <Command
      ref={rootRef}
      loop
      // With a filter input, focus lives in the input; keep the root out of the
      // tab order so dialog initial-focus logic lands on the input instead.
      tabIndex={searchable ? -1 : 0}
      value={highlightedId}
      onValueChange={onHighlightChange}
      filter={searchable ? keywordFilter : undefined}
      onKeyDown={(event) => onKeyDown?.(event, highlightedId)}
    >
      {searchable ? <CommandInput placeholder={searchPlaceholder} /> : null}
      {header}
      {/* p-1 stands in for the CommandGroup a plain Command palette wraps its items in: that group
          is where the scaffold's row inset and the 4px break under the filter input come from, and
          rows go straight into the list here. Without it the input pill (inset by Command's p-1 plus
          the input wrapper's own) sits 4px narrower per side than the rows, and its bottom border
          touches the first row. */}
      <CommandList className="p-1">{children}</CommandList>
    </Command>
  );
}

interface PickerRowProps {
  value: string;
  /** Display strings the parent PickerList's filter input matches against (e.g. the row's name). Required for the row to survive filtering when the list is searchable. */
  keywords?: string[];
  /** Called on click and on Enter when this row is highlighted. Omit for rows whose interaction lives in inline controls (e.g. inline +/- buttons). */
  onSelect?: () => void;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * Scroll a row into view within its own cmdk list container only — never
 * bubbling to the window. cmdk keeps the highlighted item visible by calling the
 * native `element.scrollIntoView({ block: "nearest" })`, which walks the whole
 * ancestor scroll chain. When the picker lives in a portaled, `position: fixed`
 * popover on a window-scrolled page, that reaches the window and yanks it to the
 * top (jumping the grid and detaching the popover from its anchor). We override
 * the row's `scrollIntoView` to adjust only the `[cmdk-list]` scroll container,
 * so a non-overflowing list is a no-op and the window never moves.
 */
function scrollRowWithinList(el: HTMLElement): void {
  const container = el.closest<HTMLElement>("[cmdk-list]");
  if (!container) {
    return;
  }
  const elRect = el.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  if (elRect.top < cRect.top) {
    container.scrollTop -= cRect.top - elRect.top;
  } else if (elRect.bottom > cRect.bottom) {
    container.scrollTop += elRect.bottom - cRect.bottom;
  }
}

/**
 * One row in a PickerList. Wraps cmdk's Item primitive directly (not shadcn's
 * `CommandItem`) so the row can contain arbitrary trailing content — counts,
 * inline buttons, etc. — without the auto-rendered CheckIcon stealing layout.
 *
 * @returns A cmdk-tracked row that participates in keyboard nav and hover-sync.
 */
export function PickerRow({ value, keywords, onSelect, className, ref, children }: PickerRowProps) {
  const setRef = (node: HTMLDivElement | null) => {
    if (node) {
      // Contain cmdk's scroll-into-view to the list (see scrollRowWithinList).
      node.scrollIntoView = () => scrollRowWithinList(node);
    }
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  return (
    <CommandPrimitive.Item
      ref={setRef}
      data-slot="picker-row"
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      className={cn(
        // scroll-my-2 gives cmdk's scrollIntoView({block:"nearest"}) explicit breathing room around the row, so keyboard nav doesn't park the active row flush against (or partly under) the list edge.
        // data-selected:**:text-accent-foreground flips descendant text (including muted spans like the count or card-id) to readable contrast on the gold accent bg in dark mode.
        "data-selected:bg-accent data-selected:text-accent-foreground data-selected:**:text-accent-foreground flex scroll-my-8 items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden",
        className,
      )}
    >
      {children}
    </CommandPrimitive.Item>
  );
}

/**
 * A labelled band of related rows inside a {@link PickerList}. The heading is a
 * cmdk group heading, so it labels its rows for assistive tech and keyboard nav
 * skips straight over it — unlike a styled `PickerRow`, which arrow keys land on.
 *
 * `p-0` because `PickerList`'s own list already carries the inset that a plain
 * Command palette gets from its group.
 *
 * @returns The group, or nothing when it holds no rows.
 */
export function PickerGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <CommandGroup
      heading={label}
      className={cn(
        "**:[[cmdk-group-heading]]:text-2xs p-0 **:[[cmdk-group-heading]]:px-1.5 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-0.5 **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase",
        className,
      )}
    >
      {children}
    </CommandGroup>
  );
}
