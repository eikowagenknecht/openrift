import type { MetaEventTier } from "@openrift/shared";

import { Badge } from "@/components/ui/badge";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

/** Store and casual are deliberately alike: the label is what separates them. */
const MUTED_TIER = { variant: "muted", className: "" } as const;

/**
 * Gold is the archive's colour for winning, so only the top tier gets it. The
 * competitive teal is written out for both themes on purpose: the dark palette's
 * primary is amber, so a themed outline would land back on the premier gold and
 * the two tiers would stop being distinguishable at a glance.
 */
const TIER_STYLE: Record<MetaEventTier, { variant: "outline" | "muted"; className: string }> = {
  premier: { variant: "outline", className: "border-border-accent text-border-accent" },
  competitive: {
    variant: "outline",
    className: "border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300",
  },
  store: MUTED_TIER,
  casual: MUTED_TIER,
};

/**
 * How much an event counts for. One badge for every archive surface — an event
 * row, an event header, a deck tile — so a tier reads the same everywhere.
 */
export function MetaTierBadge({ tier, className }: { tier: MetaEventTier; className?: string }) {
  const style = TIER_STYLE[tier];
  return (
    <Badge variant={style.variant} className={cn("shrink-0", style.className, className)}>
      {META_EVENT_TIER_LABELS[tier]}
    </Badge>
  );
}
