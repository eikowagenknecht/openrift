import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronRightIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// StatTile is the dashboard tile: a linked stat with a tinted icon chip, a
// label, the value, an optional hint pinned to the bottom, and a chevron that
// slides in on hover. Its hover is deliberately stronger than CardLink's list
// tiles (shadow lift + border shift) — overview pages use it as a primary
// navigation surface. `accent` is the gold treatment reserved for the one
// tile that needs the viewer's attention. `tone` tints the icon chip only
// (never the ring), so tiles on one overview can carry per-surface color
// without competing with the accent.

/** Icon-chip tints. Chip only — the resting ring stays neutral for every tone. */
const TONE_CHIP: Record<StatTileTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

export type StatTileTone = "neutral" | "gold" | "sky" | "green" | "violet";

/**
 * Dashboard stat tile that links to a page. Pass the navigation target via
 * `render={<Link ... />}`; extra content (avatar stacks, previews) renders
 * between the stat row and the hint.
 *
 * @returns The tile element.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  valueClassName,
  accent = false,
  tone = "neutral",
  hint,
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  /** Extra classes on the value span, e.g. `"truncate text-lg"` for long text values. */
  valueClassName?: string;
  accent?: boolean;
  /** Icon-chip tint for per-surface color. Ignored while `accent` is set. */
  tone?: StatTileTone;
  hint?: ReactNode;
}) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        // The Card edge style (ring-1, not border) so CardLink and StatTile
        // share one resting edge; hover mirrors cardLinkVariants' tint. Accent
        // keeps the shared bg-card and is carried by ring + icon chip alone.
        className: cn(
          "group/stat-tile focus-visible:ring-ring/50 bg-card hover:bg-muted/40 relative flex flex-col gap-4 rounded-lg p-5 no-underline ring-1 transition-all outline-none hover:shadow-md focus-visible:ring-2 sm:min-h-28",
          accent
            ? "ring-primary/40 hover:ring-primary/50"
            : "ring-foreground/10 hover:ring-primary/30",
          className,
        ),
        children: (
          <>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  accent ? "bg-primary/15 text-primary" : TONE_CHIP[tone],
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="text-muted-foreground text-sm font-medium">{label}</span>
              <span
                className={cn(
                  "font-heading ml-auto min-w-0 text-3xl font-semibold tabular-nums",
                  valueClassName,
                )}
              >
                {value}
              </span>
              <ChevronRightIcon className="text-muted-foreground/40 group-hover/stat-tile:text-muted-foreground size-4 shrink-0 transition-transform group-hover/stat-tile:translate-x-0.5" />
            </div>
            {children}
            {hint ? <span className="text-muted-foreground mt-auto text-xs">{hint}</span> : null}
          </>
        ),
      },
      props,
    ),
    state: {
      slot: "stat-tile",
    },
  });
}

export { StatTile };
