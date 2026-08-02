import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";

import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * The quick-add palette's card image preview. The palette renders it twice —
 * above the drawer on mobile, floating off the left edge of the dialog on
 * desktop — differing only in the wrapper's size and position, which the caller
 * supplies. Landscape cards (battlefields) are rotated in CSS, which needs the
 * extra clipping wrapper.
 * @returns The framed preview image.
 */
export function QuickAddPreview({
  printing,
  src,
  className,
  onError,
}: {
  printing: Printing;
  src: string;
  className?: string;
  onError: () => void;
}) {
  const rotated = needsCssRotation(getOrientation(printing.card.types));
  const alt = legendDisplayName(printing.card);
  return (
    <div
      className={cn("bg-muted aspect-card relative overflow-hidden", className)}
      style={{ borderRadius: "5% / 3.6%" }}
    >
      {rotated ? (
        <div className="absolute top-1/2 left-1/2 overflow-hidden" style={LANDSCAPE_ROTATION_STYLE}>
          <img src={src} alt={alt} className="size-full object-cover" onError={onError} />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full object-cover"
          onError={onError}
        />
      )}
    </div>
  );
}
