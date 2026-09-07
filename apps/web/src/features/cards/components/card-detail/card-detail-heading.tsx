import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";

import { Heading } from "@/components/heading";
import { getTypeIconPaths } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function CardDetailHeading({
  printing,
  setNumber,
  onTagClick,
  truncate,
  titleClassName,
}: {
  printing: Printing;
  setNumber: string;
  onTagClick?: (tag: string) => void;
  truncate?: boolean;
  titleClassName?: string;
}) {
  const { card } = printing;
  const displayName = legendDisplayName(card);
  const typeIconPaths = getTypeIconPaths(card.types, card.superTypes);
  const typeText = card.types.join(" ");
  return (
    <div className={cn(truncate && "min-w-0")}>
      <Heading level={2} className={cn(truncate && "truncate", titleClassName)}>
        {printing.printedName && printing.printedName !== card.name ? (
          <>
            {printing.printedName}
            <span className="text-muted-foreground ml-1.5 text-sm font-normal">
              ({displayName})
            </span>
          </>
        ) : (
          displayName
        )}
        <span className="text-muted-foreground ml-2 text-sm font-normal">{setNumber}</span>
      </Heading>
      <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm uppercase">
        <span className="inline-flex items-center gap-1">
          {typeIconPaths.map((path) => (
            <img key={path} src={path} alt="" className="size-4 brightness-0 dark:invert" />
          ))}
          {card.superTypes.length > 0 ? `${card.superTypes.join(" ")} ${typeText}` : typeText}
        </span>
        {card.tags.map((tag) => (
          // oxlint-disable-next-line react/forbid-elements -- bespoke skewed tag chip; transform-styled, no primitive fits
          <button
            key={tag}
            type="button"
            className="relative inline-flex cursor-pointer items-center px-0.5 py-0.5"
            onClick={() => onTagClick?.(tag)}
          >
            <span className="absolute inset-0 -skew-x-[15deg] bg-black dark:bg-white" />
            <span className="relative scale-x-75 text-xs font-semibold tracking-wide text-white uppercase italic dark:text-black">
              {tag}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
