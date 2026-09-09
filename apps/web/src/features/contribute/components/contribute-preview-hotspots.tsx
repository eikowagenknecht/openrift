import type { ReactElement } from "react";

import { Pressable } from "@/components/ui/pressable";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { CARD_PLACEHOLDER_REGIONS } from "@/features/cards/lib/card-placeholder-regions";
import { cn } from "@/lib/utils";

export function ContributePreviewHotspots({
  activeField,
  filled,
  onSelect,
  onHover,
}: {
  activeField: PlaceholderField | null;
  filled: ReadonlySet<PlaceholderField>;
  onSelect: (field: PlaceholderField) => void;
  onHover: (field: PlaceholderField | null) => void;
}): ReactElement {
  return (
    <div className="@container pointer-events-none absolute inset-0">
      {CARD_PLACEHOLDER_REGIONS.map((region) => {
        const isFilled = filled.has(region.field);
        const isActive = activeField === region.field;
        return (
          <Pressable
            key={region.field}
            aria-label={`${isFilled ? "Jump to" : "Add"} ${region.label}`}
            data-active={isActive ? "true" : undefined}
            data-filled={isFilled ? "true" : undefined}
            data-field={region.field}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(region.field)}
            onFocus={() => onHover(region.field)}
            onPointerEnter={() => onHover(region.field)}
            onPointerLeave={() => onHover(null)}
            style={{
              left: `${region.x}cqw`,
              top: `${region.y}cqw`,
              width: `${region.width}cqw`,
              height: `${region.height}cqw`,
            }}
            className={cn(
              "pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-[1cqw] text-center transition-colors ring-inset",
              "focus-visible:ring-ring focus-visible:ring-2",
              isFilled
                ? "hover:ring-2 hover:ring-white/70"
                : "border border-dashed border-white/60 bg-black/40 hover:border-white/80 hover:bg-black/60",
              isActive && "ring-primary bg-primary/25 ring-2",
            )}
          >
            {!isFilled && (
              <span className="truncate px-[1cqw] text-[3.5cqw] leading-none text-white/80">
                {region.label}
              </span>
            )}
          </Pressable>
        );
      })}
    </div>
  );
}
