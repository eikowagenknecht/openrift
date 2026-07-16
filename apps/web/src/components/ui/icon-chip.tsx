import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/utils";

export type IconChipTone = "neutral" | "primary" | "gold" | "sky" | "green" | "violet";

/** The chip tints. One place — tiles, feed rows, and rails all read from here. */
const TONE_CLASS: Record<IconChipTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  gold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

/**
 * A tinted icon chip: the square `default` size anchors dashboard tiles, the
 * round `sm` size marks feed and rail rows.
 *
 * @returns The chip element.
 */
export function IconChip({
  icon: Icon,
  tone = "neutral",
  size = "default",
  shape = "square",
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: IconChipTone;
  size?: "sm" | "default";
  /** `square` (rounded-lg) for tiles, `round` for feed/rail rows. */
  shape?: "square" | "round";
  className?: string;
}) {
  return (
    <span
      data-slot="icon-chip"
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "default" ? "size-10" : "size-8",
        shape === "square" ? "rounded-lg" : "rounded-full",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className={size === "default" ? "size-5" : "size-4"} />
    </span>
  );
}
