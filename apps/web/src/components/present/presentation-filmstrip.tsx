import { imageUrl, legendDisplayName } from "@openrift/shared";
import { useEffect, useRef } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { Pressable } from "@/components/ui/pressable";
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
  items: CardViewerItem[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the current card in view as the queue is walked. A long queue
  // otherwise scrolls off and the strip stops telling you where you are.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
          const image = item.printing.images[0];
          return (
            <Pressable
              key={item.id}
              ref={isCurrent ? activeRef : undefined}
              onClick={() => onSelect(itemIndex)}
              aria-label={`Show ${legendDisplayName(item.printing.card)}`}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                "aspect-card w-14 shrink-0 overflow-hidden rounded transition-all duration-200",
                isCurrent
                  ? "w-20 opacity-100 ring-2 ring-amber-400"
                  : "opacity-45 hover:opacity-80",
              )}
            >
              {image ? (
                <img
                  src={imageUrl(image.imageId, "400w")}
                  alt=""
                  width={400}
                  height={558}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-2xs flex size-full items-center justify-center bg-white/10 p-1 text-center leading-tight text-white/70">
                  {item.printing.card.name}
                </span>
              )}
            </Pressable>
          );
        })}
      </div>
    </div>
  );
}
