import type { Printing } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

export function SuggestImageOverlay({ printing }: { printing: Printing }) {
  if (printing.images.length > 0) {
    return null;
  }
  return (
    <div className="@container pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-[0.5cqi]">
      <Link
        to="/contribute/$cardSlug/image/$printingId"
        params={{ cardSlug: printing.card.slug, printingId: printing.id }}
        className="bg-background/90 text-primary hover:bg-primary hover:text-primary-foreground pointer-events-auto rounded-[2cqi] px-[5cqi] py-[2cqi] text-[6cqi] font-medium shadow-md transition-colors"
      >
        Suggest image
      </Link>
    </div>
  );
}
