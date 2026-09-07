import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CountPill } from "@/components/ui/count-pill";
import { cn } from "@/lib/utils";

/** `src` wins over `imageId` when both are set. */
interface CardArtThumbStackItem {
  key: string;
  imageId?: string | null;
  src?: string;
  alt?: string;
}

export function CardArtThumbStack({
  items,
  max = 5,
  className,
  thumbClassName,
}: {
  items: CardArtThumbStackItem[];
  max?: number;
  className?: string;
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
