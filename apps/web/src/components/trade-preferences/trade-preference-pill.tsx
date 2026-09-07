import type { Currency, EffectiveTradePreference, TradePreference } from "@openrift/shared";
import { resolveEffectiveTradePreference } from "@openrift/shared";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TRADE_TYPE_ICON } from "./trade-preference-icon";
import {
  PRICE_PREF_ABBR,
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_SHORT_LABEL,
  formatAbsolutePrice,
} from "./trade-preference-labels";

interface ReadOnlyProps {
  effective: EffectiveTradePreference;
  readOnly: true;
}

interface EditableProps {
  override: TradePreference;
  listDefault: TradePreference;
  currency: Currency | null;
  isOverridden: boolean;
  onEdit: () => void;
  disabled?: boolean;
  readOnly?: false;
}

type Props = ReadOnlyProps | EditableProps;

export function TradePreferencePill(props: Props) {
  if (props.readOnly) {
    const labels = preferenceLabels(props.effective);
    if (labels.length === 0) {
      return null;
    }
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
        {labels.map((label, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 opacity-50">·</span>}
            {label}
          </span>
        ))}
      </span>
    );
  }

  const effective: EffectiveTradePreference = resolveEffectiveTradePreference(
    props.override,
    props.listDefault,
    props.currency,
  );
  const labels = preferenceLabels(effective);
  const hasAnyPref = labels.length > 0;
  const ariaLabel = hasAnyPref
    ? `Edit trade preference (${labels.join(" · ")})`
    : "Set trade preference";
  const pillBody = renderPillBody(effective);
  const Icon = TRADE_TYPE_ICON[effective.tradeType ?? "none"];

  const button = (
    // oxlint-disable-next-line react/forbid-elements -- bespoke three-state bordered pref pill (empty/inherited/overridden); no variant ladder fits
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={props.onEdit}
      className={cn(
        "hover:bg-muted inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors",
        !hasAnyPref && "text-muted-foreground size-6 border-dashed px-0",
        hasAnyPref && !props.isOverridden && "text-muted-foreground",
        hasAnyPref && props.isOverridden && "text-primary border-primary/40",
        props.disabled && "pointer-events-none opacity-50",
      )}
      disabled={props.disabled}
    >
      <Icon className="size-3" />
      {pillBody ? <span>{pillBody}</span> : null}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{hasAnyPref ? labels.join(" · ") : "Set trade preference"}</TooltipContent>
    </Tooltip>
  );
}

function renderPillBody(effective: EffectiveTradePreference): string | null {
  if (effective.pricePref === "absolute") {
    return formatAbsolutePrice(effective.priceAbsoluteCents, effective.currency);
  }
  if (effective.pricePref !== null) {
    return PRICE_PREF_ABBR[effective.pricePref];
  }
  return null;
}

function preferenceLabels(effective: EffectiveTradePreference): string[] {
  const labels: string[] = [];
  if (effective.pricePref === "absolute") {
    const formatted = formatAbsolutePrice(effective.priceAbsoluteCents, effective.currency);
    if (formatted) {
      labels.push(formatted);
    }
  } else if (effective.pricePref !== null) {
    labels.push(PRICE_PREF_SHORT_LABEL[effective.pricePref]);
  }
  if (effective.tradeType !== null) {
    labels.push(TRADE_TYPE_SHORT_LABEL[effective.tradeType]);
  }
  return labels;
}
