import type { TradeType } from "@openrift/shared";
import { ArrowLeftRightIcon, CoinsIcon, TagIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Icon per trade-type. "Cards" gets the swap-arrows glyph, "Money" gets the
 * coins glyph, and the rest ("Both" or no preference) falls back to the
 * generic tag icon so the pill still has a visual anchor. A record rather than
 * a lookup function so call sites index it: the React Compiler cannot prove a
 * function returns a stable component and treats the result as created during
 * render.
 */
export const TRADE_TYPE_ICON: Record<TradeType | "none", IconComponent> = {
  cards: ArrowLeftRightIcon,
  money: CoinsIcon,
  both: TagIcon,
  none: TagIcon,
};
