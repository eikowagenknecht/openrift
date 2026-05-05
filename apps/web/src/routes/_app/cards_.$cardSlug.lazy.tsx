import type { CardErrata, Marketplace, Printing, TimeRange } from "@openrift/shared";
import {
  ALL_MARKETPLACES,
  EUR_MARKETPLACES,
  getOrientation,
  imageUrl,
  preferredPrinting,
  snapshotHeadline,
  WellKnown,
} from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  PaletteIcon,
  PencilLineIcon,
  Share2Icon,
  TagIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, lazy, useState } from "react";
import { toast } from "sonner";

import { PricingSection } from "@/components/cards/card-detail/pricing";
import { CardText } from "@/components/cards/card-text";
import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { TIME_RANGES } from "@/components/cards/price-history-chart-constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { usePriceHistory } from "@/hooks/use-price-history";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatPublicCode, formatterForMarketplace } from "@/lib/format";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { cn, PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const PriceHistoryChart = lazy(async () => {
  const m = await import("@/components/cards/price-history-chart");
  return { default: m.PriceHistoryChart };
});

export const Route = createLazyFileRoute("/_app/cards_/$cardSlug")({
  component: CardDetailPage,
});

function CardDetailPage() {
  const { cardSlug } = Route.useParams();
  const { printingId: linkedPrintingId } = Route.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const { card, sets } = data;
  const { labels } = useEnumOrders();
  const effectiveLanguageOrder = useEffectiveLanguageOrder();
  // Sort by the DB-computed canonicalRank (via the `printings_ordered` view).
  // User language preference overrides the language axis client-side.
  const rankByLang = new Map(effectiveLanguageOrder.map((lang, i) => [lang, i]));
  const unlistedRank = effectiveLanguageOrder.length;
  const printings = data.printings.toSorted((a, b) => {
    const aRank = rankByLang.get(a.language) ?? unlistedRank;
    const bRank = rankByLang.get(b.language) ?? unlistedRank;
    return aRank - bRank || a.canonicalRank - b.canonicalRank;
  });
  const [selectedPrinting, setSelectedPrinting] = useState<Printing>(() => {
    if (linkedPrintingId) {
      const match = printings.find((p) => p.id === linkedPrintingId);
      if (match) {
        return match;
      }
    }
    return preferredPrinting(printings, effectiveLanguageOrder) ?? printings[0];
  });

  // Mirror the selected printing into `?printingId=` so the URL is shareable
  // (deep-link unfurls read this in the route's `head()`). The canonical tag
  // still points at `/cards/$cardSlug`, so search engines don't see variants
  // as duplicates.
  const selectPrinting = (printing: Printing) => {
    setSelectedPrinting(printing);
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, printingId: printing.id }),
      replace: true,
    });
  };
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
  const isLandscape = getOrientation(card.type) === "landscape";
  const heroWidth = isLandscape ? 558 : 400;
  const heroHeight = isLandscape ? 400 : 558;

  // Info table rows: printing-specific on the left, card-level on the right.
  // The right column sits beside the left on desktop and stacks below on mobile.
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
        {setById.get(selectedPrinting.setId) && ` (${setById.get(selectedPrinting.setId)?.name})`}
      </Link>,
    ],
    ["Code", formatPublicCode(selectedPrinting)],
  ];
  if (selectedPrinting.printedName && selectedPrinting.printedName !== card.name) {
    leftRows.push(["Printed name", selectedPrinting.printedName]);
  }
  leftRows.push([
    "Language",
    languageLabels[selectedPrinting.language] ?? selectedPrinting.language,
  ]);
  leftRows.push([
    "Rarity",
    <span key="rarity" className="inline-flex items-center gap-1.5">
      <span className="inline-flex w-4 shrink-0 justify-center">
        <img
          src={`/images/rarities/${selectedPrinting.rarity.toLowerCase()}-28x28.webp`}
          alt=""
          width={28}
          height={28}
          className="size-4"
        />
      </span>
      {labels.rarities[selectedPrinting.rarity]}
    </span>,
  ]);
  leftRows.push([
    "Finish",
    <span key="finish" className="inline-flex items-center gap-1.5">
      <FinishIcon finish={selectedPrinting.finish} className="w-4 shrink-0 justify-center" />
      {labels.finishes[selectedPrinting.finish] ?? selectedPrinting.finish}
    </span>,
  ]);
  if (selectedPrinting.artVariant !== WellKnown.artVariant.NORMAL) {
    leftRows.push([
      "Art variant",
      <span key="art" className="inline-flex items-center gap-1">
        <PaletteIcon className="size-3.5" />
        {labels.artVariants[selectedPrinting.artVariant] ?? selectedPrinting.artVariant}
      </span>,
    ]);
  }
  if (selectedPrinting.artist) {
    leftRows.push([
      "Artist",
      <span key="artist" className="inline-flex items-center gap-1.5">
        <span className="inline-flex w-4 shrink-0 justify-center">
          <img src="/images/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
        </span>
        {selectedPrinting.artist}
      </span>,
    ]);
  }
  if (selectedPrinting.printedYear !== null) {
    leftRows.push(["Year", selectedPrinting.printedYear]);
  }

  const rightRows: [string, ReactNode][] = [
    [
      "Type",
      <TypeValue
        key="type"
        type={card.type}
        typeLabel={labels.cardTypes[card.type]}
        superTypes={card.superTypes}
      />,
    ],
  ];
  if (card.superTypes.length > 0) {
    rightRows.push([
      "Supertypes",
      card.superTypes.map((slug) => labels.superTypes[slug]).join(", "),
    ]);
  }
  if (card.domains.length > 0 && !card.domains.includes(WellKnown.domain.COLORLESS)) {
    rightRows.push([
      "Domains",
      <DomainList key="domains" domains={card.domains} labels={labels.domains} />,
    ]);
  }
  if (card.energy !== null && card.energy > 0) {
    rightRows.push(["Energy", card.energy]);
  }
  if (card.power !== null && card.power > 0) {
    rightRows.push(["Power", <PowerValue key="power" power={card.power} domains={card.domains} />]);
  }
  if (card.might !== null) {
    rightRows.push(["Might", <MightValue key="might" value={card.might} />]);
  }
  if (card.mightBonus !== null && card.mightBonus > 0) {
    rightRows.push(["Might bonus", <MightValue key="mightbonus" value={card.mightBonus} bonus />]);
  }

  const infoRowCount = Math.max(leftRows.length, rightRows.length);

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
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{card.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label="Suggest a correction"
            render={<Link to="/contribute/$cardSlug" params={{ cardSlug }} />}
          >
            <PencilLineIcon className="size-4" />
            <span className="hidden sm:inline">Suggest a correction</span>
          </Button>
          <ShareLinkButton cardName={card.name} />
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Left column: card image */}
        <div className="shrink-0 md:w-80">
          {frontImage ? (
            <img
              src={imageUrl(frontImage.imageId, "400w")}
              srcSet={`${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`}
              sizes="(min-width: 768px) 320px, 100vw"
              width={heroWidth}
              height={heroHeight}
              fetchPriority="high"
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
          <table className="w-full table-fixed text-sm">
            <tbody>
              {Array.from({ length: infoRowCount }, (_, i) => {
                const left = leftRows[i];
                const right = rightRows[i];
                return (
                  <tr key={i}>
                    <td className="text-muted-foreground w-24 py-1 pr-2 align-top text-xs font-medium">
                      <div className="flex min-h-6 flex-col justify-center">{left?.[0]}</div>
                    </td>
                    <td className="w-[calc(50%-6rem)] py-1 pr-6 align-top">
                      <div className="flex min-h-6 flex-col justify-center">{left?.[1]}</div>
                    </td>
                    <td className="text-muted-foreground hidden w-24 py-1 pr-2 align-top text-xs font-medium sm:table-cell">
                      <div className="flex min-h-6 flex-col justify-center">{right?.[0]}</div>
                    </td>
                    <td className="hidden w-[calc(50%-6rem)] py-1 align-top sm:table-cell">
                      <div className="flex min-h-6 flex-col justify-center">{right?.[1]}</div>
                    </td>
                  </tr>
                );
              })}
              {/* Right column rows stacked on mobile */}
              <tr className="sm:hidden">
                <td colSpan={2} className="pt-2">
                  <table className="w-full text-sm">
                    <tbody>
                      {rightRows.map(([label, value], i) => (
                        <InfoRow key={i} label={label}>
                          {value}
                        </InfoRow>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Full-width rows: text, errata, bans */}
          <table className="w-full table-fixed text-sm">
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
              {(selectedPrinting.markers.length > 0 ||
                selectedPrinting.distributionChannels.length > 0) && (
                <InfoRow label="Promo">
                  <div className="border-border/50 bg-muted/30 rounded border px-2.5 py-1.5">
                    {selectedPrinting.markers.length > 0 && (
                      <div className="float-right mb-1 ml-2 flex flex-wrap justify-end gap-1">
                        {selectedPrinting.markers.map((marker) => (
                          <Badge
                            key={marker.id}
                            variant="secondary"
                            title={marker.description ?? undefined}
                          >
                            {marker.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {selectedPrinting.distributionChannels.length === 1 && (
                      <ChannelLink
                        link={selectedPrinting.distributionChannels[0]}
                        language={selectedPrinting.language}
                      />
                    )}
                    {selectedPrinting.distributionChannels.length > 1 && (
                      <ul className="space-y-1">
                        {selectedPrinting.distributionChannels.map((link, index) => (
                          <li key={`${link.channel.id}-${index}`} className="flex gap-2">
                            <span aria-hidden className="text-muted-foreground/60 select-none">
                              &bull;
                            </span>
                            <ChannelLink link={link} language={selectedPrinting.language} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </InfoRow>
              )}
              {selectedPrinting.comment && (
                <InfoRow label="Note">
                  <div className="border-border/50 bg-muted/30 rounded border px-2.5 py-1.5">
                    <p className="text-muted-foreground italic">{selectedPrinting.comment}</p>
                  </div>
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

          <div className="border-border mt-3 border-t pt-3 empty:hidden">
            <PricingSection printing={selectedPrinting} range="30d" />
          </div>
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
                  onSelect={() => selectPrinting(printing)}
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
      <td className="text-muted-foreground w-24 py-1 pr-2 align-top text-xs font-medium">
        <div className="flex min-h-6 flex-col justify-center">{label}</div>
      </td>
      <td className="py-1 align-top">
        <div className="flex min-h-6 flex-col justify-center">{children}</div>
      </td>
    </tr>
  );
}

function TypeValue({
  type,
  typeLabel,
  superTypes,
}: {
  type: string;
  typeLabel: string;
  superTypes: string[];
}) {
  const iconPath = getTypeIconPath(type, superTypes);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex w-4 shrink-0 justify-center">
        {iconPath && <img src={iconPath} alt="" className="size-4 brightness-0 dark:invert" />}
      </span>
      {typeLabel}
    </span>
  );
}

function DomainList({ domains, labels }: { domains: string[]; labels: Record<string, string> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {domains.map((domain) => {
        const iconPath = getFilterIconPath("domains", domain);
        return (
          <span key={domain} className="inline-flex items-center gap-1">
            {iconPath && <img src={iconPath} alt="" width={64} height={64} className="size-4" />}
            {labels[domain]}
          </span>
        );
      })}
    </span>
  );
}

function MightValue({ value, bonus = false }: { value: number; bonus?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1", bonus && "font-semibold")}>
      <img src="/images/might.svg" alt="" className="size-4 brightness-0 dark:invert" />
      {bonus ? `+${value}` : value}
    </span>
  );
}

function PowerValue({ power, domains }: { power: number; domains: string[] }) {
  const primaryDomain = domains[0] ?? WellKnown.domain.COLORLESS;
  const iconPath = getFilterIconPath("domains", primaryDomain);
  if (!iconPath) {
    return <span>{power}</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: power }, (_, index) => (
        <img key={index} src={iconPath} alt="" className="size-4" />
      ))}
    </span>
  );
}

function ChannelLink({
  link,
  language,
}: {
  link: Printing["distributionChannels"][number];
  language: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <Link
        to="/promos"
        hash={`lang-${language}-ch-${link.channel.id}`}
        className="hover:text-foreground block"
      >
        {link.ancestorLabels.length > 0 && (
          <span className="text-muted-foreground">
            {link.ancestorLabels.join(" \u203A ")}
            {" \u203A "}
          </span>
        )}
        <span className="font-semibold underline decoration-dotted underline-offset-2">
          {link.channel.label}
        </span>
      </Link>
      {link.distributionNote && (
        <p className="text-muted-foreground italic">{link.distributionNote}</p>
      )}
    </div>
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
  const showArtVariant = printing.artVariant !== WellKnown.artVariant.NORMAL;
  const { labels } = useEnumOrders();

  const badges: ReactNode[] = [];
  if (hasFinishIcon(printing.finish)) {
    badges.push(
      <span key="finish" className="inline-flex items-center gap-0.5 text-xs">
        <FinishIcon finish={printing.finish} iconClassName="size-3" />
        {labels.finishes[printing.finish] ?? printing.finish}
      </span>,
    );
  }
  if (showArtVariant) {
    badges.push(
      <span key="art" className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <PaletteIcon className="size-3" />
        {labels.artVariants[printing.artVariant] ?? printing.artVariant}
      </span>,
    );
  }
  if (printing.markers.length > 0) {
    badges.push(
      <span
        key="markers"
        className="text-muted-foreground inline-flex items-center gap-0.5 text-xs"
      >
        <TagIcon className="size-3" />
        {printing.markers.map((m) => m.label).join(", ")}
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

  // Channel labels rendered as plain text so crawlers index them alongside
  // the card name, and long-tail searches ("<card> promo", "<card> <artist>")
  // can land on this page even without visiting each variant individually.
  const channelSummary = printing.distributionChannels
    .map((link) =>
      link.ancestorLabels.length > 0
        ? `${link.ancestorLabels.join(" \u203A ")} \u203A ${link.channel.label}`
        : link.channel.label,
    )
    .join(", ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      data-printing-id={printing.id}
      className={cn(
        "border-border bg-card flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        isSelected ? "ring-primary ring-2" : "hover:bg-accent",
      )}
    >
      <div className="bg-muted aspect-card w-10 shrink-0 overflow-hidden rounded">
        {frontImage ? (
          <img
            src={imageUrl(frontImage.imageId, "120w")}
            alt={printing.card.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="bg-muted/40 size-full" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">{formatPublicCode(printing)}</p>
          {badges}
        </div>
        {printing.artist && (
          <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <img
              src="/images/artist.svg"
              alt=""
              className="size-3 shrink-0 brightness-0 dark:invert"
            />
            <span className="truncate">{printing.artist}</span>
          </p>
        )}
        {channelSummary && (
          <p className="text-muted-foreground truncate text-xs">{channelSummary}</p>
        )}
      </div>
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
  const [source, setSource] = useState<Marketplace>(marketplaceOrder[0] ?? "cardtrader");
  const { labels } = useEnumOrders();

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
        entry[mp] = snapshotHeadline(snap);
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
        {printing.finish !== WellKnown.finish.NORMAL &&
          ` ${labels.finishes[printing.finish] ?? printing.finish}`}
        {printing.markers.length > 0 && ` (${printing.markers.map((m) => m.label).join(", ")})`}
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
          <Suspense fallback={<Skeleton className="aspect-[2.5/1] w-full rounded-lg" />}>
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
          </Suspense>
        </div>
        {tableRows.length > 0 && (
          <div className="min-w-0 xl:flex-1 xl:basis-0">
            <div className="border-border max-h-[400px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-border bg-muted/90 border-b backdrop-blur">
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Date
                    </th>
                    {availableMarketplaces.map((mp) => (
                      <th key={mp} scope="col" className="px-3 py-2 text-right font-medium">
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

function ShareLinkButton({ cardName }: { cardName: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (typeof globalThis === "undefined" || !globalThis.location) {
      return;
    }
    const url = globalThis.location.href;

    // Prefer the native share sheet on mobile (iOS Safari, Chrome Android) so
    // the user can pick Messages / WhatsApp / etc. in one tap. Desktop browsers
    // mostly don't implement this, so they fall through to clipboard.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: cardName, url });
        return;
      } catch (error) {
        // AbortError = user dismissed the share sheet; stay silent.
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        // Any other failure falls through to clipboard below.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} aria-label="Share link">
      {copied ? <CheckIcon className="size-4" /> : <Share2Icon className="size-4" />}
      Share
    </Button>
  );
}
