import type { TradeType } from "@openrift/shared";
import { ArrowLeftRightIcon, CoinsIcon, TagIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Icon for a trade-type. "Cards" gets the swap-arrows glyph, "Money" gets the
 * coins glyph, and the rest ("Both" or no preference) falls back to the
 * generic tag icon so the pill still has a visual anchor.
 * @returns The matching lucide-react icon component.
 */
export function iconForTradeType(tradeType: TradeType | null): IconComponent {
  if (tradeType === "money") {
    return CoinsIcon;
  }
  if (tradeType === "cards") {
    return ArrowLeftRightIcon;
  }
  return TagIcon;
}
