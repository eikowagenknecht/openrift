import { enumLabel } from "@openrift/shared/enum-label";
import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { PaletteIcon, TagIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LanguageChip } from "@/components/language-chip";
import { Card as CardPanel } from "@/components/ui/card";
import { Pressable } from "@/components/ui/pressable";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { FinishIcon, hasFinishIcon } from "@/features/cards/components/finish-icon";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { formatPublicCode } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CardPagePrintings({
  printings,
  selectedPrintingId,
  onSelect,
}: {
  printings: Printing[];
  selectedPrintingId: string;
  onSelect: (printing: Printing) => void;
}) {
  const languageLabels = useLanguageLabels();
  if (printings.length === 0) {
    return null;
  }
  return (
    <>
      {[...Map.groupBy(printings, (p) => p.language)].map(([lang, group]) => (
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
                isSelected={printing.id === selectedPrintingId}
                onSelect={() => onSelect(printing)}
              />
            ))}
          </div>
        </div>
      ))}
    </>
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
        ? `${link.ancestorLabels.join(" › ")} › ${link.channel.label}`
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
