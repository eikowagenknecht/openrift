import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";

import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

/** Landscape cards (battlefields) are rotated in CSS, which needs the extra clipping wrapper. */
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
