import type { CatalogPrintingResponse, PackPull } from "@openrift/shared";
import { WellKnown, getOrientation, imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { FoilOverlay } from "@/components/cards/foil-overlay";
import { useEnumOrders } from "@/hooks/use-enums";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

const SLOT_BORDER: Record<PackPull["slot"], string> = {
  common: "ring-border",
  uncommon: "ring-border",
  token: "ring-border",
  flex: "ring-border",
  foil: "ring-sky-500/60",
  showcase: "ring-amber-400/70",
  ultimate: "ring-fuchsia-500/80",
};

const SLOT_GLOW: Record<PackPull["slot"], string> = {
  common: "",
  uncommon: "",
  token: "",
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
  const { labels } = useEnumOrders();
  const highlight = SLOT_BORDER[pull.slot];
  const glow = SLOT_GLOW[pull.slot];
  // Pack opener always shows the holo effect on foil-finish pulls, regardless
  // of the user's global foil preference — the whole point of the simulator is
  // to make pulls feel exciting. Whether the overlay animates (shimmer) is a
  // per-page toggle.
  const showFoil = printing.finish === WellKnown.finish.FOIL;
  const rotated = needsCssRotation(getOrientation(printing.cardType));

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
          rotated ? (
            <div
              className="absolute top-1/2 left-1/2 overflow-hidden"
              style={LANDSCAPE_ROTATION_STYLE}
            >
              <img
                src={imageUrl(image.imageId, "240w")}
                srcSet={`${imageUrl(image.imageId, "240w")} 240w, ${imageUrl(image.imageId, "400w")} 400w`}
                sizes="(max-width: 640px) 40vw, 160px"
                alt={printing.cardName}
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
          ) : (
            <img
              src={imageUrl(image.imageId, "240w")}
              srcSet={`${imageUrl(image.imageId, "240w")} 240w, ${imageUrl(image.imageId, "400w")} 400w`}
              sizes="(max-width: 640px) 40vw, 160px"
              alt={printing.cardName}
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          )
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
          <span>{slotLabel(pull, labels.rarities)}</span>
        </div>
      </div>
    </Link>
  );
}

function slotLabel(pull: PackPull, rarityLabels: Record<string, string>): string {
  const rarityLabel = rarityLabels[pull.printing.rarity] ?? pull.printing.rarity;
  switch (pull.slot) {
    case "common": {
      return "Common";
    }
    case "uncommon": {
      return "Uncommon";
    }
    case "flex": {
      return rarityLabel;
    }
    case "foil": {
      return `Foil ${rarityLabel}`;
    }
    case "token": {
      if (pull.printing.cardSuperTypes.includes(WellKnown.superType.TOKEN)) {
        return "Token";
      }
      if (pull.printing.finish === WellKnown.finish.FOIL) {
        return "Foil Rune";
      }
      if (pull.printing.artVariant !== WellKnown.artVariant.NORMAL) {
        return "Alt Art Rune";
      }
      return "Rune";
    }
    case "showcase": {
      if (pull.printing.isSigned) {
        return "Signed";
      }
      if (pull.printing.artVariant === WellKnown.artVariant.OVERNUMBERED) {
        return "Overnumbered";
      }
      return "Alt Art";
    }
    case "ultimate": {
      return "Ultimate";
    }
  }
}
