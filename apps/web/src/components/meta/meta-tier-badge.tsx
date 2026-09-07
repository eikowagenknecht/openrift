import type { MetaEventTier } from "@openrift/shared/types/enums";

import { Badge } from "@/components/ui/badge";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";
import { cn } from "@/lib/utils";

// `competitive` pins `text-primary`/`border-primary`: the dark palette's default
// outline color is amber, which would collide with `premier`'s gold.
const TIER_STYLE: Record<MetaEventTier, { variant: "outline" | "muted"; className: string }> = {
  premier: { variant: "outline", className: "border-border-accent text-border-accent" },
  competitive: {
    variant: "outline",
    className: "border-primary text-primary",
  },
  local: { variant: "muted", className: "" },
};

export function MetaTierBadge({ tier, className }: { tier: MetaEventTier; className?: string }) {
  const style = TIER_STYLE[tier];
  return (
    <Badge variant={style.variant} className={cn("shrink-0", style.className, className)}>
      {META_EVENT_TIER_LABELS[tier]}
    </Badge>
  );
}
