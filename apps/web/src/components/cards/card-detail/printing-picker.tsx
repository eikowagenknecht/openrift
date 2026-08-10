import type { Printing } from "@openrift/shared";
import { snapshotHeadline } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguageLabels, useLanguageList } from "@/hooks/use-enums";
import { usePriceHistory } from "@/hooks/use-price-history";
import { usePrices } from "@/hooks/use-prices";
import { formatCardId, formatterForMarketplace, priceColorClass } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { OwnedCollectionsPopover } from "./owned-collections-popover";

/**
 * Language codes present in `printings`, in the taxonomy's own order. Codes the
 * taxonomy doesn't know are appended rather than dropped, so a printing can
 * never become unreachable because its language is missing from /init.
 * @returns The languages to offer, ordered.
 */
function languagesInOrder(byLanguage: Map<string, Printing[]>, order: string[]): string[] {
  const known = order.filter((code) => byLanguage.has(code));
  const unknown = [...byLanguage.keys()].filter((code) => !known.includes(code));
  return [...known, ...unknown];
}

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
  const languageLabels = useLanguageLabels();

  // Which tab the user picked, and the printing it was picked against. Keying
  // on the printing means selecting a card in another language moves the tab
  // with it, without an effect to sync the two.
  const [picked, setPicked] = useState<{ language: string; forPrintingId: string } | null>(null);

  const byLanguage = Map.groupBy(printings, (p) => p.language);
  const languages = languagesInOrder(
    byLanguage,
    languageOrder.map((entry) => entry.code),
  );

  if (languages.length < 2) {
    return (
      <PickerFrame>
        <PrintingList printings={printings} current={current} onSelect={onSelect} />
      </PickerFrame>
    );
  }

  const pickedLanguage = picked?.forPrintingId === current.id ? picked.language : current.language;
  // The shown card's language can be absent from its own sibling list (a
  // surface that hands the picker a filtered set), so fall back to the first tab.
  const activeLanguage = languages.includes(pickedLanguage) ? pickedLanguage : languages[0];

  return (
    <PickerFrame>
      <Tabs
        value={activeLanguage}
        onValueChange={(next) => setPicked({ language: String(next), forPrintingId: current.id })}
      >
        {/* Many languages overflow the 400px pane, so the strip scrolls on its
            own rather than widening the detail. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList variant="line">
            {languages.map((code) => (
              <TabsTrigger key={code} value={code} title={languageLabels[code] ?? code}>
                <span className="font-mono">{code}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {byLanguage.get(code)?.length ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {/* Only the open panel is rendered. Mounting one per language leaves
            the closed ones in the accessibility tree, where a screen reader
            reads every language's printings as if all were on screen.

            The group is also the sibling set: labels disambiguate against
            what's visible, which drops the language chip that would otherwise
            repeat on every row of a single-language tab. */}
        <TabsContent value={activeLanguage}>
          <PrintingList
            printings={byLanguage.get(activeLanguage) ?? []}
            current={current}
            onSelect={onSelect}
          />
        </TabsContent>
      </Tabs>
    </PickerFrame>
  );
}

function PickerFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Printings
      </h3>
      {children}
    </div>
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
  const hasMixedRarities = new Set(printings.map((p) => p.rarity)).size > 1;

  return (
    <div className="space-y-1">
      {printings.map((p) => {
        const isActive = p.id === current.id;
        const rarityIcon = getFilterIconPath("rarities", p.rarity);
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
            <span className="min-w-0 flex-1 truncate">
              <PrintingVariantLabel
                printing={p}
                siblings={printings}
                code={
                  <>
                    {hasMixedRarities && rarityIcon && (
                      <img
                        src={rarityIcon}
                        alt={p.rarity}
                        title={p.rarity}
                        width={28}
                        height={28}
                        className="mr-1 inline size-3.5 align-text-bottom"
                      />
                    )}
                    <Link
                      to="/sets/$setSlug"
                      params={{ setSlug: p.setSlug }}
                      className="text-muted-foreground hover:text-foreground font-mono text-xs"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {formatCardId(p)}
                    </Link>
                  </>
                }
              />
            </span>
            <OwnedCollectionsPopover
              printingId={p.id}
              cardName={p.card.name}
              shortCode={p.shortCode}
            />
            <PrintingPrices printing={p} />
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
