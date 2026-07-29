import type { Printing } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ImageOffIcon } from "lucide-react";

/**
 * Centered notice for printings without an image of their own: a single
 * two-line pill linking to the image-contribution flow. The wording holds for
 * both stand-in states, substitute artwork from the standard printing and the
 * drawn placeholder. Rendered in the un-dimmed layer next to the image (not
 * inside it), so it stays full-opacity when the card itself is dimmed for
 * unowned copies. Self-gates on the printing having no image.
 *
 * @returns The centered notice overlay, or null when the printing has images.
 */
export function SuggestImageNotice({ printing }: { printing: Printing }) {
  if (printing.images.length > 0) {
    return null;
  }
  return (
    <div className="@container pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <Link
        to="/contribute/$cardSlug/image/$printingId"
        params={{ cardSlug: printing.card.slug, printingId: printing.id }}
        title="This printing has no image yet. Card art may be shown from its standard printing."
        className="bg-background/90 hover:bg-primary group/notice pointer-events-auto flex flex-col items-center rounded-[2cqi] px-[5cqi] py-[2cqi] text-center shadow-md transition-colors"
      >
        <span className="text-foreground/90 group-hover/notice:text-primary-foreground flex items-center gap-[1.5cqi] text-[6cqi] font-medium">
          <ImageOffIcon aria-hidden="true" className="size-[6cqi]" />
          Placeholder
        </span>
        <span className="text-primary group-hover/notice:text-primary-foreground text-[5.5cqi] font-medium">
          (suggest image)
        </span>
      </Link>
    </div>
  );
}
