import { getOrientation } from "@openrift/shared";
import type { Card, ImageVariant, Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CARD_ASPECT_INVERSE } from "@/lib/card-grid-constants";
import { frontImageId } from "@/lib/card-meta";
import { cn } from "@/lib/utils";

const CARD_DRAG_GHOST_WIDTH = 112;

const FAN_OFFSETS = [
  { x: 0, y: 0, rotate: 0 },
  { x: 0.107, y: -0.036, rotate: 6 },
  { x: 0.214, y: -0.018, rotate: 12 },
] as const;

const SINGLE_CARD_TILT = "rotate-3";

function variantFor(width: number): ImageVariant {
  if (width * 2 <= 120) {
    return "120w";
  }
  return width * 2 <= 240 ? "240w" : "400w";
}

const MAX_FAN = 3;

interface CardDragGhostProps {
  printings: readonly Printing[];
  card?: Card;
  label?: ReactNode;
  count?: number;
  width?: number;
  className?: string;
}

export function CardDragGhost({
  printings,
  card,
  label,
  count,
  width = CARD_DRAG_GHOST_WIDTH,
  className,
}: CardDragGhostProps) {
  const fan = printings.slice(0, MAX_FAN);
  // Matches CardArtThumb's own corner rounding (5% of its width).
  const cornerRadius = width * 0.05;
  const height = width * CARD_ASPECT_INVERSE;

  const frames = fan.length > 0 ? fan : [undefined];

  return (
    <div
      className={cn("relative", fan.length <= 1 && SINGLE_CARD_TILT, className)}
      style={{ width, height }}
    >
      {frames.toReversed().map((printing, reversedIndex) => {
        const index = frames.length - 1 - reversedIndex;
        const offset = FAN_OFFSETS[index] ?? FAN_OFFSETS[0];
        const frameCard = printing?.card ?? card;
        return (
          // Placement lives on this wrapper: CardArtThumb sets its own `style`
          // for corner radius and takes no override.
          <span
            key={printing?.id ?? "placeholder"}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translate(${offset.x * width}px, ${offset.y * width}px) rotate(${offset.rotate}deg)`,
              zIndex: index,
            }}
          >
            <CardArtThumb
              imageId={frontImageId(printing)}
              variant={variantFor(width)}
              alt=""
              rarity={printing?.rarity}
              domains={frameCard?.domains}
              landscape={frameCard ? getOrientation(frameCard.types) === "landscape" : false}
              className="w-full shadow-lg"
            />
          </span>
        );
      })}
      {label !== undefined && (
        <div
          className="bg-background/80 absolute bottom-0 left-0 w-full px-1.5 py-1 backdrop-blur-sm"
          style={{
            zIndex: frames.length,
            borderBottomLeftRadius: cornerRadius,
            borderBottomRightRadius: cornerRadius,
          }}
        >
          <p className="truncate text-center text-xs font-medium">{label}</p>
        </div>
      )}
      {count !== undefined && count > 1 && (
        <div
          className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold shadow"
          style={{ zIndex: frames.length + 1 }}
        >
          {count}
        </div>
      )}
    </div>
  );
}
