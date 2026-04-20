import type { CatalogPrintingResponse, PackPull } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { FoilOverlay } from "@/components/cards/foil-overlay";
import { cn } from "@/lib/utils";

const SLOT_BORDER: Record<PackPull["slot"], string> = {
  common: "ring-border",
  uncommon: "ring-border",
  rune: "ring-border",
  flex: "ring-border",
  foil: "ring-sky-500/60",
  showcase: "ring-amber-400/70",
  ultimate: "ring-fuchsia-500/80",
};

const SLOT_GLOW: Record<PackPull["slot"], string> = {
  common: "",
  uncommon: "",
  rune: "",
  flex: "",
  foil: "",
  showcase: "shadow-[0_0_28px_-6px_rgba(245,158,11,0.55)]",
  ultimate: "shadow-[0_0_36px_-4px_rgba(217,70,239,0.75)]",
};

interface PullCardProps {
  pull: PackPull;
  image: CatalogPrintingResponse["images"][number] | undefined;
  className?: string;
  /** When true, the foil overlay animates; otherwise it's static rainbow. */
  shimmer?: boolean;
}

// Face-up card in the reveal / bulk grid. Shows the printing image (or a
// named placeholder when the image isn't available) and links to the card
// detail page. Shine ring indicates a special-slot pull.
export function PullCard({ pull, image, className, shimmer = true }: PullCardProps) {
  const { printing } = pull;
  const highlight = SLOT_BORDER[pull.slot];
  const glow = SLOT_GLOW[pull.slot];
  // Pack opener always shows the holo effect on foil-finish pulls, regardless
  // of the user's global foil preference — the whole point of the simulator is
  // to make pulls feel exciting. Whether the overlay animates (shimmer) is a
  // per-page toggle.
  const showFoil = printing.finish === WellKnown.finish.FOIL;

  return (
    <Link
      to="/cards/$cardSlug"
      params={{ cardSlug: printing.cardSlug }}
      search={{ printingId: printing.id }}
      className={cn("group block", className)}
    >
      <div
        className={cn(
          "aspect-card relative overflow-hidden rounded-lg bg-neutral-800 ring-1",
          highlight,
          glow,
          "transition-transform group-hover:-translate-y-0.5",
        )}
      >
        {image ? (
          <img
            src={image.thumbnail}
            srcSet={`${image.thumbnail} 400w, ${image.full} 800w`}
            sizes="(max-width: 640px) 40vw, 160px"
            alt={printing.cardName}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="bg-muted absolute inset-0 flex items-center justify-center p-2 text-center text-xs">
            {printing.cardName}
          </div>
        )}
        {showFoil && <FoilOverlay active shimmer={shimmer} />}
      </div>
      <div className="mt-1 px-0.5 text-xs">
        <div className="text-foreground truncate">{printing.cardName}</div>
        <div className="text-muted-foreground flex items-center justify-between tabular-nums">
          <span>{printing.shortCode}</span>
          <span>{slotLabel(pull)}</span>
        </div>
      </div>
    </Link>
  );
}

function slotLabel(pull: PackPull): string {
  switch (pull.slot) {
    case "common": {
      return "Common";
    }
    case "uncommon": {
      return "Uncommon";
    }
    case "flex": {
      return pull.printing.rarity;
    }
    case "foil": {
      return `Foil ${pull.printing.rarity}`;
    }
    case "rune": {
      return "Rune";
    }
    case "showcase": {
      if (pull.printing.isSigned) {
        return "Signed";
      }
      if (pull.printing.artVariant === "overnumbered") {
        return "Overnumbered";
      }
      return "Alt Art";
    }
    case "ultimate": {
      return "Ultimate";
    }
  }
}
