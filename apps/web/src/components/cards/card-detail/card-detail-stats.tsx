import type { Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { useEnumOrders } from "@/hooks/use-enums";
import { getFilterIconPath } from "@/lib/icons";

import { StatChip } from "./stat-chip";

/**
 * The chip row under the artwork: energy, power, might, domains, rarity,
 * finish and card size. Prev/next navigation is the caller's business — the
 * pane puts it beside this row on phones, the modal puts it under the art.
 * @returns The stats chip row.
 */
export function CardDetailStats({ printing }: { printing: Printing }) {
  const { card } = printing;
  const { labels } = useEnumOrders();
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);

  return (
    <div className="flex min-h-8 flex-1 flex-wrap items-center justify-center gap-1.5">
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
              alt={d}
              title={d}
              width={64}
              height={64}
              className="size-5"
            />
          ) : null;
        })}
      {rarityIcon && (
        <img
          src={rarityIcon}
          alt={printing.rarity}
          title={printing.rarity}
          width={28}
          height={28}
          className="size-5"
        />
      )}
      {hasFinishIcon(printing.finish) && (
        <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
          <FinishIcon finish={printing.finish} />
          {labels.finishes[printing.finish]}
        </span>
      )}
      {printing.size !== WellKnown.cardSize.STANDARD && (
        <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
          {labels.cardSizes[printing.size]}
        </span>
      )}
    </div>
  );
}
