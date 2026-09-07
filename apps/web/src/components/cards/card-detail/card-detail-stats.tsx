import { enumLabel } from "@openrift/shared/enum-label";
import type { Printing } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";

import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { useEnumOrders } from "@/hooks/use-enums";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { StatChip } from "./stat-chip";

/**
 * The chip row under the artwork: energy, power, might, domains, finish and
 * card size. Rarity sits in the text box's medallion instead.
 */
export function CardDetailStats({
  printing,
  align = "center",
}: {
  printing: Printing;
  align?: "center" | "start";
}) {
  const { card } = printing;
  const { labels } = useEnumOrders();

  return (
    <div
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-1.5",
        align === "center" ? "flex-1 justify-center" : "justify-start",
      )}
    >
      {card.energy !== null && card.energy > 0 && <StatChip label="Energy" value={card.energy} />}
      {card.power !== null && card.power > 0 && (
        <StatChip label="Power" value={card.power} icon="/images/power.svg" />
      )}
      {card.might !== null && (
        <StatChip label="Might" value={card.might} icon="/images/might.svg" />
      )}
      {!card.domains.includes(WellKnown.domain.COLORLESS) &&
        card.domains.map((d) => {
          const domainIcon = getFilterIconPath("domains", d);
          return domainIcon ? (
            <img
              key={d}
              src={domainIcon}
              alt={enumLabel(labels.domains, d)}
              title={enumLabel(labels.domains, d)}
              width={64}
              height={64}
              className="size-5"
            />
          ) : null;
        })}
      {hasFinishIcon(printing.finish) && (
        <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
          <FinishIcon finish={printing.finish} />
          {enumLabel(labels.finishes, printing.finish)}
        </span>
      )}
      {printing.size !== WellKnown.cardSize.STANDARD && (
        <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
          {enumLabel(labels.cardSizes, printing.size)}
        </span>
      )}
    </div>
  );
}
