import type { CardErrata, Marketplace, Printing, TimeRange } from "@openrift/shared";
import { ALL_MARKETPLACES, EUR_MARKETPLACES, WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  PaintbrushIcon,
  PaletteIcon,
  SparkleIcon,
  TagIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { PriceHistoryChart, TIME_RANGES } from "@/components/cards/price-history-chart";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useLanguageLabels } from "@/hooks/use-enums";
import { usePriceHistory } from "@/hooks/use-price-history";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatPublicCode, formatterForMarketplace } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/cards_/$cardSlug")({
  component: CardDetailPage,
  pendingComponent: CardDetailPending,
});

function CardDetailPage() {
  const { cardSlug } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const { card, printings, sets } = data;
  const [selectedPrinting, setSelectedPrinting] = useState<Printing>(printings[0]);
  const setById = new Map(sets.map((s) => [s.id, s]));
  const domainColors = useDomainColors();
  const languageLabels = useLanguageLabels();

  if (!selectedPrinting) {
    return (
      <div className={PAGE_PADDING}>
        <p className="text-muted-foreground">No printings found for this card.</p>
      </div>
    );
  }

  const frontImage = selectedPrinting.images.find((i) => i.face === "front");

  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-4`}>
      <div>
        <Link
          to="/cards"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeftIcon className="size-4" />
          All cards
        </Link>
      </div>

      {/* Card header */}
      <h1 className="text-2xl font-bold">{card.name}</h1>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Left column: card image */}
        <div className="shrink-0 md:w-80">
          {frontImage ? (
            <img
              src={getCardImageUrl(frontImage.url, "full")}
              alt={card.name}
              className="w-full rounded-xl"
            />
          ) : (
            <div className="bg-muted aspect-card flex items-center justify-center rounded-xl">
              <span className="text-muted-foreground">No image</span>
            </div>
          )}
        </div>

        {/* Right column: card info */}
        <div className="border-border bg-card min-w-0 flex-1 rounded-lg border p-4">
          <table className="w-full text-sm">
            <tbody>
              {(() => {
                // Build left (printing) and right (card) rows, then zip them
                const leftRows: [string, ReactNode][] = [
                  [
                    "Set",
                    <Link
                      key="set"
                      to="/sets/$setSlug"
                      params={{ setSlug: selectedPrinting.setSlug }}
                      className="hover:text-foreground underline decoration-dotted underline-offset-2"
                    >
                      {selectedPrinting.setSlug.toUpperCase()}
                      {setById.get(selectedPrinting.setId) &&
                        ` (${setById.get(selectedPrinting.setId)?.name})`}
                    </Link>,
                  ],
                  ["Code", formatPublicCode(selectedPrinting)],
                ];
                if (selectedPrinting.printedName && selectedPrinting.printedName !== card.name) {
                  leftRows.push(["Printed name", selectedPrinting.printedName]);
                }
                leftRows.push([
                  "Rarity",
                  <span key="rarity" className="inline-flex items-center gap-1.5">
                    <img
                      src={`/images/rarities/${selectedPrinting.rarity.toLowerCase()}-28x28.webp`}
                      alt=""
                      width={28}
                      height={28}
                      className="size-4"
                    />
                    {selectedPrinting.rarity}
                  </span>,
                ]);
                leftRows.push([
                  "Finish",
                  selectedPrinting.finish === WellKnown.finish.FOIL ? (
                    <span key="finish" className="inline-flex items-center gap-1">
                      <SparkleIcon className="size-3.5 fill-amber-400 text-amber-400" />
                      Foil
                    </span>
                  ) : (
                    <span key="finish" className="capitalize">
                      {selectedPrinting.finish}
                    </span>
                  ),
                ]);
                if (selectedPrinting.artVariant !== WellKnown.artVariant.NORMAL) {
                  leftRows.push([
                    "Art variant",
                    <span key="art" className="inline-flex items-center gap-1">
                      <PaletteIcon className="size-3.5" />
                      {selectedPrinting.artVariant}
                    </span>,
                  ]);
                }
                if (selectedPrinting.promoType) {
                  leftRows.push([
                    "Promo",
                    <span key="promo" className="inline-flex items-center gap-1">
                      <TagIcon className="size-3.5" />
                      {selectedPrinting.promoType.label}
                    </span>,
                  ]);
                }
                leftRows.push(["Language", selectedPrinting.language]);
                if (selectedPrinting.artist) {
                  leftRows.push([
                    "Artist",
                    <span key="artist" className="inline-flex items-center gap-1">
                      <PaintbrushIcon className="size-3.5" />
                      {selectedPrinting.artist}
                    </span>,
                  ]);
                }

                const rightRows: [string, ReactNode][] = [["Type", card.type]];
                if (card.superTypes.length > 0) {
                  rightRows.push(["Supertypes", card.superTypes.join(", ")]);
                }
                if (card.domains.length > 0 && !card.domains.includes(WellKnown.domain.COLORLESS)) {
                  rightRows.push([
                    "Domains",
                    <span key="domains" className="inline-flex flex-wrap items-center gap-1.5">
                      {card.domains.map((domain) => (
                        <span key={domain} className="inline-flex items-center gap-1">
                          <img
                            src={`/images/domains/${domain.toLowerCase()}.webp`}
                            alt=""
                            width={64}
                            height={64}
                            className="size-4"
                          />
                          {domain}
                        </span>
                      ))}
                    </span>,
                  ]);
                }
                if (card.energy !== null && card.energy > 0) {
                  rightRows.push(["Energy", card.energy]);
                }
                if (card.power !== null && card.power > 0) {
                  rightRows.push([
                    "Power",
                    <span key="power" className="inline-flex items-center gap-1">
                      <img src="/images/power.svg" alt="" className="size-4" />
                      {card.power}
                    </span>,
                  ]);
                }
                if (card.might !== null) {
                  rightRows.push([
                    "Might",
                    <span key="might" className="inline-flex items-center gap-1">
                      <img src="/images/might.svg" alt="" className="size-4" />
                      {card.might}
                    </span>,
                  ]);
                }
                if (card.mightBonus !== null && card.mightBonus > 0) {
                  rightRows.push([
                    "Might bonus",
                    <span key="mightbonus" className="inline-flex items-center gap-1 font-semibold">
                      <img src="/images/might.svg" alt="" className="size-4" />+{card.mightBonus}
                    </span>,
                  ]);
                }

                const rowCount = Math.max(leftRows.length, rightRows.length);
                return Array.from({ length: rowCount }, (_, i) => {
                  const left = leftRows[i];
                  const right = rightRows[i];
                  return (
                    <tr key={i}>
                      <td className="text-muted-foreground py-1 pr-2 align-top text-xs font-medium whitespace-nowrap">
                        {left?.[0]}
                      </td>
                      <td className="py-1 pr-6 align-top">{left?.[1]}</td>
                      <td className="text-muted-foreground hidden py-1 pr-2 align-top text-xs font-medium whitespace-nowrap sm:table-cell">
                        {right?.[0]}
                      </td>
                      <td className="hidden py-1 align-top sm:table-cell">{right?.[1]}</td>
                    </tr>
                  );
                });
              })()}
              {/* Right column rows shown stacked on mobile */}
              <tr className="sm:hidden">
                <td colSpan={2} className="pt-2">
                  <table className="w-full text-sm">
                    <tbody>
                      <InfoRow label="Type">{card.type}</InfoRow>
                      {card.superTypes.length > 0 && (
                        <InfoRow label="Supertypes">{card.superTypes.join(", ")}</InfoRow>
                      )}
                      {card.domains.length > 0 &&
                        !card.domains.includes(WellKnown.domain.COLORLESS) && (
                          <InfoRow label="Domains">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {card.domains.map((domain) => (
                                <span key={domain} className="inline-flex items-center gap-1">
                                  <img
                                    src={`/images/domains/${domain.toLowerCase()}.webp`}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="size-4"
                                  />
                                  {domain}
                                </span>
                              ))}
                            </span>
                          </InfoRow>
                        )}
                      {card.energy !== null && card.energy > 0 && (
                        <InfoRow label="Energy">{card.energy}</InfoRow>
                      )}
                      {card.power !== null && card.power > 0 && (
                        <InfoRow label="Power">
                          <span className="inline-flex items-center gap-1">
                            <img src="/images/power.svg" alt="" className="size-4" />
                            {card.power}
                          </span>
                        </InfoRow>
                      )}
                      {card.might !== null && (
                        <InfoRow label="Might">
                          <span className="inline-flex items-center gap-1">
                            <img src="/images/might.svg" alt="" className="size-4" />
                            {card.might}
                          </span>
                        </InfoRow>
                      )}
                      {card.mightBonus !== null && card.mightBonus > 0 && (
                        <InfoRow label="Might bonus">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <img src="/images/might.svg" alt="" className="size-4" />+
                            {card.mightBonus}
                          </span>
                        </InfoRow>
                      )}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Full-width rows: text, errata, bans */}
          <table className="mt-3 w-full text-sm">
            <tbody>
              {selectedPrinting.printedRulesText && (
                <InfoRow label="Rules">
                  <p className="text-muted-foreground">
                    <CardText
                      text={card.errata?.correctedRulesText ?? selectedPrinting.printedRulesText}
                    />
                  </p>
                </InfoRow>
              )}
              {selectedPrinting.printedEffectText && (
                <InfoRow label="Effect">
                  <div
                    className="rounded px-2 py-1.5"
                    style={getDomainGradientStyle(card.domains, "18", domainColors)}
                  >
                    <p className="text-muted-foreground">
                      <CardText
                        text={
                          card.errata?.correctedEffectText ?? selectedPrinting.printedEffectText
                        }
                      />
                    </p>
                  </div>
                </InfoRow>
              )}
              {selectedPrinting.flavorText && (
                <InfoRow label="Flavor">
                  <p className="text-muted-foreground/70 italic">{selectedPrinting.flavorText}</p>
                </InfoRow>
              )}
              {card.errata && <ErrataRow errata={card.errata} printing={selectedPrinting} />}
              {card.bans.length > 0 && (
                <InfoRow label="Bans">
                  <div className="space-y-1.5 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5">
                    {card.bans.map((ban) => (
                      <div key={ban.formatId}>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                          Banned in {ban.formatName} since {ban.bannedAt}
                        </p>
                        {ban.reason && (
                          <p className="text-muted-foreground mt-0.5 text-sm">{ban.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </InfoRow>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printings grouped by language */}
      {printings.length > 0 &&
        [...Map.groupBy(printings, (p) => p.language)].map(([lang, group]) => (
          <div key={lang}>
            <h2 className="text-muted-foreground mb-2 text-xs font-medium">
              {languageLabels[lang] ?? lang}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((printing) => (
                <PrintingCard
                  key={printing.id}
                  printing={printing}
                  isSelected={printing.id === selectedPrinting.id}
                  onSelect={() => setSelectedPrinting(printing)}
                />
              ))}
            </div>
          </div>
        ))}

      {/* Price history section for selected printing */}
      {selectedPrinting && <PriceHistorySection printing={selectedPrinting} />}
    </div>
  );
}

function ErrataRow({ errata, printing }: { errata: CardErrata; printing: Printing }) {
  const hasRulesDiff =
    errata.correctedRulesText &&
    printing.printedRulesText &&
    errata.correctedRulesText !== printing.printedRulesText;
  const hasEffectDiff =
    errata.correctedEffectText &&
    printing.printedEffectText &&
    errata.correctedEffectText !== printing.printedEffectText;

  if (!hasRulesDiff && !hasEffectDiff) {
    return null;
  }

  const sourceLabel = errata.effectiveDate
    ? `${errata.source}, ${errata.effectiveDate.slice(0, 7)}`
    : errata.source;

  return (
    <InfoRow label="Errata">
      <div className="space-y-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          {errata.sourceUrl ? (
            <a
              href={errata.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2"
            >
              {sourceLabel}
            </a>
          ) : (
            <span>{sourceLabel}</span>
          )}
        </div>
        {hasRulesDiff && (
          <p className="text-muted-foreground text-sm">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original rules:
            </span>
            <CardText text={printing.printedRulesText ?? ""} />
          </p>
        )}
        {hasEffectDiff && (
          <p className="text-muted-foreground text-sm">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original effect:
            </span>
            <CardText text={printing.printedEffectText ?? ""} />
          </p>
        )}
      </div>
    </InfoRow>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <td className="text-muted-foreground py-1 pr-2 align-top text-xs font-medium whitespace-nowrap">
        {label}
      </td>
      <td className="py-1 align-top">{children}</td>
    </tr>
  );
}

function PrintingCard({
  printing,
  isSelected,
  onSelect,
}: {
  printing: Printing;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const frontImage = printing.images.find((i) => i.face === "front");
  const isFoil = printing.finish === WellKnown.finish.FOIL;
  const showArtVariant = printing.artVariant !== WellKnown.artVariant.NORMAL;

  const badges: ReactNode[] = [];
  if (isFoil) {
    badges.push(
      <span key="foil" className="inline-flex items-center gap-0.5 text-xs">
        <SparkleIcon className="size-3 fill-amber-400 text-amber-400" />
        Foil
      </span>,
    );
  }
  if (showArtVariant) {
    badges.push(
      <span key="art" className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <PaletteIcon className="size-3" />
        {printing.artVariant}
      </span>,
    );
  }
  if (printing.promoType) {
    badges.push(
      <span key="promo" className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <TagIcon className="size-3" />
        {printing.promoType.label}
      </span>,
    );
  }
  if (printing.isSigned) {
    badges.push(
      <span key="signed" className="text-muted-foreground text-xs">
        Signed
      </span>,
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "border-border bg-card flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        isSelected ? "ring-primary ring-2" : "hover:bg-accent",
      )}
    >
      <div className="bg-muted aspect-card w-10 shrink-0 overflow-hidden rounded">
        {frontImage ? (
          <img
            src={getCardImageUrl(frontImage.url, "thumbnail")}
            alt={printing.card.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="bg-muted/40 size-full" />
        )}
      </div>
      <p className="min-w-0 text-sm font-medium">{formatPublicCode(printing)}</p>
      {badges.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
    </button>
  );
}

const MARKETPLACE_LABELS_FULL: Record<Marketplace, string> = {
  tcgplayer: "TCGplayer",
  cardmarket: "Cardmarket",
  cardtrader: "Cardtrader",
};

function PriceHistorySection({ printing }: { printing: Printing }) {
  const { data } = usePriceHistory(printing.id, "all");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const [source, setSource] = useState<Marketplace>(marketplaceOrder[0] ?? "tcgplayer");

  // Also fetch the active range for the table
  const { data: rangeData } = usePriceHistory(printing.id, range);

  // Hide the entire section if no marketplace has any data
  const hasAnyData =
    data &&
    ALL_MARKETPLACES.some((mp) => {
      const mpData = data[mp];
      return mpData?.available && mpData.snapshots.length > 0;
    });

  if (!hasAnyData) {
    return null;
  }

  // Compute available ranges from the "all" data
  const allSnapshots = data?.[source]?.snapshots;
  const dataSpanDays =
    allSnapshots && allSnapshots.length >= 2
      ? Math.round(
          // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
          (new Date(allSnapshots.at(-1)!.date).getTime() -
            new Date(allSnapshots[0].date).getTime()) /
            86_400_000,
        )
      : null;

  const availableRanges = TIME_RANGES.filter(
    (tr) => tr.days === 0 || dataSpanDays === null || dataSpanDays >= tr.days,
  );

  const effectiveRange = availableRanges.some((tr) => tr.value === range)
    ? range
    : ("all" as TimeRange);

  // Build table rows from range data
  const dateMap = new Map<
    string,
    { tcgplayer?: number; cardmarket?: number; cardtrader?: number }
  >();
  if (rangeData) {
    for (const mp of ALL_MARKETPLACES) {
      const mpData = rangeData[mp];
      if (!mpData?.available) {
        continue;
      }
      for (const snap of mpData.snapshots) {
        const entry = dateMap.get(snap.date) ?? {};
        entry[mp] = snap.market;
        dateMap.set(snap.date, entry);
      }
    }
  }
  const tableRows = [...dateMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, prices]) => ({ date, ...prices }));

  const availableMarketplaces = rangeData
    ? ALL_MARKETPLACES.filter((mp) => rangeData[mp]?.available)
    : [];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">
        Price History — {formatPublicCode(printing)}
        {printing.finish !== WellKnown.finish.NORMAL && ` ${printing.finish}`}
        {printing.promoType && ` (${printing.promoType.label})`}
        {printing.language !== "EN" && ` [${printing.language}]`}
      </h2>

      {/* Shared toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ButtonGroup aria-label="Time range">
          {availableRanges.map((tr) => (
            <Button
              key={tr.value}
              variant={effectiveRange === tr.value ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(tr.value)}
            >
              {tr.label}
            </Button>
          ))}
        </ButtonGroup>
        <ButtonGroup aria-label="Price source" className="ml-auto">
          {marketplaceOrder.map((mp) => {
            const label = mp === "tcgplayer" ? "TCG" : mp === "cardmarket" ? "CM" : "CT";
            const available = data?.[mp]?.available ?? false;
            return (
              <Button
                key={mp}
                variant={source === mp ? "default" : "outline"}
                size="sm"
                onClick={() => setSource(mp)}
                disabled={!available && Boolean(data)}
              >
                {label}
              </Button>
            );
          })}
        </ButtonGroup>
      </div>

      {/* Chart + Table side by side */}
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="border-border bg-card min-w-0 rounded-lg border p-4 xl:flex-1 xl:basis-0">
          <PriceHistoryChart
            printingId={printing.id}
            range={effectiveRange}
            onRangeChange={setRange}
            source={source}
            onSourceChange={setSource}
            hideControls
            highlightedDate={hoveredDate}
            onDateHover={setHoveredDate}
          />
        </div>
        {tableRows.length > 0 && (
          <div className="min-w-0 xl:flex-1 xl:basis-0">
            <div className="border-border max-h-[400px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-border bg-muted/90 border-b backdrop-blur">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    {availableMarketplaces.map((mp) => (
                      <th key={mp} className="px-3 py-2 text-right font-medium">
                        {MARKETPLACE_LABELS_FULL[mp]} ({EUR_MARKETPLACES.has(mp) ? "EUR" : "USD"})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={row.date}
                      className={cn(
                        "border-border border-b transition-colors last:border-b-0",
                        hoveredDate === row.date && "bg-accent",
                      )}
                      onMouseEnter={() => setHoveredDate(row.date)}
                      onMouseLeave={() => setHoveredDate(null)}
                    >
                      <td className="text-muted-foreground px-3 py-1.5">{row.date}</td>
                      {availableMarketplaces.map((mp) => {
                        const value = row[mp];
                        const fmt = formatterForMarketplace(mp);
                        return (
                          <td key={mp} className="px-3 py-1.5 text-right tabular-nums">
                            {value === undefined ? "—" : fmt(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CardDetailPending() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-4`}>
      <Skeleton className="h-5 w-24" />
      <div>
        <Skeleton className="mb-1 h-8 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex flex-col gap-6 md:flex-row">
        <Skeleton className="aspect-card w-full rounded-xl md:w-80" />
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
