import type { DeskCard, DeskPrintingRow } from "@openrift/shared/contracts/admin/printing-desk";
import { enumLabel } from "@openrift/shared/enum-label";
import { formatPrintingCode } from "@openrift/shared/printing-code";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { PageDescription, PageTopBarBack } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { DeskSegmented, DeskThumb } from "@/features/admin/components/printing-desk-shared";
import { useDeskCardPrintings } from "@/features/admin/hooks/use-printing-desk";
import {
  basePrintingForLanguage,
  defaultCardLanguage,
} from "@/features/admin/lib/printing-desk-base";
import { imageCountText } from "@/features/admin/lib/printing-desk-filter";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { useMarkers } from "@/hooks/use-markers";

export function PrintingDeskCardPage({ cardSlug }: { cardSlug: string }) {
  const { data } = useDeskCardPrintings(cardSlug);
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const preferredLanguages = useEffectiveLanguageOrder();
  const { data: markerData } = useMarkers();
  const markerLabels = new Map(markerData.markers.map((marker) => [marker.slug, marker.label]));

  const languages = [...new Set(data.printings.map((printing) => printing.language))];
  const [language, setLanguage] = useState(() =>
    defaultCardLanguage(languages, preferredLanguages),
  );
  const shown = data.printings.filter((printing) => printing.language === language);
  const base = basePrintingForLanguage(data.printings, language);

  return (
    <div className="space-y-4">
      <AdminPageTopBar title={data.card.name} back={<PageTopBarBack to="/admin/printing-desk" />} />

      <PageDescription>
        Every printing this card has, in every language. Open one to add images, or start a new
        promo printing.
      </PageDescription>

      <CardHeaderPanel card={data.card} base={base} />

      {languages.length > 1 && (
        <DeskSegmented
          ariaLabel="Language"
          value={language}
          onChange={setLanguage}
          options={languages.map((code) => ({
            value: code,
            label: languageLabels[code] ?? code,
          }))}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((printing) => (
          <PrintingTile
            key={printing.printingId}
            printing={printing}
            rarityLabel={enumLabel(labels.rarities, printing.rarity)}
            finishLabel={enumLabel(labels.finishes, printing.finish)}
            markerLabels={markerLabels}
          />
        ))}
        <NewPrintingTile cardSlug={cardSlug} />
      </div>
    </div>
  );
}

function CardHeaderPanel({ card, base }: { card: DeskCard; base: DeskPrintingRow | undefined }) {
  const { labels } = useEnumOrders();
  const meta = [
    enumLabel(labels.cardTypes, card.type),
    card.domains.map((domain) => enumLabel(labels.domains, domain)).join(" · "),
    base?.setName,
  ].filter((part): part is string => Boolean(part));

  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        {base && <DeskThumb row={base} className="w-16" />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{card.name}</p>
          <p className="text-muted-foreground text-sm">{meta.join(" · ")}</p>
          {base && <p className="text-muted-foreground text-sm">Art by {base.artist}</p>}
        </div>
        <Link
          to="/cards/$cardSlug/{-$printingSlug}"
          params={{ cardSlug: card.slug }}
          className="text-primary flex shrink-0 items-center gap-1 text-sm hover:underline"
        >
          Card page
          <ExternalLinkIcon className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

function PrintingTile({
  printing,
  rarityLabel,
  finishLabel,
  markerLabels,
}: {
  printing: DeskPrintingRow;
  rarityLabel: string;
  finishLabel: string;
  markerLabels: ReadonlyMap<string, string>;
}) {
  return (
    <CardLink
      className="flex flex-col gap-2 p-3"
      render={
        <Link
          to="/admin/printing-desk/printings/$printingId"
          params={{ printingId: printing.printingId }}
        />
      }
    >
      <DeskThumb row={printing} className="w-full" variant="400w" />
      <p className="font-mono text-sm">{formatPrintingCode(printing.publicCode)}</p>
      <div className="flex flex-wrap gap-1">
        <Badge variant="muted">{rarityLabel}</Badge>
        <Badge variant="muted">{finishLabel}</Badge>
        {printing.markerSlugs.map((slug) => (
          <Badge key={slug}>{markerLabels.get(slug) ?? slug}</Badge>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{imageCountText(printing.imageCount)}</p>
    </CardLink>
  );
}

function NewPrintingTile({ cardSlug }: { cardSlug: string }) {
  return (
    <CardLink
      className="border-input text-muted-foreground hover:text-foreground flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed p-3 text-center ring-0"
      render={<Link to="/admin/printing-desk/new" search={{ card: cardSlug }} />}
    >
      <PlusIcon className="size-5" />
      <span className="text-sm font-medium">New promo printing</span>
    </CardLink>
  );
}
