import { imageUrl } from "@openrift/shared/image-url";
import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation } from "@openrift/shared/utils";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const GAP_PX = 12;

/**
 * Rendered via portal to body so it can float above the host popup without
 * being clipped.
 */
export function PrintingHoverPreview({
  printing,
  anchorRef,
}: {
  printing: Printing;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const front = printing.images.find((image) => image.face === "front");
  return (
    <ImageHoverPreview
      thumbnailUrl={front ? imageUrl(front.imageId, "400w") : null}
      fullUrl={front ? imageUrl(front.imageId, "full") : null}
      landscape={getOrientation(printing.card.types) === "landscape"}
      anchorRef={anchorRef}
    />
  );
}

export function ImageHoverPreview({
  thumbnailUrl: thumbnail,
  fullUrl,
  landscape,
  anchorRef,
}: {
  thumbnailUrl: string | null;
  fullUrl: string | null;
  landscape: boolean;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const [fullLoaded, setFullLoaded] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const [loadedUrl, setLoadedUrl] = useState(fullUrl);
  if (fullUrl !== loadedUrl) {
    setLoadedUrl(fullUrl);
    setFullLoaded(false);
  }

  useEffect(() => {
    const previewWidth = landscape ? 560 : 400;
    const previewHeight = landscape ? 400 : 560;

    const applyPosition = () => {
      const preview = previewRef.current;
      const anchor = anchorRef.current;
      if (!preview || !anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const spaceRight = viewportWidth - rect.right;
      const spaceLeft = rect.left;
      const placeRight = spaceRight >= previewWidth + GAP_PX || spaceRight >= spaceLeft;
      const rawLeft = placeRight ? rect.right + GAP_PX : rect.left - GAP_PX - previewWidth;
      const left = Math.max(GAP_PX, Math.min(rawLeft, viewportWidth - previewWidth - GAP_PX));
      const top = Math.min(
        Math.max(GAP_PX, rect.top + rect.height / 2 - previewHeight / 2),
        Math.max(GAP_PX, viewportHeight - previewHeight - GAP_PX),
      );
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    };

    applyPosition();
    globalThis.addEventListener("scroll", applyPosition, true);
    globalThis.addEventListener("resize", applyPosition);
    return () => {
      globalThis.removeEventListener("scroll", applyPosition, true);
      globalThis.removeEventListener("resize", applyPosition);
    };
  }, [anchorRef, landscape]);

  if (!thumbnail || thumbnail === failedUrl) {
    return null;
  }

  return createPortal(
    <div
      ref={previewRef}
      className={cn("pointer-events-none fixed z-[100]", landscape ? "w-[560px]" : "w-[400px]")}
    >
      <div className="relative">
        <img
          src={thumbnail}
          alt=""
          className="w-full rounded-lg shadow-lg"
          onError={() => setFailedUrl(thumbnail)}
        />
        {fullUrl && (
          <img
            src={fullUrl}
            alt=""
            onLoad={() => setFullLoaded(true)}
            className={cn(
              "absolute inset-0 w-full rounded-lg shadow-lg transition-opacity duration-150",
              fullLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
