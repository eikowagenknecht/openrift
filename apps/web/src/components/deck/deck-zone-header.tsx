import { cn } from "@/lib/utils";

/**
 * The header over one zone's rows in a deck list: a small-caps zone label on a
 * hairline rule, with room for trailing content (a violation popover, the
 * zone's count). Shared by the deck overview's list mode and the changes page
 * so both read as the same list.
 *
 * The height is fixed so a taller trailing element can't stretch one zone's
 * header past the others — the same rule the grid tiles follow.
 *
 * @returns The zone header row.
 */
export function DeckZoneHeader({
  label,
  children,
  className,
}: {
  label: string;
  /** Trailing content — push it right with `ml-auto`. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-6 items-center gap-2 border-b", className)}>
      <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
