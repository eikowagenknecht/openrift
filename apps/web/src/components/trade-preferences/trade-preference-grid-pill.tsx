import type {
  Currency,
  EffectiveTradePreference,
  TradePreference,
  TradePricePref,
  TradeType,
} from "@openrift/shared";

import { COUNT_PILL_BASE, COUNT_PILL_INTERACTIVE } from "@/components/cards/count-pill";
import { cn } from "@/lib/utils";

import { iconForTradeType } from "./trade-preference-icon";
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

/**
 * Strip-friendly variant of the trade-preference pill used inside the
 * per-cell CardCountStrip in grid view. Matches the count-pill style
 * (h-5, rounded-md, bg-muted) so it sits naturally beside the quantity
 * pill, and falls back to a tag-icon-only badge when there's no price
 * reference to display.
 * @returns The pill button.
 */
export function TradePreferenceGridPill({
  override,
  listDefault,
  currency,
  isOverridden,
  onEdit,
}: TradePreferenceGridPillProps) {
  const effective: EffectiveTradePreference = {
    pricePref: (override.pricePref ?? listDefault.pricePref) as TradePricePref | null,
    priceAbsoluteCents: override.priceAbsoluteCents ?? listDefault.priceAbsoluteCents,
    tradeType: (override.tradeType ?? listDefault.tradeType) as TradeType | null,
    currency,
  };
  const body = renderBody(effective);
  const tooltip = renderTooltip(effective);
  const Icon = iconForTradeType(effective.tradeType);

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={tooltip ?? "Set trade preference"}
      title={tooltip ?? "Set trade preference"}
      onClick={(event) => {
        event.stopPropagation();
        onEdit();
      }}
      className={cn(
        COUNT_PILL_BASE,
        COUNT_PILL_INTERACTIVE,
        // Tint when the entry has its own override; otherwise keep the muted
        // look so the inherited state doesn't shout.
        isOverridden && "text-primary",
      )}
    >
      <Icon className="size-3" />
      {body ? <span>{body}</span> : null}
    </button>
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
