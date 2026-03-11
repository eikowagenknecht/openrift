import type { Printing } from "@openrift/shared";

import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function CardDetailHeading({
  printing,
  setNumber,
  onTagClick,
  truncate,
}: {
  printing: Printing;
  setNumber: string;
  onTagClick?: (tag: string) => void;
  truncate?: boolean;
}) {
  const { card } = printing;
  return (
    <div className={cn(truncate && "min-w-0")}>
      <h2 className={cn("text-lg font-semibold", truncate && "truncate")}>
        {card.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{setNumber}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-1.5 text-sm uppercase text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <img
            src={getTypeIconPath(card.type, card.superTypes)}
            alt=""
            className="size-4 brightness-0 dark:invert"
          />
          {card.superTypes.length > 0 ? `${card.superTypes.join(" ")} ${card.type}` : card.type}
        </span>
        {card.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="relative inline-flex cursor-pointer items-center px-0.5 py-0.5"
            onClick={() => onTagClick?.(tag)}
          >
            <span className="absolute inset-0 -skew-x-[15deg] bg-black dark:bg-white" />
            <span className="relative text-xs font-semibold uppercase italic tracking-wide scale-x-75 text-white dark:text-black">
              {tag}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
