import type { LucideIcon } from "lucide-react";

import type { BrandIconData } from "@/features/admin/lib/source-brand";
import { cn } from "@/lib/utils";

interface BrandGlyphProps {
  /** The brand mark, or undefined when the thing has no recognised brand. */
  icon?: BrandIconData;
  /** Drawn instead when `icon` is undefined. */
  fallback: LucideIcon;
  className?: string;
}

/**
 * A brand mark from `simple-icons`, falling back to a lucide icon when the
 * brand is unknown. `simple-icons` ships raw path data rather than components,
 * so every call site would otherwise repeat the same inline `<svg>` — and drift
 * on the viewBox or the `currentColor` fill that makes the mark inherit text
 * colour.
 *
 * Always `aria-hidden`: a brand mark sits next to the text that names it (a
 * contact value, a citation label), so announcing it twice adds nothing.
 *
 * @returns The brand's glyph, or the fallback icon.
 */
export function BrandGlyph({ icon, fallback: Fallback, className = "size-4" }: BrandGlyphProps) {
  if (icon) {
    return (
      <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} aria-hidden="true">
        <path d={icon.path} fill="currentColor" />
      </svg>
    );
  }
  return <Fallback className={cn("shrink-0", className)} aria-hidden="true" />;
}
