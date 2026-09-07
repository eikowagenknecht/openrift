import type { TradeType } from "@openrift/shared";
import { ArrowLeftRightIcon, CoinsIcon, TagIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// A record, not a lookup function: the React Compiler can't prove a function
// returns a stable component and would treat the result as created per render.
export const TRADE_TYPE_ICON: Record<TradeType | "none", IconComponent> = {
  cards: ArrowLeftRightIcon,
  money: CoinsIcon,
  both: TagIcon,
  none: TagIcon,
};
