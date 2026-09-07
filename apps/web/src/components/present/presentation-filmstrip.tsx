import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { useEffect, useRef } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Pressable } from "@/components/ui/pressable";
import { frontImageId } from "@/lib/card-meta";
import type { PresentationItem } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";

export function PresentationFilmstrip({
  items,
  index,
  onSelect,
}: {
  items: PresentationItem[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [index]);

  return (
    // overflow-x-auto forces overflow-y: auto, clipping the lifted thumbnail's ring; pt-2 covers it.
    <div className="flex shrink-0 justify-center overflow-x-auto px-4 pt-2 pb-2">
      <div className="flex items-end gap-2">
        {items.map((item, itemIndex) => {
          const isCurrent = itemIndex === index;
          return (
            <Pressable
              key={item.id}
              ref={(node) => {
                itemRefs.current[itemIndex] = node;
              }}
              onClick={() => onSelect(itemIndex)}
              aria-label={`Show ${legendDisplayName(item.printing.card)}`}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-md transition-all duration-200",
                isCurrent
                  ? "ring-border-accent w-20 opacity-100 ring-2"
                  : "w-14 opacity-45 hover:opacity-80",
              )}
            >
              <CardArtThumb
                imageId={frontImageId(item.printing)}
                variant="400w"
                rarity={item.printing.rarity}
                domains={item.printing.card.domains}
                landscape={getOrientation(item.printing.card.types) === "landscape"}
                loading="lazy"
                className="w-full"
              />
            </Pressable>
          );
        })}
      </div>
    </div>
  );
}
