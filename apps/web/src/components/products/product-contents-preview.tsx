import type { Printing } from "@openrift/shared";
import { getOrientation, imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { CARD_BORDER_RADIUS, LABEL_HEIGHT } from "@/components/cards/card-grid-constants";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

// Mirrors the live grid's column breakpoints, which query `@container/grid` on
// the center column in <CardBrowserLayout>. Viewport breakpoints would
// over-count columns whenever the filter sidebar is open.
const GRID_COLS =
  "grid grid-cols-2 gap-4 @min-[640px]/grid:grid-cols-3 @min-[768px]/grid:grid-cols-4 @min-[1024px]/grid:grid-cols-5 @min-[1280px]/grid:grid-cols-6 @min-[1600px]/grid:grid-cols-7 @min-[1920px]/grid:grid-cols-8";

const SIZES =
  "(min-width: 1920px) calc((100vw - 112px) / 8 - 12px), (min-width: 1600px) calc((100vw - 96px) / 7 - 12px), (min-width: 1280px) calc((100vw - 80px) / 6 - 12px), (min-width: 1024px) calc((100vw - 64px) / 5 - 12px), (min-width: 768px) calc((100vw - 48px) / 4 - 12px), (min-width: 640px) calc((100vw - 32px) / 3 - 12px), calc((100vw - 16px) / 2 - 12px)";

/** @returns One cell's art, landscape-rotated for battlefields like the live thumbnail. */
function PreviewArt({ printing }: { printing: Printing }) {
  const frontImage = printing.images[0] ?? null;
  const rotated = needsCssRotation(getOrientation(printing.card.types));
  if (!frontImage) {
    return <div className="bg-muted/40 aspect-card w-full rounded-lg" />;
  }
  const src = imageUrl(frontImage.imageId, "400w");
  const srcSet = `${imageUrl(frontImage.imageId, "120w")} 120w, ${imageUrl(frontImage.imageId, "240w")} 240w, ${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`;
  if (!rotated) {
    return (
      <img
        src={src}
        srcSet={srcSet}
        sizes={SIZES}
        width={400}
        height={558}
        alt={printing.card.name}
        className="aspect-card w-full rounded-lg object-cover"
      />
    );
  }
  // The in-flow aspect-card spacer gives the overflow-hidden box a definite
  // height so the rotated overlay's top: 50% resolves (see card-thumbnail.tsx).
  return (
    <div className="relative w-full overflow-hidden rounded-lg">
      <div className="aspect-card" />
      <div className="absolute top-1/2 left-1/2 overflow-hidden" style={LANDSCAPE_ROTATION_STYLE}>
        <img
          src={src}
          srcSet={srcSet}
          sizes={SIZES}
          width={880}
          height={630}
          alt={printing.card.name}
          className="size-full object-cover"
        />
      </div>
    </div>
  );
}

interface ProductContentsPreviewProps {
  /** The product's printings, deduplicated by card, in canonical order. */
  printings: readonly Printing[];
  quantityByPrintingId: Record<string, number>;
}

/**
 * Server-rendered view of a product's contents.
 *
 * The live grid (`<CardViewer>` → `<CardGrid>`) is window-virtualized, so it
 * emits no cards until the client has measured the viewport. This renders the
 * same card set as plain markup instead: real `<img>` tags as LCP candidates
 * and a real link per card, so the served HTML carries the product's actual
 * contents. Products are fixed-size (tens of cards, not the full catalogue),
 * so rendering every card here is affordable in a way it isn't on /cards —
 * which is why that page's `<FirstRowPreview>` stops after two rows.
 *
 * The cell shape mirrors `CardThumbnail` (p-1.5 wrapper, card image, then a
 * label block of `LABEL_HEIGHT`) so the live grid lands in the same place on
 * hydration instead of shifting the page.
 *
 * @returns The pre-hydration contents grid.
 */
export function ProductContentsPreview({
  printings,
  quantityByPrintingId,
}: ProductContentsPreviewProps) {
  return (
    <CardBrowserLayout
      gridSlot={
        <ul className={cn(GRID_COLS, "pt-4")}>
          {printings.map((printing) => (
            <li key={printing.id} className="rounded-lg p-1.5">
              <Link
                to="/cards/$cardSlug"
                params={{ cardSlug: printing.card.slug }}
                className="block"
              >
                <PreviewArt printing={printing} />
                <div
                  className="mt-2.5 space-y-0.5 text-xs"
                  style={{ height: LABEL_HEIGHT, borderRadius: CARD_BORDER_RADIUS }}
                >
                  <div className="truncate font-medium">{printing.card.name}</div>
                  <div className="text-muted-foreground truncate">
                    {printing.publicCode}
                    {quantityByPrintingId[printing.id] === undefined
                      ? null
                      : ` · ×${quantityByPrintingId[printing.id]}`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      }
    />
  );
}
