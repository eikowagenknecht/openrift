import type { ComponentType, ReactNode, SVGProps } from "react";

import type { IconChipTone } from "@/components/ui/icon-chip";
import { IconChip } from "@/components/ui/icon-chip";
import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// StatStrip is the compact inline counts row: the quiet sibling of StatTile,
// for facts that are context rather than navigation (a roster's active/dropped
// split, a round's pairing quality). Nothing here links anywhere — reach for
// StatTile when the number should take you somewhere.
//
// It exists because the alternative kept being prose: "Penalty 12 · 0
// rematches · 3 in 3-pods" was a stat row typed as a sentence. `tone="good"`
// tints the value where a number carries a verdict (0 rematches is a win, not
// a neutral fact); leave it off when the number is just a number.

export interface StatStripItem {
  key: string;
  value: ReactNode;
  label: ReactNode;
  /** Optional leading chip — omit for a dense numbers-only strip. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  iconTone?: IconChipTone;
  /** `good` tints the value where the number is a verdict. */
  tone?: "default" | "good";
}

/**
 * A row of compact, non-interactive stats. Items wrap and share the width.
 *
 * @returns The strip element, or null when there is nothing to show.
 */
export function StatStrip({ items, className }: { items: StatStripItem[]; className?: string }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div data-slot="stat-strip" className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => (
        <div
          key={item.key}
          className="ring-foreground/10 bg-card flex min-w-28 flex-1 items-center gap-2 rounded-lg px-3 py-2 ring-1"
        >
          {item.icon ? (
            <IconChip icon={item.icon} tone={item.iconTone} size="sm" shape="round" />
          ) : null}
          <span
            className={cn(
              "font-heading text-lg font-bold tabular-nums",
              item.tone === "good" && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {item.value}
          </span>
          <span className="text-muted-foreground text-xs">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
