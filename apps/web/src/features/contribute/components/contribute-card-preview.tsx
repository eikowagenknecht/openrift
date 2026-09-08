import { WellKnown } from "@openrift/shared/well-known";
import { ChevronRightIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CardPlaceholderImage } from "@/features/cards/components/card-placeholder-image";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";

interface CardPreviewProps {
  form: ContributeFormState;
  activePrinting: number | null;
}

const LAYOUT_LEGEND: { label: string; region: string }[] = [
  { label: "Card name", region: "Centre band" },
  { label: "Type, supertypes", region: "Italic stripe above the name" },
  { label: "Tags", region: "Italic stripes next to the type" },
  { label: "Energy", region: "Top-left circle" },
  { label: "Might", region: "Top-right shield" },
  { label: "Power", region: "Coloured dots below energy" },
  { label: "Domains", region: "Card colour and footer glyphs" },
  { label: "Rules text", region: "Top of the text box" },
  { label: "Effect text", region: "Highlighted band in the text box" },
  { label: "Might bonus", region: "Small +N inside the effect band" },
  { label: "Flavor text", region: "Italic, dimmed line" },
  { label: "Rarity", region: "Glyph in the footer centre" },
  { label: "Public code", region: "Bottom-left of the footer" },
  { label: "Artist", region: "Bottom-right of the footer" },
];

export function CardLayoutHelp({ form, activePrinting }: CardPreviewProps) {
  const printing = form.printings[activePrinting ?? 0] ?? form.printings[0];
  const cardName = form.card.name || "Your card name";
  const cardDomains = form.card.domains.length > 0 ? form.card.domains : ["fury"];
  const cardTypes = form.card.types.length > 0 ? form.card.types : [WellKnown.cardType.UNIT];
  const cardSuperTypes =
    form.card.superTypes.length > 0 ? form.card.superTypes : [WellKnown.superType.CHAMPION];
  const cardTags = form.card.tags.length > 0 ? form.card.tags : ["Tag"];
  const cardEnergy = form.card.energy ?? 3;
  const cardMight = form.card.might ?? 4;
  const cardPower = form.card.power ?? 2;
  const cardRulesText = printing?.printedRulesText || "Rules text appears in this section.";
  const cardEffectText = printing?.printedEffectText || "Effect text gets a highlighted band.";
  const cardMightBonus = form.card.mightBonus ?? 1;
  const printingFlavor = printing?.flavorText || "Optional flavor line, in italics.";
  const printingRarity = printing?.rarity || WellKnown.rarity.COMMON;
  const printingPublicCode = printing?.publicCode || "ABC-001/002";
  const printingArtist = printing?.artist || "Artist name";
  return (
    <Collapsible className="rounded-md border p-3">
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 text-sm select-none">
        <span>Where do these fields appear on a card?</span>
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div className="w-56 justify-self-center sm:justify-self-start">
          <CardPlaceholderImage
            name={cardName}
            domain={cardDomains}
            energy={cardEnergy}
            might={cardMight}
            power={cardPower}
            types={cardTypes}
            superTypes={cardSuperTypes}
            tags={cardTags}
            rulesText={cardRulesText}
            effectText={cardEffectText}
            mightBonus={cardMightBonus}
            flavorText={printingFlavor}
            rarity={printingRarity}
            publicCode={printingPublicCode}
            artist={printingArtist}
          />
        </div>
        <div className="text-sm">
          <p className="text-muted-foreground">
            Pure-metadata fields (slug, set, language, finish, art variant, markers, image URL)
            don&apos;t appear on the card.
          </p>
          <dl className="mt-3 flex flex-col gap-y-1.5">
            {LAYOUT_LEGEND.map((entry) => (
              <div key={entry.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <dt className="font-medium">{entry.label}</dt>
                <dd className="text-muted-foreground">{entry.region}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function LivePreview({ form, activePrinting }: CardPreviewProps) {
  const printing = form.printings[activePrinting ?? 0] ?? form.printings[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full max-w-sm">
          <CardPlaceholderImage
            name={form.card.name}
            domain={form.card.domains}
            energy={form.card.energy}
            might={form.card.might}
            power={form.card.power}
            types={form.card.types}
            superTypes={form.card.superTypes}
            tags={form.card.tags}
            rulesText={printing?.printedRulesText ?? null}
            effectText={printing?.printedEffectText ?? null}
            mightBonus={form.card.mightBonus}
            flavorText={printing?.flavorText ?? null}
            rarity={printing?.rarity ?? undefined}
            publicCode={printing?.publicCode ?? undefined}
            artist={printing?.artist ?? undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}
