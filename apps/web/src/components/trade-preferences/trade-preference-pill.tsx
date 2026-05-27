import type {
  Currency,
  EffectiveTradePreference,
  TradePreference,
  TradePricePref,
  TradeType,
} from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { TradePreferenceEditor } from "./trade-preference-editor";
import {
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_SHORT_LABEL,
  formatAbsolutePrice,
} from "./trade-preference-labels";

interface ReadOnlyProps {
  /** Resolved (entry-override ?? list-default) preference. */
  effective: EffectiveTradePreference;
  readOnly: true;
}

interface EditableProps {
  /** Entry override values. Display falls back to `listDefault` when these are null. */
  override: TradePreference;
  listDefault: TradePreference;
  /** Currency of the parent list. Required to format absolute prices. */
  currency: Currency | null;
  /** True iff the entry override has any non-null field. */
  isOverridden: boolean;
  onChange: (next: TradePreference) => void;
  /** Optional disabled state (e.g. while a mutation is in flight). */
  disabled?: boolean;
  readOnly?: false;
}

type Props = ReadOnlyProps | EditableProps;

/**
 * Inline pill that summarises an entry's effective trade preference and (when
 * editable) opens a popover to override it.
 *
 * Renders nothing when there's no preference *and* no list default — the row
 * stays clean. When the user has a list default but no override, the pill
 * shows the default with an "inherited" hint via opacity.
 * @returns The pill node, or `null` when there is nothing to display.
 */
export function TradePreferencePill(props: Props) {
  const [open, setOpen] = useState(false);

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

  const effective: EffectiveTradePreference = {
    pricePref: (props.override.pricePref ?? props.listDefault.pricePref) as TradePricePref | null,
    priceAbsoluteCents: props.override.priceAbsoluteCents ?? props.listDefault.priceAbsoluteCents,
    tradeType: (props.override.tradeType ?? props.listDefault.tradeType) as TradeType | null,
    currency: props.currency,
  };
  const labels = preferenceLabels(effective);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "hover:bg-muted inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
              labels.length === 0 ? "text-muted-foreground border-dashed" : "text-foreground",
              !props.isOverridden && labels.length > 0 && "opacity-70",
              props.disabled && "pointer-events-none opacity-50",
            )}
            disabled={props.disabled}
          >
            {labels.length === 0 ? (
              <span>Set preference</span>
            ) : (
              labels.map((label, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 opacity-50">·</span>}
                  {label}
                </span>
              ))
            )}
          </button>
        }
      />
      <PopoverContent className="w-80 space-y-3">
        <div className="text-muted-foreground text-xs">
          Override for this entry. Leave fields at the list default to inherit.
        </div>
        <TradePreferenceEditor
          value={props.override}
          onChange={props.onChange}
          currency={props.currency}
          showCurrency={false}
          idPrefix="entry-override"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!props.isOverridden || props.disabled}
            onClick={() =>
              props.onChange({
                pricePref: null,
                priceAbsoluteCents: null,
                tradeType: null,
              })
            }
          >
            Reset to list default
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
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
