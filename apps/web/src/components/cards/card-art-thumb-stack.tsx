import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CountPill } from "@/components/ui/count-pill";
import { cn } from "@/lib/utils";

/** One card in the stack: `src` wins over `imageId` (mirrors CardArtThumb). */
interface CardArtThumbStackItem {
  key: string;
  imageId?: string | null;
  src?: string;
  alt?: string;
}

/**
 * An overlapping strip of card-art thumbs with a "+N" pill for the overflow —
 * the avatar-stack treatment applied to card art. Used where one row stands
 * for many cards (aggregated activity events, batch summaries). Thumbs get a
 * background-colored ring so the overlap reads as separate cards; size them
 * with `thumbClassName` (default `w-8`).
 *
 * @returns The thumb-stack element.
 */
export function CardArtThumbStack({
  items,
  max = 5,
  className,
  thumbClassName,
}: {
  items: CardArtThumbStackItem[];
  /** How many thumbs to show before collapsing the rest into the +N pill. */
  max?: number;
  className?: string;
  /** Sizing utilities per thumb, e.g. `"w-10"`. */
  thumbClassName?: string;
}) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <span className={cn("flex items-center", className)}>
      {shown.map((item, index) => (
        <CardArtThumb
          key={item.key}
          src={item.src}
          imageId={item.imageId}
          alt={item.alt ?? ""}
          loading="lazy"
          className={cn("ring-background ring-2", index > 0 && "-ml-2.5", thumbClassName ?? "w-8")}
        />
      ))}
      {extra > 0 ? (
        <CountPill variant="muted" className="ml-2">
          +{extra}
        </CountPill>
      ) : null}
    </span>
  );
}
