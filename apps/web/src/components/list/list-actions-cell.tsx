import type {
  Currency,
  ListEntryDetailResponse,
  ListKind,
  TradePreference,
} from "@openrift/shared";

import type { TableRowSlotProps } from "@/components/cards/card-table";
import { ListEntryTableActions } from "@/components/list/list-entry-table-actions";
import type { ListTradeIndex } from "@/components/list/list-trade-status";
import { listEntryTradeStatus } from "@/components/list/list-trade-status";
import { RuleSourceBadge } from "@/components/list/rule-source-badge";
import { TradePreferencePill } from "@/components/trade-preferences/trade-preference-pill";
import { TradeStatusChip } from "@/components/trades/trade-status-chip";
import { entryToExcludeTarget } from "@/lib/rule-exclude";
import { dispatchExcludeFromRule } from "@/stores/card-row-actions-store";

interface ListActionsCellProps extends TableRowSlotProps {
  kind: ListKind;
  entryByItemId: Map<string, ListEntryDetailResponse>;
  entriesByPrintingId: Map<string, ListEntryDetailResponse[]>;
  /** The viewer's live-trade annotations, indexed by printing and by card. */
  tradeIndex: ListTradeIndex;
  supportsTradePrefs: boolean;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  onEditTradePref: (entryId: string) => void;
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
  /** Copy-kind only: open the keep-vs-sold chooser for the row's copy. */
  onTakeOff?: (entryId: string) => void;
  isRemovePendingFor: (entryId: string) => boolean;
  isQuantityPendingFor: (entryId: string) => boolean;
}

export function ListActionsCell({
  printing,
  itemId,
  kind,
  entryByItemId,
  entriesByPrintingId,
  tradeIndex,
  supportsTradePrefs,
  listTradeDefaults,
  listCurrency,
  onEditTradePref,
  onRemoveEntry,
  onQuantityChange,
  onTakeOff,
  isRemovePendingFor,
  isQuantityPendingFor,
}: ListActionsCellProps) {
  if (!printing || !itemId) {
    return null;
  }
  const entry = entryByItemId.get(itemId) ?? entriesByPrintingId.get(printing.id)?.[0];
  if (!entry) {
    return null;
  }
  // The row's live-trade status. A plain call, not a hook — the three guards
  // above run before anything else in this component, so a hook here would be
  // conditional.
  const tradeStatus = listEntryTradeStatus(entry, tradeIndex);
  // A copy-kind row is one physical copy, so it shows the word without the
  // count: the annotation's number covers the whole printing, and repeating it
  // per row would read as several times the copies actually in flight.
  const tradeChip = tradeStatus ? (
    <TradeStatusChip annotation={tradeStatus} detail={entry.kind === "copy" ? "word" : "label"} />
  ) : null;
  // Rule-derived entries (ADR-034) have no list_entries row — they can't be
  // edited or removed, only excluded from the rule that produced them.
  if (entry.id === null) {
    return (
      <div className="flex items-center gap-2">
        <RuleSourceBadge
          quantity={kind === "copy" ? undefined : entry.ruleQuantity}
          onExclude={() => dispatchExcludeFromRule(entryToExcludeTarget(entry))}
          excludeLabel={`Don't include ${entry.cardName}`}
        />
        {tradeChip}
      </div>
    );
  }
  // Narrowed non-null by the guard; a local const preserves it inside closures.
  const entryId = entry.id;
  const tradePill = supportsTradePrefs ? (
    <TradePreferencePill
      override={entry.tradeOverride}
      listDefault={listTradeDefaults}
      currency={listCurrency}
      isOverridden={
        entry.tradeOverride.pricePref !== null ||
        entry.tradeOverride.priceAbsoluteCents !== null ||
        entry.tradeOverride.tradeType !== null
      }
      onEdit={() => onEditTradePref(entryId)}
    />
  ) : null;
  // Additive model (ADR-034): the stepper edits the manual part; the chip shows
  // the rule's contribution. Total = manual + rule (manual = quantity - rule).
  const manualPart = entry.quantity - entry.ruleQuantity;
  return (
    <div className="flex items-center gap-2">
      {entry.ruleQuantity > 0 && (
        <RuleSourceBadge quantity={kind === "copy" ? undefined : entry.ruleQuantity} />
      )}
      {tradePill}
      {tradeChip}
      {kind === "copy" ? (
        <ListEntryTableActions
          showQuantity={false}
          onTakeOff={() => onTakeOff?.(entryId)}
          isRemovePending={isRemovePendingFor(entryId)}
        />
      ) : (
        <ListEntryTableActions
          showQuantity
          quantity={manualPart}
          onIncrement={() => onQuantityChange(entryId, manualPart + 1)}
          onDecrement={() => onQuantityChange(entryId, manualPart - 1)}
          onRemove={() => onRemoveEntry(entryId, entry.cardName)}
          isQuantityPending={isQuantityPendingFor(entryId)}
          isRemovePending={isRemovePendingFor(entryId)}
        />
      )}
    </div>
  );
}
