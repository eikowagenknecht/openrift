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

import { CURRENCY_SYMBOL, PRICE_PREF_LABEL, TRADE_TYPE_LABEL } from "./trade-preference-labels";

const PRICE_PREF_NONE = "__none__";
const TRADE_TYPE_NONE = "__none__";

const PRICE_PREF_ITEMS: { value: string; label: string }[] = [
  { value: PRICE_PREF_NONE, label: "No preference (negotiate)" },
  ...TRADE_PRICE_PREFS.map((value) => ({ value, label: PRICE_PREF_LABEL[value] })),
];

const TRADE_TYPE_ITEMS: { value: string; label: string }[] = [
  { value: TRADE_TYPE_NONE, label: "No preference (negotiate)" },
  ...TRADE_TYPES.map((value) => ({ value, label: TRADE_TYPE_LABEL[value] })),
];

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
}: TradePreferenceEditorProps) {
  const pricePrefValue = value.pricePref ?? PRICE_PREF_NONE;
  const tradeTypeValue = value.tradeType ?? TRADE_TYPE_NONE;
  const isAbsolute = value.pricePref === "absolute";

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
    <div className="flex flex-col gap-3">
      {showCurrency && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-currency`} className="w-28 shrink-0 font-normal">
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
            <SelectTrigger id={`${idPrefix}-currency`} className="flex-1">
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

      <div className="flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-price`} className="w-28 shrink-0 font-normal">
          Price
        </Label>
        <Select
          items={PRICE_PREF_ITEMS}
          value={pricePrefValue}
          onValueChange={(next) => {
            if (next !== null) {
              handlePricePrefChange(next);
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-price`} className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICE_PREF_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isAbsolute && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-amount`} className="w-28 shrink-0 font-normal">
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
        <Label htmlFor={`${idPrefix}-type`} className="w-28 shrink-0 font-normal">
          Accepts
        </Label>
        <Select
          items={TRADE_TYPE_ITEMS}
          value={tradeTypeValue}
          onValueChange={(next) => {
            if (next !== null) {
              handleTradeTypeChange(next);
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRADE_TYPE_ITEMS.map((item) => (
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
  return remainder === 0 ? `${whole}` : `${whole}.${String(remainder).padStart(2, "0")}`;
}
