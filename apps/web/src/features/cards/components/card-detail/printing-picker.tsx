import { snapshotHeadline } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";

import { SectionHeading } from "@/components/ui/section-heading";
import { PrintingLanguageTabs } from "@/features/cards/components/printing-language-tabs";
import { PrintingRowContent } from "@/features/cards/components/printing-row";
import { usePriceHistory } from "@/features/cards/hooks/use-price-history";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { useLanguageList } from "@/hooks/use-enums";
import { formatterForMarketplace, priceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { OwnedCollectionsPopover } from "./owned-collections-popover";

export function PrintingPicker({
  current,
  printings,
  onSelect,
}: {
  current: Printing;
  printings: Printing[];
  onSelect: (printing: Printing) => void;
}) {
  const languageOrder = useLanguageList();

  // Keyed on printing id so switching printings resets the tab without an effect.
  const [picked, setPicked] = useState<{ language: string; forPrintingId: string } | null>(null);

  const pickedLanguage = picked?.forPrintingId === current.id ? picked.language : current.language;

  return (
    <div className="space-y-2">
      <PrintingLanguageTabs
        printings={printings}
        languageOrder={languageOrder.map((entry) => entry.code)}
        activeLanguage={pickedLanguage}
        onLanguageChange={(next) => setPicked({ language: next, forPrintingId: current.id })}
        header={<PickerHeading />}
      >
        {(shown) => <PrintingList printings={shown} current={current} onSelect={onSelect} />}
      </PrintingLanguageTabs>
    </div>
  );
}

function PickerHeading() {
  return (
    <SectionHeading as="h3" className="shrink-0">
      Printings
    </SectionHeading>
  );
}

function PrintingList({
  printings,
  current,
  onSelect,
}: {
  printings: Printing[];
  current: Printing;
  onSelect: (printing: Printing) => void;
}) {
  return (
    <div className="space-y-1">
      {printings.map((p) => {
        const isActive = p.id === current.id;
        return (
          <div
            key={p.id}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- can't use <button>; the row contains the OwnedCollectionsPopover trigger button, and nested buttons are invalid HTML
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onClick={() => onSelect(p)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(p);
              }
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
              isActive ? "bg-muted ring-border ring-1" : "hover:bg-muted/50",
            )}
          >
            <PrintingRowContent
              printing={p}
              siblings={printings}
              right={
                <>
                  <OwnedCollectionsPopover
                    printingId={p.id}
                    cardName={legendDisplayName(p.card)}
                    shortCode={p.shortCode}
                  />
                  <PrintingPrices printing={p} />
                </>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function PrintingPrices({ printing }: { printing: Printing }) {
  const favorite = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");
  const prices = usePrices();
  const inline = prices.get(printing.id, favorite) ?? null;
  // 30-day history is only a fallback; querying it unconditionally fans out into
  // an N+1 of price-history calls across one row per printing.
  const { data: history } = usePriceHistory(inline === null ? printing.id : null, "30d");

  let value: number | null = inline;
  if (value === null) {
    const snapshots = history?.[favorite]?.snapshots;
    if (snapshots?.length) {
      // oxlint-disable-next-line no-non-null-assertion -- length check above
      value = snapshotHeadline(snapshots.at(-1)!);
    }
  }

  if (value === null) {
    return null;
  }

  return (
    <span className={cn("shrink-0 text-xs font-semibold", priceColorClass(value))}>
      {formatterForMarketplace(favorite)(value)}
    </span>
  );
}
