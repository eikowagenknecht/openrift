import { Command as CommandPrimitive } from "cmdk";
import type { KeyboardEvent, ReactNode, Ref } from "react";

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
  return (
    <Command
      loop
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- popover opens from a click; cmdk's keydown handler only fires when focus lives inside the Command, so the root must autofocus
      autoFocus
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
 * One row in a PickerList. Wraps cmdk's Item primitive directly (not shadcn's
 * `CommandItem`) so the row can contain arbitrary trailing content — counts,
 * inline buttons, etc. — without the auto-rendered CheckIcon stealing layout.
 *
 * @returns A cmdk-tracked row that participates in keyboard nav and hover-sync.
 */
export function PickerRow({ value, onSelect, className, ref, children }: PickerRowProps) {
  return (
    <CommandPrimitive.Item
      ref={ref}
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
