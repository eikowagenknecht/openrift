import type {
  Currency,
  EffectiveTradePreference,
  TradePreference,
  TradePricePref,
  TradeType,
} from "@openrift/shared";
import { TagIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  PRICE_PREF_ABBR,
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
  /** Opens the editor (a dialog) — wired by the parent to the same dialog as
   * the context menu so we have one editor surface, not two. */
  onEdit: () => void;
  /** Optional disabled state (e.g. while a mutation is in flight). */
  disabled?: boolean;
  readOnly?: false;
}

type Props = ReadOnlyProps | EditableProps;

/**
 * Compact indicator for an entry's effective trade preference.
 *
 * Read-only variant: renders the effective labels inline (used on shared-list
 * browse where there's room beneath the card title).
 *
 * Editable variant: renders an icon-only button that opens the parent's
 * dialog. The icon is muted when nothing is set, accented when an entry
 * override is in effect, and tinted when the row is using the list default.
 * A tooltip surfaces the current effective value so users can read it without
 * opening the dialog.
 * @returns The pill node, or `null` when read-only with nothing to display.
 */
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

  const effective: EffectiveTradePreference = {
    pricePref: (props.override.pricePref ?? props.listDefault.pricePref) as TradePricePref | null,
    priceAbsoluteCents: props.override.priceAbsoluteCents ?? props.listDefault.priceAbsoluteCents,
    tradeType: (props.override.tradeType ?? props.listDefault.tradeType) as TradeType | null,
    currency: props.currency,
  };
  const labels = preferenceLabels(effective);
  const hasAnyPref = labels.length > 0;
  const ariaLabel = hasAnyPref
    ? `Edit trade preference (${labels.join(" · ")})`
    : "Set trade preference";
  // Pill content: marketplace abbreviation ("CM" / "TCG" / "CT"), the
  // formatted amount for absolute pricing, or the tag icon as a fallback
  // (only trade-type set, or nothing set at all). Keeps the actions cell
  // narrow while still telling the user the price reference at a glance.
  const pillBody = renderPillBody(effective);

  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={props.onEdit}
      className={cn(
        "hover:bg-muted inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap transition-colors",
        // visual states: empty (dashed muted), inherited from list (solid muted), overridden (accent)
        !hasAnyPref && "text-muted-foreground size-6 border-dashed px-0",
        hasAnyPref && !props.isOverridden && "text-muted-foreground",
        hasAnyPref && props.isOverridden && "text-primary border-primary/40",
        props.disabled && "pointer-events-none opacity-50",
      )}
      disabled={props.disabled}
    >
      {pillBody ?? <TagIcon className="size-3" />}
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
