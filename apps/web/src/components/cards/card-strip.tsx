import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Both side baskets are `flex-1` with a zero flex-basis, so they resolve to
 * equal widths and the center group stays centered with no spacer elements.
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
    // h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants; update both together
    <div className="relative z-30 mb-1 flex h-5 items-center">
      <div className="flex flex-1 items-center justify-start gap-0.5">{left}</div>
      <div className="flex items-center gap-1">{center}</div>
      <div className="flex flex-1 items-center justify-end gap-0.5">{right}</div>
    </div>
  );
}

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
      // --btn-cut:0 flattens the corner-cut so it doesn't fight rounded-md at h-5.
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
