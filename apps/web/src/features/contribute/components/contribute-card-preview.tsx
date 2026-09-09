import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardPlaceholderImage } from "@/features/cards/components/card-placeholder-image";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { ContributePreviewHotspots } from "@/features/contribute/components/contribute-preview-hotspots";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
import { filledPreviewFields } from "@/features/contribute/lib/contribute-preview-fields";

interface LivePreviewProps {
  form: ContributeFormState;
  activePrinting: number | null;
  activeField: PlaceholderField | null;
  onFieldHover: (field: PlaceholderField | null) => void;
  onFieldSelect: (field: PlaceholderField) => void;
}

export function LivePreview({
  form,
  activePrinting,
  activeField,
  onFieldHover,
  onFieldSelect,
}: LivePreviewProps) {
  const printing = form.printings[activePrinting ?? 0] ?? form.printings[0];
  const filled = filledPreviewFields(form, activePrinting);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative w-full max-w-sm">
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
          <ContributePreviewHotspots
            activeField={activeField}
            filled={filled}
            onSelect={onFieldSelect}
            onHover={onFieldHover}
          />
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          Pick a spot on the card to jump to the field that fills it. Pure catalogue details (set,
          language, finish, art variant, markers) don&apos;t appear on the card itself.
        </p>
      </CardContent>
    </Card>
  );
}
