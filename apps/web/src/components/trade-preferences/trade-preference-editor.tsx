import type { Currency, TradePreference, TradePricePref, TradeType } from "@openrift/shared";
import { CURRENCIES, TRADE_PRICE_PREFS, TRADE_TYPES } from "@openrift/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CURRENCY_SYMBOL,
  PRICE_PREF_LABEL,
  PRICE_PREF_SHORT_LABEL,
  TRADE_TYPE_LABEL,
} from "./trade-preference-labels";

const PRICE_PREF_NONE = "__none__";
const TRADE_TYPE_NONE = "__none__";

const CURRENCY_ITEMS: { value: Currency; label: string }[] = CURRENCIES.map((value) => ({
  value,
  label: value === "EUR" ? "Euro (EUR)" : "US Dollar (USD)",
}));

export interface TradePreferenceEditorProps {
  value: TradePreference;
  onChange: (next: TradePreference) => void;
  /** Currency the absolute-price input edits in. Null disables the absolute branch. */
  currency: Currency | null;
  /** Shown when currency is required for the chosen price-pref but isn't set. */
  showCurrency?: boolean;
  onCurrencyChange?: (next: Currency) => void;
  /** ID prefix so multiple editors on one page don't collide on label htmlFor. */
  idPrefix?: string;
  /**
   * Parent list's default (per-entry override editor only). When set, the
   * "no preference" dropdown options name what the entry would inherit
   * (e.g. "Use list default (Cards or money)") instead of the bare
   * "No preference (negotiate)" label that's only correct when there is
   * no list default to fall back on.
   */
  listDefault?: TradePreference;
}

/**
 * Renders the trade-preference triple (price-pref + amount + trade-type), plus
 * an optional currency picker. Used in the list create/edit dialog and the
 * per-entry override popover.
 * @returns The form fields, in a column.
 */
export function TradePreferenceEditor({
  value,
  onChange,
  currency,
  showCurrency = false,
  onCurrencyChange,
  idPrefix = "tp",
  listDefault,
}: TradePreferenceEditorProps) {
  const pricePrefValue = value.pricePref ?? PRICE_PREF_NONE;
  const tradeTypeValue = value.tradeType ?? TRADE_TYPE_NONE;
  const isAbsolute = value.pricePref === "absolute";

  // `listDefault === undefined` means this editor is editing the list defaults
  // themselves (list create/edit dialog), so there's nothing to inherit from
  // and the option reads as the plain "no preference" label. When listDefault
  // IS provided (per-entry override dialog), the option always names what's
  // inherited — including "Negotiate" when the list itself has no value set,
  // so the user can tell inheritance is happening either way.
  const pricePrefNoneLabel =
    listDefault === undefined
      ? "No preference (negotiate)"
      : `List default (${
          listDefault.pricePref === null
            ? "Negotiate"
            : PRICE_PREF_SHORT_LABEL[listDefault.pricePref]
        })`;
  const tradeTypeNoneLabel =
    listDefault === undefined
      ? "No preference (negotiate)"
      : `List default (${
          listDefault.tradeType === null ? "Negotiate" : TRADE_TYPE_LABEL[listDefault.tradeType]
        })`;

  const pricePrefItems: { value: string; label: string }[] = [
    { value: PRICE_PREF_NONE, label: pricePrefNoneLabel },
    ...TRADE_PRICE_PREFS.map((option) => ({ value: option, label: PRICE_PREF_LABEL[option] })),
  ];
  const tradeTypeItems: { value: string; label: string }[] = [
    { value: TRADE_TYPE_NONE, label: tradeTypeNoneLabel },
    ...TRADE_TYPES.map((option) => ({ value: option, label: TRADE_TYPE_LABEL[option] })),
  ];

  const handlePricePrefChange = (next: string) => {
    if (next === PRICE_PREF_NONE) {
      onChange({ ...value, pricePref: null, priceAbsoluteCents: null });
      return;
    }
    if (next === "absolute") {
      onChange({
        ...value,
        pricePref: "absolute",
        priceAbsoluteCents: value.priceAbsoluteCents ?? 100,
      });
      return;
    }
    onChange({
      ...value,
      pricePref: next as TradePricePref,
      priceAbsoluteCents: null,
    });
  };

  const handleAmountChange = (text: string) => {
    // Accept "4", "4.50". Empty input keeps the absolute pref but unsets the amount;
    // the parent should treat that as a draft state and refuse to save.
    if (text.trim() === "") {
      onChange({ ...value, priceAbsoluteCents: null });
      return;
    }
    const cents = parseAmountToCents(text);
    if (cents === null) {
      return;
    }
    onChange({ ...value, priceAbsoluteCents: cents });
  };

  const handleTradeTypeChange = (next: string) => {
    if (next === TRADE_TYPE_NONE) {
      onChange({ ...value, tradeType: null });
      return;
    }
    onChange({ ...value, tradeType: next as TradeType });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-price`} className="w-20 shrink-0 font-normal">
          Price
        </Label>
        <Select
          items={pricePrefItems}
          value={pricePrefValue}
          onValueChange={(next) => {
            if (next !== null) {
              handlePricePrefChange(next);
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-price`} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pricePrefItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showCurrency && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-currency`} className="w-20 shrink-0 font-normal">
            Currency
          </Label>
          <Select
            items={CURRENCY_ITEMS}
            value={currency ?? "EUR"}
            onValueChange={(next) => {
              if (next && CURRENCIES.includes(next as Currency)) {
                onCurrencyChange?.(next as Currency);
              }
            }}
          >
            <SelectTrigger id={`${idPrefix}-currency`} className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isAbsolute && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-amount`} className="w-20 shrink-0 font-normal">
            Amount
          </Label>
          <div className="flex flex-1 items-center gap-2">
            <Input
              id={`${idPrefix}-amount`}
              inputMode="decimal"
              placeholder="e.g. 4 or 4.50"
              value={formatCentsForInput(value.priceAbsoluteCents)}
              onChange={(event) => handleAmountChange(event.target.value)}
            />
            <span className="text-muted-foreground text-sm">
              {currency ? CURRENCY_SYMBOL[currency] : "?"}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-type`} className="w-20 shrink-0 font-normal">
          Accepts
        </Label>
        <Select
          items={tradeTypeItems}
          value={tradeTypeValue}
          onValueChange={(next) => {
            if (next !== null) {
              handleTradeTypeChange(next);
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tradeTypeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function parseAmountToCents(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/u.test(trimmed)) {
    return null;
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100);
}

function formatCentsForInput(cents: number | null): string {
  if (cents === null) {
    return "";
  }
  const whole = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `${whole}.${String(remainder).padStart(2, "0")}`;
}
