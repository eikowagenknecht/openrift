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
  tradeIndex: ListTradeIndex;
  supportsTradePrefs: boolean;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  onEditTradePref: (entryId: string) => void;
  onRemoveEntry: (entryId: string, cardName: string) => void;
  onQuantityChange: (entryId: string, quantity: number) => void;
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
  const tradeStatus = listEntryTradeStatus(entry, tradeIndex);
  const tradeChip = tradeStatus ? (
    <TradeStatusChip annotation={tradeStatus} detail={entry.kind === "copy" ? "word" : "label"} />
  ) : null;
  // Rule-derived entries have no list_entries row, so they can only be
  // excluded, never edited or removed.
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
  // quantity = manual + rule; the stepper edits only the manual part.
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
