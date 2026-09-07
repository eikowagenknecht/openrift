import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";
import type { LucideIcon } from "lucide-react";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";

type LiveTradeTone = "soft" | "committed";

export type LiveTradeDirection = "incoming" | "outgoing";

export interface LiveTradeStatusDescriptor {
  label: string;
  direction: LiveTradeDirection;
  icon: LucideIcon;
  tone: LiveTradeTone;
}

export type LiveTradeStatusInput = Pick<CardTradeLiveAnnotation, "role" | "phase">;

const PHASE_LABELS: Record<CardTradeLivePhase, string> = {
  asked: "Requested",
  offered: "Offered",
  reserved: "Reserved",
};

// Mirrors TradeDirectionIcon in components/friend-groups/trade-row-parts.tsx;
// keep the arrows in sync.
const ROLE_ICONS: Record<CardTradeRole, LucideIcon> = {
  giver: ArrowUpRightIcon,
  receiver: ArrowDownLeftIcon,
};

export function liveTradeStatus(annotation: LiveTradeStatusInput): LiveTradeStatusDescriptor {
  return {
    label: PHASE_LABELS[annotation.phase],
    direction: annotation.role === "giver" ? "outgoing" : "incoming",
    icon: ROLE_ICONS[annotation.role],
    tone: annotation.phase === "asked" ? "soft" : "committed",
  };
}

export const SHARED_RESERVED_STATUS: LiveTradeStatusInput = { role: "giver", phase: "reserved" };

// direction is spelled out here because the arrow carrying it is
// aria-hidden; otherwise a screen reader can't tell arriving from departing.
export function tradeStatusTitle({
  label,
  direction,
  count,
  totalCount,
}: {
  label: string;
  direction?: LiveTradeDirection;
  count?: number;
  totalCount?: number;
}): string {
  const status = direction ? `${label} (${direction})` : label;
  if (count === undefined) {
    return status;
  }
  if (totalCount !== undefined && totalCount !== count) {
    return `${status} · ${count} of this printing (${totalCount} across all printings)`;
  }
  return `${status} · ${count} ${count === 1 ? "copy" : "copies"}`;
}
