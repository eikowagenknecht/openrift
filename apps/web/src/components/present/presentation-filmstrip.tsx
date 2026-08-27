import { getOrientation, legendDisplayName } from "@openrift/shared";
import { useEffect, useRef } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Pressable } from "@/components/ui/pressable";
import { frontImageId } from "@/lib/card-meta";
import type { PresentationItem } from "@/lib/presentation-queue";
import { cn } from "@/lib/utils";

/**
 * The queue as a row of thumbnails under the stage, with the current card
 * lifted. Clicking one jumps to it, which is how a creator backtracks without
 * counting arrow presses on air.
 *
 * @returns The filmstrip row.
 */
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

  // Keep the current card in view as the queue is walked. A long queue
  // otherwise scrolls off and the strip stops telling you where you are.
  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [index]);

  return (
    // `overflow-x-auto` computes `overflow-y` to `auto` as well, so the row
    // clips at its content box. The current thumbnail is the tallest child and
    // carries an outset ring, so without the top padding its outline is shaved
    // off. `pt-2` covers the ring plus the lift.
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
                "shrink-0 rounded transition-all duration-200",
                isCurrent
                  ? "w-20 opacity-100 ring-2 ring-amber-400"
                  : "w-14 opacity-45 hover:opacity-80",
              )}
            >
              {/* Through the shared thumb rather than a bare `img`: it is the
                  one place the three ways art can be missing land in the same
                  domain-tinted placeholder, and the only one that turns
                  battlefield art the right way up. */}
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
