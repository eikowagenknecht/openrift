import type { Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, SparkleIcon } from "lucide-react";
import { useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolvePrice } from "@/hooks/use-card-data";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";
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
  const { card, printings } = data;
  const [selectedPrinting, setSelectedPrinting] = useState<Printing>(printings[0]);
  const domainColors = useDomainColors();

  if (!selectedPrinting) {
    return (
      <div className={PAGE_PADDING}>
        <p className="text-muted-foreground">No printings found for this card.</p>
      </div>
    );
  }

  const frontImage = selectedPrinting.images.find((i) => i.face === "front");

  return (
    <div className={`${PAGE_PADDING} flex flex-col gap-4`}>
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
      <div>
        <h1 className="text-2xl font-bold">{card.name}</h1>
        <p className="text-muted-foreground text-sm">
          {card.domains.length > 0 && !card.domains.includes(WellKnown.domain.COLORLESS)
            ? `${card.domains.join(" / ")} `
            : ""}
          {card.superTypes.length > 0 ? `${card.superTypes.join(" ")} ` : ""}
          {card.type}
        </p>
      </div>

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
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Stats */}
          <div className="flex flex-wrap items-center gap-1.5">
            {card.energy !== null && card.energy > 0 && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                Energy {card.energy}
              </span>
            )}
            {card.power !== null && card.power > 0 && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                <img src="/images/power.svg" alt="" className="size-4" />
                {card.power}
              </span>
            )}
            {card.might !== null && (
              <span className="bg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold">
                <img src="/images/might.svg" alt="" className="size-4" />
                {card.might}
              </span>
            )}
            {!card.domains.includes(WellKnown.domain.COLORLESS) &&
              card.domains.map((domain) => (
                <Tooltip key={domain}>
                  <TooltipTrigger>
                    <img
                      src={`/images/domains/${domain.toLowerCase()}.webp`}
                      alt={domain}
                      width={64}
                      height={64}
                      className="size-5"
                    />
                  </TooltipTrigger>
                  <TooltipContent>{domain}</TooltipContent>
                </Tooltip>
              ))}
          </div>

          {/* Rules text */}
          {selectedPrinting.printedRulesText && (
            <div className="border-border/50 bg-muted/30 rounded-lg border px-3 py-2.5">
              <p className="text-muted-foreground text-sm">
                <CardText
                  text={card.errata?.correctedRulesText ?? selectedPrinting.printedRulesText}
                />
              </p>
            </div>
          )}

          {/* Effect text */}
          {(selectedPrinting.printedEffectText ||
            (card.mightBonus !== null && card.mightBonus > 0)) && (
            <div
              className="border-border/50 rounded-lg border px-3 py-2.5"
              style={getDomainGradientStyle(card.domains, "18", domainColors)}
            >
              {selectedPrinting.printedEffectText && (
                <p className="text-muted-foreground text-sm">
                  <CardText
                    text={card.errata?.correctedEffectText ?? selectedPrinting.printedEffectText}
                  />
                </p>
              )}
              {card.mightBonus !== null && card.mightBonus > 0 && (
                <p
                  className={cn(
                    "text-sm font-semibold",
                    selectedPrinting.printedEffectText && "mt-2",
                  )}
                >
                  <img src="/images/might.svg" alt="" className="mr-1 inline size-4" />
                  Might Bonus +{card.mightBonus}
                </p>
              )}
            </div>
          )}

          {/* Flavor text */}
          {selectedPrinting.flavorText && (
            <p className="text-muted-foreground/70 text-sm italic">{selectedPrinting.flavorText}</p>
          )}

          {/* Ban banner */}
          {card.bans.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
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
          )}
        </div>
      </div>

      {/* All printings section */}
      {printings.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Printings ({printings.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {printings.map((printing) => (
              <PrintingCard
                key={printing.id}
                printing={printing}
                isSelected={printing.id === selectedPrinting.id}
                onSelect={() => setSelectedPrinting(printing)}
              />
            ))}
          </div>
        </div>
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
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favorite = marketplaceOrder[0] ?? "tcgplayer";
  const price = resolvePrice(printing, favorite);
  const frontImage = printing.images.find((i) => i.face === "front");
  const isFoil = printing.finish === WellKnown.finish.FOIL;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "border-border bg-card flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        isSelected ? "ring-primary ring-2" : "hover:bg-accent",
      )}
    >
      <div className="bg-muted aspect-card w-16 shrink-0 overflow-hidden rounded-md">
        {frontImage ? (
          <img
            src={getCardImageUrl(frontImage.url, "thumbnail")}
            alt={printing.card.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="text-muted-foreground text-[10px]">No img</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{formatPublicCode(printing)}</p>
        <Link
          to="/sets/$setSlug"
          params={{ setSlug: printing.setSlug }}
          className="text-muted-foreground hover:text-foreground text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          {printing.setSlug}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <img
                src={`/images/rarities/${printing.rarity.toLowerCase()}-28x28.webp`}
                alt={printing.rarity}
                width={28}
                height={28}
                className="size-4"
              />
            </TooltipTrigger>
            <TooltipContent>{printing.rarity}</TooltipContent>
          </Tooltip>
          {isFoil && (
            <span className="inline-flex items-center gap-0.5 text-xs">
              <SparkleIcon className="size-3 fill-amber-400 text-amber-400" />
              Foil
            </span>
          )}
          {price !== undefined && (
            <span className="text-muted-foreground text-xs font-semibold">${price.toFixed(2)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function CardDetailPending() {
  return (
    <div className={`${PAGE_PADDING} flex flex-col gap-4`}>
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
