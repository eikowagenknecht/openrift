import type { Currency, EffectiveTradePreference, TradePreference } from "@openrift/shared";
import { resolveEffectiveTradePreference } from "@openrift/shared";

import { CountPillButton } from "@/components/ui/count-pill";
import { cn } from "@/lib/utils";

import { TRADE_TYPE_ICON } from "./trade-preference-icon";
import {
  PRICE_PREF_ABBR,
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_SHORT_LABEL,
  formatAbsolutePrice,
} from "./trade-preference-labels";

interface TradePreferenceGridPillProps {
  override: TradePreference;
  listDefault: TradePreference;
  currency: Currency | null;
  isOverridden: boolean;
  onEdit: () => void;
}

export function TradePreferenceGridPill({
  override,
  listDefault,
  currency,
  isOverridden,
  onEdit,
}: TradePreferenceGridPillProps) {
  const effective: EffectiveTradePreference = resolveEffectiveTradePreference(
    override,
    listDefault,
    currency,
  );
  const body = renderBody(effective);
  const tooltip = renderTooltip(effective);
  const Icon = TRADE_TYPE_ICON[effective.tradeType ?? "none"];

  return (
    <CountPillButton
      variant="ghost"
      tabIndex={-1}
      aria-label={tooltip ?? "Set trade preference"}
      title={tooltip ?? "Set trade preference"}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      className={cn(isOverridden && "text-primary")}
    >
      <Icon className="size-3" />
      {body ? <span>{body}</span> : null}
    </CountPillButton>
  );
}

function renderBody(effective: EffectiveTradePreference): string | null {
  if (effective.pricePref === "absolute") {
    return formatAbsolutePrice(effective.priceAbsoluteCents, effective.currency);
  }
  if (effective.pricePref !== null) {
    return PRICE_PREF_ABBR[effective.pricePref];
  }
  return null;
}

function renderTooltip(effective: EffectiveTradePreference): string | null {
  const parts: string[] = [];
  if (effective.pricePref === "absolute") {
    const formatted = formatAbsolutePrice(effective.priceAbsoluteCents, effective.currency);
    if (formatted) {
      parts.push(formatted);
    }
  } else if (effective.pricePref !== null) {
    parts.push(PRICE_PREF_SHORT_LABEL[effective.pricePref]);
  }
  if (effective.tradeType !== null) {
    parts.push(TRADE_TYPE_SHORT_LABEL[effective.tradeType]);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
