import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Layout shell for the fixed control row above card thumbnails. Owns the
 * geometry every strip shares — the 24px height contract, the z-index, and
 * the three-zone layout: `left` (remove/decrement actions), `center` (state
 * pills and badges), `right` (add/primary actions).
 *
 * Both side baskets are `flex-1` with a zero flex-basis, so they always
 * resolve to equal widths and the center group stays dead-centered no matter
 * which side holds content — no spacer elements needed.
 *
 * Content components (CardCountStrip, DeckAddStrip, CopyMetadataStrip, and
 * one-off strips at call sites) compose this shell with StripIconButton /
 * StripActionButton / CountPill; none of them restate the row geometry.
 *
 * @returns The strip row.
 */
export function CardStrip({
  left,
  center,
  right,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div className="relative z-30 mb-1 flex h-5 items-center">
      <div className="flex flex-1 items-center justify-start gap-0.5">{left}</div>
      <div className="flex items-center gap-1">{center}</div>
      <div className="flex flex-1 items-center justify-end gap-0.5">{right}</div>
    </div>
  );
}

/**
 * Ghost icon action for a CardStrip zone (the ± steppers, deck-check's
 * pencil/X). Stops click propagation so the tile's own click handler doesn't
 * fire, and stays out of the tab order like every strip control — keyboard
 * users reach these actions via the context menu or detail pane.
 *
 * @returns The icon button.
 */
export function StripIconButton({ className, onClick, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      tabIndex={-1}
      size="icon-xs"
      variant="ghost"
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    />
  );
}

/**
 * Labeled mini CTA for a CardStrip zone (Choose / Remove / bulk ±N). Pill
 * height (h-5) so it reads as a peer of CountPill; `variant` follows Button
 * ("default" filled, "destructive" for removals). Stops click propagation
 * and stays out of the tab order like the other strip controls.
 *
 * @returns The action button.
 */
export function StripActionButton({
  variant = "default",
  className,
  onClick,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      tabIndex={-1}
      variant={variant}
      // --btn-cut:0 flattens the solid-fill corner-cut signature to a full
      // rect: at h-5 inside the pill row the cut fights rounded-md and reads
      // as a glitch, so strip CTAs are pills like their CountPill neighbors.
      className={cn(
        "h-5 min-w-5 rounded-md px-1.5 py-0 text-xs font-semibold [--btn-cut:0px]",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    />
  );
}
