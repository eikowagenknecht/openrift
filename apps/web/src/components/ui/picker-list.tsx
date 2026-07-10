import { Command as CommandPrimitive } from "cmdk";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useLayoutEffect, useRef } from "react";

import { Command, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface PickerListProps {
  header?: ReactNode;
  /** Currently highlighted row id. Always pass a string (use "" for "no initial choice"); cmdk skips its controlled-state sync if `value` is undefined. */
  highlightedId: string;
  onHighlightChange: (value: string) => void;
  /** Custom keyboard shortcuts (e.g. `-`, `+`). cmdk already handles arrows / Home / End / Enter. */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, highlightedId: string) => void;
  children: ReactNode;
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
  highlightedId,
  onHighlightChange,
  onKeyDown,
  children,
}: PickerListProps) {
  // cmdk's keydown handler only fires when focus lives inside the Command, so we
  // move focus to the root on mount. NOT via the `autoFocus` DOM attribute:
  // React honors it by calling `.focus()` with no options, which scrolls the
  // element into view. When the picker lives in a popover anchored to a tile in
  // a window-virtualized grid, that scroll jumps the whole grid and detaches the
  // popover from its anchor. Focus explicitly with `preventScroll` instead.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Command
      ref={rootRef}
      loop
      tabIndex={0}
      value={highlightedId}
      onValueChange={onHighlightChange}
      onKeyDown={(event) => onKeyDown?.(event, highlightedId)}
    >
      {header}
      <CommandList>{children}</CommandList>
    </Command>
  );
}

interface PickerRowProps {
  value: string;
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
export function PickerRow({ value, onSelect, className, ref, children }: PickerRowProps) {
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
