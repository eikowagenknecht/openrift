import type { Printing } from "@openrift/shared";
import { snapshotHeadline } from "@openrift/shared";
import { useState } from "react";

import { PrintingLanguageTabs } from "@/components/cards/printing-language-tabs";
import { PrintingRowContent } from "@/components/cards/printing-row";
import { useLanguageList } from "@/hooks/use-enums";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
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

  // Which tab the user picked, and the printing it was picked against. Keying
  // on the printing means selecting a card in another language moves the tab
  // with it, without an effect to sync the two.
  const [picked, setPicked] = useState<{ language: string; forPrintingId: string } | null>(null);

  const pickedLanguage = picked?.forPrintingId === current.id ? picked.language : current.language;

  // The wrapper owns the gap in both modes: the shell renders the heading and
  // the list bare when there is only one language.
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
    <h3 className="text-muted-foreground shrink-0 text-xs font-medium tracking-wide uppercase">
      Printings
    </h3>
  );
}

function PrintingList({
  printings,
  current,
  onSelect,
}: {
  /** The rows to show, which is also the sibling set labels disambiguate against. */
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
              codeLink
              right={
                <>
                  <OwnedCollectionsPopover
                    printingId={p.id}
                    cardName={p.card.name}
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
  // The 30-day history is only a fallback for printings with no current
  // price. With one row per printing, fetching it unconditionally fans out
  // into N parallel price-history calls every time a card is selected
  // (Sentry flags it as an N+1 API call) — so skip the query whenever the
  // inline price already answers the question.
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
