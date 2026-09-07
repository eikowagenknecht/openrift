import type {
  CardDetailRelatedCard,
  CardErrata,
  Marketplace,
  Printing,
  TimeRange,
} from "@openrift/shared";
import {
  ALL_MARKETPLACES,
  enumLabel,
  formatMonth,
  findStandardArtFallback,
  getOrientation,
  imageUrl,
  isBaseBanFormat,
  legendDisplayName,
  MARKETPLACE_CURRENCY,
  marketplaceLabel,
  snapshotHeadline,
  WellKnown,
} from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  PackageIcon,
  PaletteIcon,
  PencilLineIcon,
  Share2Icon,
  TagIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, lazy, useState } from "react";
import { toast } from "sonner";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PricingSection } from "@/components/cards/card-detail/pricing";
import { PrintingCitationList } from "@/components/cards/card-detail/printing-citations";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { CardText } from "@/components/cards/card-text";
import { FallbackArtBadges } from "@/components/cards/fallback-art-badges";
import { FinishIcon, hasFinishIcon } from "@/components/cards/finish-icon";
import { TIME_RANGES } from "@/components/cards/price-history-chart-constants";
import { PriceTrend } from "@/components/cards/price-trend";
import { SuggestImageNotice } from "@/components/cards/suggest-image-notice";
import { Heading } from "@/components/heading";
import { LanguageChip } from "@/components/language-chip";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { MarketplaceIcon } from "@/components/marketplace-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card as CardPanel } from "@/components/ui/card";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Pressable } from "@/components/ui/pressable";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePriceHistory } from "@/hooks/use-price-history";
import { useSession } from "@/lib/auth-session";
import { resolveCardMetaPrinting } from "@/lib/card-meta";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatPublicCode, formatterForMarketplace } from "@/lib/format";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn, PAGE_PADDING, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const PriceHistoryChart = lazy(async () => {
  const m = await import("@/components/cards/price-history-chart");
  return { default: m.PriceHistoryChart };
});

const CardPageCollectionActions = lazy(async () => {
  const m = await import("@/components/cards/card-page-collection-actions");
  return { default: m.CardPageCollectionActions };
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
  const rankByLang = new Map(effectiveLanguageOrder.map((lang, i) => [lang, i]));
  const unlistedRank = effectiveLanguageOrder.length;
  const printings = data.printings.toSorted((a, b) => {
    const aRank = rankByLang.get(a.language) ?? unlistedRank;
    const bRank = rankByLang.get(b.language) ?? unlistedRank;
    return aRank - bRank || a.canonicalRank - b.canonicalRank;
  });
  // Derived from `?printingId=`, not useState: the route stays mounted across
  // `$cardSlug` changes, and state would keep showing the previous card's printing.
  const selectedPrinting = resolveCardMetaPrinting(
    printings,
    linkedPrintingId,
    effectiveLanguageOrder,
  );

  // Mirrored into `?printingId=`; the route's `head()` reads this for deep-link unfurls.
  const selectPrinting = (printing: Printing) => {
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
  const isLandscape = getOrientation(card.types) === "landscape";
  const heroWidth = isLandscape ? 558 : 400;
  const heroHeight = isLandscape ? 400 : 558;
  const heroPlaceholder = (
    <CardPlaceholderImage
      name={card.name}
      domain={card.domains}
      energy={card.energy}
      might={card.might}
      power={card.power}
      types={card.types}
      superTypes={card.superTypes}
      tags={card.tags}
      rulesText={selectedPrinting.printedRulesText}
      effectText={selectedPrinting.printedEffectText}
      mightBonus={card.mightBonus}
      flavorText={selectedPrinting.flavorText}
      rarity={selectedPrinting.rarity}
      publicCode={selectedPrinting.publicCode}
      artist={selectedPrinting.artist}
      className="w-full rounded-xl"
    />
  );

  const heroFallbackArt = findStandardArtFallback(selectedPrinting, printings);
  const heroFallback = heroFallbackArt ? (
    <div className="relative">
      <ImgWithFallback
        src={imageUrl(heroFallbackArt.image.imageId, "400w")}
        srcSet={`${imageUrl(heroFallbackArt.image.imageId, "400w")} 400w, ${imageUrl(heroFallbackArt.image.imageId, "full")} 800w`}
        sizes="(min-width: 768px) 320px, 100vw"
        width={heroWidth}
        height={heroHeight}
        fetchPriority="high"
        alt={legendDisplayName(card)}
        className="w-full rounded-xl"
        fallback={heroPlaceholder}
      />
      <FallbackArtBadges printing={selectedPrinting} artPrinting={heroFallbackArt.printing} />
      <SuggestImageNotice printing={selectedPrinting} />
    </div>
  ) : (
    heroPlaceholder
  );

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
    <span key="language" className="inline-flex items-center gap-1.5">
      <LanguageChip code={selectedPrinting.language} />
      {languageLabels[selectedPrinting.language] ?? selectedPrinting.language}
    </span>,
  ]);
  const rarityIcon = getFilterIconPath("rarities", selectedPrinting.rarity);
  leftRows.push(
    [
      "Rarity",
      <span key="rarity" className="inline-flex items-center gap-1.5">
        <span className="inline-flex w-4 shrink-0 justify-center">
          {rarityIcon && <img src={rarityIcon} alt="" width={28} height={28} className="size-4" />}
        </span>
        {enumLabel(labels.rarities, selectedPrinting.rarity)}
      </span>,
    ],
    [
      "Finish",
      <span key="finish" className="inline-flex items-center gap-1.5">
        <FinishIcon finish={selectedPrinting.finish} className="w-4 shrink-0 justify-center" />
        {enumLabel(labels.finishes, selectedPrinting.finish)}
      </span>,
    ],
  );
  if (selectedPrinting.artVariant !== WellKnown.artVariant.NORMAL) {
    leftRows.push([
      "Art variant",
      <span key="art" className="inline-flex items-center gap-1">
        <PaletteIcon className="size-3.5" />
        {enumLabel(labels.artVariants, selectedPrinting.artVariant)}
      </span>,
    ]);
  }
  if (selectedPrinting.isOvernumbered) {
    leftRows.push(["Numbering", <span key="overnumbered">Overnumbered</span>]);
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
        types={card.types}
        typeLabel={card.types.map((slug) => enumLabel(labels.cardTypes, slug)).join(" ")}
        superTypes={card.superTypes}
      />,
    ],
  ];
  if (card.superTypes.length > 0) {
    rightRows.push([
      "Supertypes",
      card.superTypes.map((slug) => enumLabel(labels.superTypes, slug)).join(", "),
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
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/cards" aria-label="All cards" />
          <PageTopBarTitle>{legendDisplayName(card)}</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton
              aria-label="Suggest a correction"
              render={<Link to="/contribute/$cardSlug" params={{ cardSlug }} />}
            >
              <PencilLineIcon className="size-4" />
              <span className="hidden sm:inline">Suggest a correction</span>
            </PageTopBarButton>
            <ShareLinkButton cardName={legendDisplayName(card)} />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING_NO_TOP, "flex flex-col gap-4 pt-3")}>
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="shrink-0 md:w-80">
            {frontImage ? (
              <ImgWithFallback
                src={imageUrl(frontImage.imageId, "400w")}
                srcSet={`${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`}
                sizes="(min-width: 768px) 320px, 100vw"
                width={heroWidth}
                height={heroHeight}
                fetchPriority="high"
                alt={legendDisplayName(card)}
                className="w-full rounded-xl"
                fallback={heroFallback}
              />
            ) : (
              heroFallback
            )}
          </div>

          <CardPanel className="min-w-0 flex-1 p-4">
            <table className="w-full table-fixed text-sm">
              <tbody>
                {Array.from({ length: infoRowCount }, (_, i) => {
                  const left = leftRows[i];
                  const right = rightRows[i];
                  return (
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control
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
                {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control */}
                <tr className="sm:hidden">
                  {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table cell, not a control */}
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
                      className="rounded-md px-2 py-1.5"
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
                {selectedPrinting.markers.length > 0 && (
                  <InfoRow label="Promo">
                    <div className="border-border/50 bg-muted/30 flex flex-wrap gap-1 rounded-md border px-2.5 py-1.5">
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
                  </InfoRow>
                )}
                <FoundInRow
                  printing={selectedPrinting}
                  products={data.productsByPrinting.get(selectedPrinting.id) ?? []}
                />
                <SourcesRow printing={selectedPrinting} />
                {selectedPrinting.comment && (
                  <InfoRow label="Note">
                    <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
                      <p className="text-muted-foreground italic">{selectedPrinting.comment}</p>
                    </div>
                  </InfoRow>
                )}
                {card.errata && <ErrataRow errata={card.errata} printing={selectedPrinting} />}
                {card.bans.length > 0 && (
                  <InfoRow label="Bans">
                    <Alert variant="destructive" className="space-y-1.5">
                      {card.bans.map((ban) => (
                        <div key={ban.formatId}>
                          <AlertTitle>
                            Banned in {ban.formatName} since {ban.bannedAt}
                          </AlertTitle>
                          {ban.reason && (
                            <AlertDescription className="mt-0.5">{ban.reason}</AlertDescription>
                          )}
                          {!isBaseBanFormat(ban.formatId) && (
                            <AlertDescription className="mt-0.5">
                              Applies to {ban.formatName} play only. The card stays legal in other
                              constructed play.
                            </AlertDescription>
                          )}
                        </div>
                      ))}
                    </Alert>
                  </InfoRow>
                )}
              </tbody>
            </table>
          </CardPanel>
        </div>

        <CollectionSlot cardSlug={cardSlug} printing={selectedPrinting} siblings={printings} />

        {printings.length > 0 &&
          [...Map.groupBy(printings, (p) => p.language)].map(([lang, group]) => (
            <div key={lang}>
              <h2 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium">
                <LanguageChip code={lang} />
                {languageLabels[lang] ?? lang}
              </h2>
              {/* grid-cols-1: an implicit column would size to the widest printing card and push the page past a phone viewport. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

        {selectedPrinting && <PriceHistorySection printing={selectedPrinting} />}

        <RelatedCardsSection related={data.related} />
      </div>
    </>
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
    ? `${errata.source}, ${formatMonth(errata.effectiveDate)}`
    : errata.source;

  return (
    <InfoRow label="Errata">
      <Alert variant="warning">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <AlertTitle className="font-semibold">
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
        </AlertTitle>
        {hasRulesDiff && (
          <AlertDescription className="mt-1.5">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original rules:
            </span>
            <CardText text={printing.printedRulesText ?? ""} />
          </AlertDescription>
        )}
        {hasEffectDiff && (
          <AlertDescription className="mt-1.5">
            <span className="text-muted-foreground/60 mr-1 text-xs font-medium">
              Original effect:
            </span>
            <CardText text={printing.printedEffectText ?? ""} />
          </AlertDescription>
        )}
      </Alert>
    </InfoRow>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control
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
  types,
  typeLabel,
  superTypes,
}: {
  types: string[];
  typeLabel: string;
  superTypes: string[];
}) {
  const iconPaths = getTypeIconPaths(types, superTypes);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex w-4 shrink-0 justify-center gap-0.5">
        {iconPaths.map((path) => (
          <img key={path} src={path} alt="" className="size-4 brightness-0 dark:invert" />
        ))}
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

/** "Found in": every sealed thing this printing came in, as one list. */
function FoundInRow({
  printing,
  products,
}: {
  printing: Printing;
  products: { slug: string; name: string; quantity: number }[];
}) {
  const entries = [
    ...products.map((product) => ({
      key: `product-${product.slug}`,
      node: <ProductLink product={product} />,
    })),
    ...printing.distributionChannels.map((link, index) => ({
      key: `channel-${link.channel.id}-${index}`,
      node: <ChannelLink link={link} language={printing.language} />,
    })),
  ];
  const [firstEntry, ...otherEntries] = entries;
  if (!firstEntry) {
    return null;
  }
  return (
    <InfoRow label="Found in">
      <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
        {otherEntries.length === 0 ? (
          firstEntry.node
        ) : (
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.key} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground/60 select-none">
                  &bull;
                </span>
                {entry.node}
              </li>
            ))}
          </ul>
        )}
      </div>
    </InfoRow>
  );
}

/** "Sources": where the claims about this printing come from. */
function SourcesRow({ printing }: { printing: Printing }) {
  const citations = printing.citations ?? [];
  if (citations.length === 0) {
    return null;
  }
  return (
    <InfoRow label={citations.length === 1 ? "Source" : "Sources"}>
      <div className="border-border/50 bg-muted/30 rounded-md border px-2.5 py-1.5">
        <PrintingCitationList citations={citations} />
      </div>
    </InfoRow>
  );
}

function ProductLink({ product }: { product: { slug: string; name: string; quantity: number } }) {
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="hover:text-foreground block min-w-0 flex-1"
    >
      <span className="text-muted-foreground">{product.quantity}&times; </span>
      <span className="font-semibold underline decoration-dotted underline-offset-2">
        {product.name}
      </span>
    </Link>
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
        to="/promos/$language"
        params={{ language }}
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
        {enumLabel(labels.finishes, printing.finish)}
      </span>,
    );
  }
  if (showArtVariant) {
    badges.push(
      <span key="art" className="text-muted-foreground inline-flex items-center gap-0.5 text-xs">
        <PaletteIcon className="size-3" />
        {enumLabel(labels.artVariants, printing.artVariant)}
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
  if (printing.isOvernumbered) {
    badges.push(
      <span key="overnumbered" className="text-muted-foreground text-xs">
        Overnumbered
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

  const channelSummary = printing.distributionChannels
    .map((link) =>
      link.ancestorLabels.length > 0
        ? `${link.ancestorLabels.join(" \u203A ")} \u203A ${link.channel.label}`
        : link.channel.label,
    )
    .join(", ");

  return (
    <Pressable
      onClick={onSelect}
      aria-pressed={isSelected}
      data-printing-id={printing.id}
      className="block w-full rounded-xl"
    >
      <CardPanel
        className={cn(
          "h-full flex-row items-start gap-3 px-3 py-2 transition-colors",
          isSelected ? "ring-primary ring-2" : "hover:bg-muted/50",
        )}
      >
        <CardArtThumb
          shape="strip"
          imageId={frontImage?.imageId}
          alt={legendDisplayName(printing.card)}
          landscape={getOrientation(printing.card.types) === "landscape"}
          rarity={printing.rarity}
          domains={printing.card.domains}
          className="h-10"
          loading="lazy"
        />
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
      </CardPanel>
    </Pressable>
  );
}

function PriceHistorySection({ printing }: { printing: Printing }) {
  const { data } = usePriceHistory(printing.id, "all");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("30d");
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const [source, setSource] = useState<Marketplace>(marketplaceOrder[0] ?? "cardtrader");
  const { labels } = useEnumOrders();

  const { data: rangeData } = usePriceHistory(printing.id, range);

  const hasAnyData =
    data &&
    ALL_MARKETPLACES.some((mp) => {
      const mpData = data[mp];
      return mpData?.available && mpData.snapshots.length > 0;
    });

  if (!hasAnyData) {
    return null;
  }

  const allSnapshots = data?.[source]?.snapshots;
  const spanSnapshots = allSnapshots && allSnapshots.length >= 2 ? allSnapshots : undefined;
  const firstSnapshot = spanSnapshots?.[0];
  const lastSnapshot = spanSnapshots?.at(-1);
  const dataSpanDays =
    firstSnapshot && lastSnapshot
      ? Math.round(
          (new Date(lastSnapshot.date).getTime() - new Date(firstSnapshot.date).getTime()) /
            86_400_000,
        )
      : null;

  const availableRanges = TIME_RANGES.filter(
    (tr) => tr.days === 0 || dataSpanDays === null || dataSpanDays >= tr.days,
  );

  const effectiveRange = availableRanges.some((tr) => tr.value === range)
    ? range
    : ("all" as TimeRange);

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

  // Must match PriceHistoryChart's normalization (market for TCG/CM, zeroLow for CardTrader).
  const plottedValues = (rangeData?.[source]?.snapshots ?? []).reduce<number[]>((values, s) => {
    const value = "market" in s ? s.market : s.zeroLow;
    if (value !== null) {
      values.push(value);
    }
    return values;
  }, []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading level={2}>
          Price History — {formatPublicCode(printing)}
          {printing.finish !== WellKnown.finish.NORMAL &&
            ` ${enumLabel(labels.finishes, printing.finish)}`}
          {printing.markers.length > 0 && ` (${printing.markers.map((m) => m.label).join(", ")})`}
          {printing.language !== WellKnown.language.EN && (
            <>
              {" "}
              <LanguageChip code={printing.language} />
            </>
          )}
        </Heading>
        <PricingSection printing={printing} range={effectiveRange} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[effectiveRange]}
          onValueChange={([next]) => {
            const match = availableRanges.find((tr) => tr.value === next);
            if (match) {
              setRange(match.value);
            }
          }}
          aria-label="Time range"
        >
          {availableRanges.map((tr) => (
            <ToggleGroupItem key={tr.value} value={tr.value}>
              {tr.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          {marketplaceLabel(source)}
          <PriceTrend values={plottedValues} range={effectiveRange} />
        </span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[source]}
          onValueChange={([next]) => {
            const match = marketplaceOrder.find((mp) => mp === next);
            if (match) {
              setSource(match);
            }
          }}
          aria-label="Price source"
          className="ml-auto"
        >
          {marketplaceOrder.map((mp) => {
            const available = data?.[mp]?.available ?? false;
            const label = marketplaceLabel(mp);
            return (
              <Tooltip key={mp}>
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value={mp}
                      disabled={!available && Boolean(data)}
                      aria-label={label}
                    />
                  }
                >
                  <MarketplaceIcon marketplace={mp} />
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <CardPanel className="min-w-0 p-4 xl:flex-1 xl:basis-0">
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
        </CardPanel>
        {tableRows.length > 0 && (
          // contain-inline-size: without it the table's intrinsic width leaks up the
          // flex column and widens the page past a phone viewport.
          <div className="min-w-0 contain-inline-size xl:flex-1 xl:basis-0">
            <div className="max-h-[400px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-border bg-muted border-b">
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Date
                    </th>
                    {availableMarketplaces.map((mp) => (
                      <th key={mp} scope="col" className="px-3 py-2 text-right font-medium">
                        {marketplaceLabel(mp)} ({MARKETPLACE_CURRENCY[mp]})
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
                        hoveredDate === row.date && "bg-muted",
                      )}
                      onMouseEnter={() => setHoveredDate(row.date)}
                      onMouseLeave={() => setHoveredDate(null)}
                    >
                      <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                        {row.date}
                      </td>
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

// The counts come from a live query with no server snapshot, so this mounts
// only after hydration to avoid a server/client mismatch.
function CollectionSlot({
  cardSlug,
  printing,
  siblings,
}: {
  cardSlug: string;
  printing: Printing;
  siblings: readonly Printing[];
}) {
  const { data: session, isPending } = useSession();
  const hydrated = useHydrated();
  if (isPending) {
    return null;
  }
  if (!session?.user) {
    return <TrackCollectionNudge cardSlug={cardSlug} />;
  }
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <CardPageCollectionActions printing={printing} siblings={siblings} />
    </Suspense>
  );
}

function TrackCollectionNudge({ cardSlug }: { cardSlug: string }) {
  return (
    <CardPanel className="flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PackageIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Keep count of your copies of this card, with wishlists and tradelists that update
          themselves.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
        render={<Link to="/signup" search={{ redirect: `/cards/${cardSlug}`, email: undefined }} />}
      >
        Sign up free
      </Button>
    </CardPanel>
  );
}

function RelatedCardsSection({ related }: { related: CardDetailRelatedCard[] }) {
  if (related.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      <Heading level={2}>Related cards</Heading>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {related.map((relatedCard) => (
          <Link
            key={relatedCard.slug}
            to="/cards/$cardSlug"
            params={{ cardSlug: relatedCard.slug }}
            className="group flex flex-col gap-1.5"
          >
            <CardArtThumb
              imageId={relatedCard.imageId}
              variant="240w"
              alt=""
              rarity={relatedCard.rarity}
              domains={relatedCard.domains}
              landscape={getOrientation(relatedCard.types) === "landscape"}
              loading="lazy"
              className="w-full transition-transform group-hover:scale-[1.02]"
            />
            <span className="group-hover:text-primary truncate text-center text-sm transition-colors">
              {relatedCard.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ShareLinkButton({ cardName }: { cardName: string }) {
  const { copied, copy } = useCopyToClipboard();

  const handleShare = async () => {
    if (typeof globalThis === "undefined" || !globalThis.location) {
      return;
    }
    const url = globalThis.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: cardName, url });
        return;
      } catch (error) {
        // AbortError: user dismissed the share sheet; stay silent.
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }

    if (await copy(url)) {
      toast.success("Link copied");
    } else {
      toast.error("Could not copy link");
    }
  };

  return (
    <PageTopBarButton onClick={() => void handleShare()} aria-label="Share link">
      {copied ? <CheckIcon className="size-4" /> : <Share2Icon className="size-4" />}
      Share
    </PageTopBarButton>
  );
}
