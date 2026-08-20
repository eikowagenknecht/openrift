import type { Marker, PrintingCitation } from "@openrift/shared";
import { InfoIcon, LinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BrandGlyph } from "@/components/ui/brand-glyph";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sourceBrand } from "@/lib/source-brand";
import { cn } from "@/lib/utils";

/**
 * DB slug of the "Promo" marker (`markers.slug`), the one marker this cell
 * drops. Also special-cased in card-thumbnail.tsx, for placeholder art.
 */
const PROMO_MARKER_SLUG = "promo";

/**
 * One citation as a single glyph: the source's brand mark, linked when there is
 * somewhere to go, with the label in a tooltip. The full-text list lives on the
 * card detail's citation list — a table row only has room for the mark, which
 * is the part a reader recognises at a glance anyway.
 *
 * @returns The citation glyph.
 */
function CitationGlyph({ citation }: { citation: PrintingCitation }) {
  const glyph = <BrandGlyph icon={sourceBrand(citation.sourceUrl)} fallback={LinkIcon} />;

  if (citation.sourceUrl === null) {
    return (
      <Tooltip>
        <TooltipTrigger className="cursor-default" aria-label={citation.label}>
          {glyph}
        </TooltipTrigger>
        <TooltipContent>{citation.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={citation.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={citation.label}
            className="hover:text-foreground"
            // The row behind this opens the card detail. A click or Enter on a
            // citation is aimed at the source, so it must not do both.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.stopPropagation();
              }
            }}
          />
        }
      >
        {glyph}
      </TooltipTrigger>
      <TooltipContent>{citation.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Everything the catalog knows about a promo printing beyond the card itself,
 * in one cell: the editor's note, the markers that qualify it, and the sources
 * backing the claim. They share a column because each is sparse on its own — a
 * column apiece left the table mostly empty and pushed the parts of one
 * printing's story away from each other.
 *
 * The note reads out in full (truncated) once the column is wide enough for it;
 * a narrower table shrinks it back to its icon and leaves the text to the
 * tooltip, which is all the 112px floor fits.
 *
 * @returns The cell's content, or null when the printing has none of the three.
 */
export function PrintingNotesCell({
  comment,
  markers,
  citations,
  className,
}: {
  comment: string | null;
  /**
   * The printing's markers. The generic "Promo" one is dropped here — it sits on
   * nearly every promo printing, so on a page of promos it is a chip that says
   * nothing.
   */
  markers: readonly Marker[];
  /** Read as `printing.citations ?? []` — the wire schema omits an empty list. */
  citations: readonly PrintingCitation[];
  className?: string;
}) {
  const shownMarkers = markers.filter((marker) => marker.slug !== PROMO_MARKER_SLUG);
  if (!comment && shownMarkers.length === 0 && citations.length === 0) {
    return null;
  }
  return (
    // @container, not a viewport breakpoint: the column takes whatever the fixed
    // columns leave over, so how much room the note has turns on the detail pane
    // and the table's own sideways scroll as much as on the screen.
    <div className={cn("text-muted-foreground @container flex items-center gap-1.5", className)}>
      {comment && (
        <Tooltip>
          <TooltipTrigger
            className="flex min-w-0 cursor-default items-center gap-1.5"
            aria-label="Printing note"
          >
            <InfoIcon className="size-4 shrink-0" />
            <span className="hidden truncate @[10rem]:inline">{comment}</span>
          </TooltipTrigger>
          <TooltipContent>{comment}</TooltipContent>
        </Tooltip>
      )}
      {shownMarkers.length > 0 && (
        <span className="flex min-w-0 shrink items-center gap-1">
          {shownMarkers.map((marker) => (
            <Badge
              key={marker.id}
              variant="secondary"
              title={marker.description ?? marker.label}
              className="min-w-0 shrink"
            >
              <span className="truncate">{marker.label}</span>
            </Badge>
          ))}
        </span>
      )}
      {citations.length > 0 && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {citations.map((citation) => (
            <CitationGlyph key={citation.id} citation={citation} />
          ))}
        </span>
      )}
    </div>
  );
}
