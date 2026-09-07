import { WellKnown } from "@openrift/shared/well-known";
import { useState } from "react";

import { SECTION_SCROLL_MARGIN } from "@/components/deck/deck-overview-tabs";
import { EnergyChart, PowerChart } from "@/components/deck/stats/energy-power-chart";
import { LensBar } from "@/components/deck/stats/lens-bar";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { InfoHint } from "@/components/ui/info-hint";
import { Pressable } from "@/components/ui/pressable";
import { useDeckStats } from "@/hooks/use-deck-stats";
import type { useEnumOrders } from "@/hooks/use-enums";
import { useMeasuredWidth } from "@/hooks/use-measured-width";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { curveOutRate } from "@/lib/deck-curve-out";
import { formatChancePct } from "@/lib/deck-draw-odds";
import { oddsGroupPresets, oddsGroupRow } from "@/lib/deck-odds-groups";
import { NO_CARDS } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import {
  buildOwnershipRows,
  buildRarityByCardKey,
  buildRarityRows,
  OWNERSHIP_LENS_SERIES,
  ownershipFocusKeys,
  rarityFocusKeys,
  rarityLensSeries,
} from "@/lib/deck-stat-lenses";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";
import { cn } from "@/lib/utils";
import type { StatsLens } from "@/stores/deck-builder-ui-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

type OwnedPrinting = ReturnType<DeckOwnershipData["ownedPrintingByCardId"]["get"]>;

export function DeckStatsBand({
  cards,
  stats,
  ownershipData,
  ownershipSegmentsByCardKey,
  ownedPrintingFor,
  enumLabels,
  enumOrders,
  statsFocus,
  applyStatsFocus,
  statsOpen,
  onStatsOpenChange,
}: {
  cards: DeckBuilderCard[];
  stats: ReturnType<typeof useDeckStats>;
  ownershipData?: DeckOwnershipData;
  ownershipSegmentsByCardKey?: ReadonlyMap<string, OwnershipBandSegments>;
  ownedPrintingFor: (cardId: string) => OwnedPrinting;
  enumLabels: ReturnType<typeof useEnumOrders>["labels"];
  enumOrders: ReturnType<typeof useEnumOrders>["orders"];
  statsFocus: StatsFocus | null;
  applyStatsFocus: (focus: StatsFocus) => void;
  /** Hydration-gated by the host; SSR always renders the band open. Keep the gate there, not here. */
  statsOpen: boolean;
  onStatsOpenChange: (open: boolean) => void;
}) {
  const hasMultiTypeCards = cards.some(
    (card) =>
      (card.zone === WellKnown.deckZone.MAIN || card.zone === WellKnown.deckZone.CHAMPION) &&
      card.cardTypes.length > 1,
  );

  const hasStats =
    stats.energyCurve.length > 0 || stats.powerCurve.length > 0 || stats.typeBreakdown.length > 0;

  const focusedCards = statsFocus
    ? cards.filter((card) => cardMatchesStatsFocus(card, statsFocus))
    : NO_CARDS;
  const focusedStats = useDeckStats(focusedCards);

  const rarityByCardKey = ownershipData
    ? buildRarityByCardKey(
        cards,
        (card) =>
          (
            ownedPrintingFor(card.cardId) ??
            ownershipData.byCardZone.get(`${card.cardId}:${card.zone}`)?.displayPrinting
          )?.rarity,
      )
    : undefined;
  const rarityRows = rarityByCardKey
    ? buildRarityRows(cards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
    : undefined;
  const raritySeries = rarityRows ? rarityLensSeries(rarityRows, enumLabels.rarities) : [];
  const rarityHitRows =
    statsFocus && statsFocus.kind !== "rarity" && rarityByCardKey
      ? buildRarityRows(focusedCards, rarityByCardKey, enumOrders.rarities, enumLabels.rarities)
      : undefined;

  const ownershipRows = ownershipSegmentsByCardKey
    ? buildOwnershipRows(cards, ownershipSegmentsByCardKey)
    : undefined;
  const ownershipHitRows =
    statsFocus && statsFocus.kind !== "ownership" && ownershipSegmentsByCardKey
      ? buildOwnershipRows(focusedCards, ownershipSegmentsByCardKey)
      : undefined;

  const [statsChartsEl, setStatsChartsEl] = useState<HTMLDivElement | null>(null);
  const statsChartsWidth = useMeasuredWidth(statsChartsEl);
  const rarityLensAvailable = rarityRows !== undefined && rarityRows.length > 0;
  const ownershipLensAvailable = ownershipRows !== undefined;
  const lensOptions: { key: StatsLens; label: string }[] = [
    ...(stats.typeBreakdown.length > 0 ? [{ key: "types" as const, label: "Types" }] : []),
    ...(rarityLensAvailable ? [{ key: "rarity" as const, label: "Rarity" }] : []),
    ...(ownershipLensAvailable ? [{ key: "ownership" as const, label: "Collection" }] : []),
  ];
  const storedStatsLens = useDeckBuilderUiStore((state) => state.statsLens);
  const setStatsLens = useDeckBuilderUiStore((state) => state.setStatsLens);
  const statsLens = lensOptions.some((option) => option.key === storedStatsLens)
    ? storedStatsLens
    : (lensOptions[0]?.key ?? "types");
  const chartTracks = [
    { present: stats.energyCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.powerCurve.length > 0, track: "1.5fr", minWidth: 260 },
    { present: stats.typeBreakdown.length > 0, track: "1fr", minWidth: 170 },
    { present: rarityLensAvailable || ownershipLensAvailable, track: "1fr", minWidth: 200 },
  ].filter((chart) => chart.present);
  const statsGap = 40;
  const wideMinWidth =
    chartTracks.reduce((sum, chart) => sum + chart.minWidth, 0) +
    (chartTracks.length - 1) * statsGap;
  const hasLensCharts = lensOptions.length > 1;
  const wideStats = hasLensCharts && statsChartsWidth >= wideMinWidth;

  const typesChart = (withHeading: boolean) =>
    stats.typeBreakdown.length > 0 ? (
      <TypeBreakdown
        data={stats.typeBreakdown}
        domains={stats.typeBreakdownDomains}
        revealDomainsOnHover
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "type", value })}
        footnote={hasMultiTypeCards ? "A card with two types counts under both." : undefined}
        focusValue={statsFocus?.kind === "type" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "type" ? focusedStats.typeBreakdown : undefined}
        hideHeading={!withHeading}
      />
    ) : null;

  const rarityChart = (withHeading: boolean) =>
    rarityRows && rarityLensAvailable ? (
      <LensBar
        title={withHeading ? "Rarity" : undefined}
        rows={rarityRows}
        series={raritySeries}
        onSegmentClick={(value) => {
          if (!rarityByCardKey) {
            return;
          }
          applyStatsFocus({
            kind: "rarity",
            value,
            cardKeys: rarityFocusKeys(cards, rarityByCardKey, value),
          });
        }}
        focusValue={statsFocus?.kind === "rarity" ? statsFocus.value : null}
        hitRows={rarityHitRows}
      />
    ) : null;

  const ownershipChart = (withHeading: boolean) =>
    ownershipRows ? (
      <LensBar
        title={withHeading ? "Collection" : undefined}
        rows={ownershipRows}
        series={OWNERSHIP_LENS_SERIES}
        footnote="Counts the main deck against your collection."
        onSegmentClick={(value) => {
          if (!ownershipSegmentsByCardKey) {
            return;
          }
          const ownershipClass = OWNERSHIP_LENS_SERIES.find((series) => series.key === value)?.key;
          if (!ownershipClass) {
            return;
          }
          applyStatsFocus({
            kind: "ownership",
            value: ownershipClass,
            cardKeys: ownershipFocusKeys(cards, ownershipSegmentsByCardKey, ownershipClass),
          });
        }}
        focusValue={statsFocus?.kind === "ownership" ? statsFocus.value : null}
        hitRows={ownershipHitRows}
      />
    ) : null;

  const energyChartNode =
    stats.energyCurve.length > 0 ? (
      <EnergyChart
        data={stats.energyCurve}
        stacks={stats.energyCurveStacks}
        average={stats.averageEnergy}
        revealDomainsOnHover
        footnote="Counts the main deck. Click a bar to see its cards."
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "energy", value })}
        focusValue={statsFocus?.kind === "energy" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "energy" ? focusedStats.energyCurve : undefined}
      />
    ) : null;

  const powerChartNode =
    stats.powerCurve.length > 0 ? (
      <PowerChart
        data={stats.powerCurve}
        stacks={stats.powerCurveStacks}
        average={stats.averagePower}
        showTotals
        onBarClick={(value) => applyStatsFocus({ kind: "power", value })}
        focusValue={statsFocus?.kind === "power" ? statsFocus.value : null}
        hitData={statsFocus && statsFocus.kind !== "power" ? focusedStats.powerCurve : undefined}
      />
    ) : null;

  const lensBarsNode =
    rarityLensAvailable || ownershipLensAvailable ? (
      <div className="flex flex-col gap-4">
        {rarityChart(true)}
        {ownershipChart(true)}
      </div>
    ) : null;
  const wideCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "types", node: typesChart(true) },
    { key: "lenses", node: lensBarsNode },
  ].filter((cell) => cell.node !== null);

  const thirdSlotNode = hasLensCharts ? (
    <div>
      <div className="mb-1 flex items-center gap-3 text-xs">
        {lensOptions.map((option) => (
          <Pressable
            key={option.key}
            onClick={() => setStatsLens(option.key)}
            aria-pressed={statsLens === option.key}
            className={cn(
              "font-medium transition-colors",
              statsLens !== option.key && "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Pressable>
        ))}
      </div>
      {statsLens === "types"
        ? typesChart(false)
        : statsLens === "rarity"
          ? rarityChart(false)
          : ownershipChart(false)}
    </div>
  ) : (
    (typesChart(true) ?? rarityChart(true) ?? ownershipChart(true))
  );
  const narrowCells = [
    { key: "energy", node: energyChartNode },
    { key: "power", node: powerChartNode },
    { key: "slot", node: thirdSlotNode },
  ].filter((cell) => cell.node !== null);

  const statsCharts = (
    <div
      ref={setStatsChartsEl}
      className={cn("grid gap-y-4", !wideStats && "@lg:grid-cols-2 @3xl:grid-cols-3")}
      style={
        wideStats
          ? { gridTemplateColumns: chartTracks.map((chart) => chart.track).join(" ") }
          : undefined
      }
    >
      {wideStats
        ? wideCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                index > 0 && "border-l pl-5",
                index < wideCells.length - 1 && "pr-5",
              )}
            >
              {cell.node}
            </div>
          ))
        : narrowCells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0",
                index === 0 && "@lg:pr-5",
                index === 1 && "@lg:border-l @lg:pl-5 @3xl:pr-5",
                index === 2 && "@3xl:border-l @3xl:pl-5",
              )}
            >
              {cell.node}
            </div>
          ))}
    </div>
  );

  const presets = oddsGroupPresets(cards, enumLabels.cardTypes);
  const turnOneFirst = presets.find((preset) => preset.key === "turn-one-first");
  const turnOneSecond = presets.find((preset) => preset.key === "turn-one-second");
  const turnOneFirstChance = turnOneFirst ? oddsGroupRow(cards, turnOneFirst).openingChance : null;
  const turnOneSecondChance = turnOneSecond
    ? oddsGroupRow(cards, turnOneSecond).openingChance
    : null;
  const curveOutFirst = curveOutRate(cards, { goingSecond: false });
  const curveOutSecond = curveOutRate(cards, { goingSecond: true });
  const headlineChips = (
    <div className="text-muted-foreground hidden items-center gap-3 text-xs tabular-nums @lg:flex">
      {turnOneFirstChance !== null && turnOneSecondChance !== null && (
        <span className="flex items-center gap-1">
          Turn-1 play {formatChancePct(turnOneFirstChance)} · {formatChancePct(turnOneSecondChance)}
          <InfoHint label="Turn-1 play" side="bottom">
            The chance your opening hand holds a turn-one play. First number: going first (a unit or
            gear at 2 energy or less). Second: going second (3 or less). Spells don&rsquo;t count
            &mdash; there&rsquo;s nothing to react to yet.
          </InfoHint>
        </span>
      )}
      {curveOutFirst !== null && curveOutSecond !== null && (
        <span className="flex items-center gap-1">
          Curve-out {formatChancePct(curveOutFirst)} · {formatChancePct(curveOutSecond)}
          <InfoHint label="Curve-out" side="bottom">
            How often you can play at least one card on each of turns 1&ndash;3 &mdash; first number
            going first, second going second. A card needs energy plus power runes, and you channel
            two runes a turn (one extra on your first turn going second).
          </InfoHint>
        </span>
      )}
    </div>
  );

  if (!hasStats) {
    return null;
  }

  return (
    <div
      id="deck-stats"
      style={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}
      className="flex flex-col gap-3"
    >
      <div className="flex h-6 items-center gap-2 border-b">
        <ExpandToggle
          expanded={statsOpen}
          chevronClassName="size-3.5"
          onClick={() => onStatsOpenChange(!statsOpen)}
          className="text-muted-foreground hover:text-foreground flex-1 transition-colors"
        >
          <span className="text-2xs font-semibold tracking-wide uppercase">Stats</span>
        </ExpandToggle>
        {headlineChips}
      </div>
      {statsOpen && statsCharts}
    </div>
  );
}
