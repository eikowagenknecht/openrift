import type { Domain, Rarity } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { EraserIcon } from "lucide-react";

import { CardTextInput } from "@/components/contribute/card-text-input";
import {
  ChipInput,
  FieldRow,
  NumberInput,
  SingleSelect,
} from "@/components/contribute/form-fields";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEnumOrders } from "@/hooks/use-enums";
import { computeDomainDisabled } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useCardDesignerStore } from "@/stores/card-designer-store";

/**
 * Reuses the contribute form's inputs but drops printing-catalog metadata
 * (set, language, year, markers, finish, art variant, signed) since this
 * designs an invented card.
 */
export function CardDesignerForm() {
  const card = useCardDesignerStore((state) => state.card);
  const setCardField = useCardDesignerStore((state) => state.setCardField);
  const showAttribution = useCardDesignerStore((state) => state.showAttribution);
  const setShowAttribution = useCardDesignerStore((state) => state.setShowAttribution);
  const reset = useCardDesignerStore((state) => state.reset);
  const { orders, labels } = useEnumOrders();

  const domainDisabled = computeDomainDisabled(card.domains, orders.domains);
  const domainIcons = Object.fromEntries(
    orders.domains.map((slug) => [slug, getFilterIconPath("domains", slug)]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card details</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <EraserIcon className="size-4" />
            Clear
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Name">
            <Input
              value={card.name}
              onChange={(e) => setCardField("name", e.target.value)}
              placeholder="Sir Pounce, Lord of Naps"
            />
          </FieldRow>
          <FieldRow label="Type">
            <SingleSelect
              value={card.type || null}
              onChange={(value) => setCardField("type", value ?? "")}
              options={orders.cardTypes}
              labels={labels.cardTypes}
              placeholder="Pick a type"
            />
          </FieldRow>
        </div>

        <FieldRow label="Domains">
          <ToggleGroup
            multiple
            variant="outline"
            spacing={1}
            className="flex-wrap"
            value={card.domains}
            onValueChange={(next) => setCardField("domains", next as Domain[])}
          >
            {orders.domains.map((slug) => {
              const selected = card.domains.includes(slug as Domain);
              const disabled = !selected && domainDisabled.has(slug);
              const iconSrc = domainIcons[slug];
              const isColorless = slug === WellKnown.domain.COLORLESS;
              return (
                <ToggleGroupItem key={slug} value={slug} disabled={disabled}>
                  {iconSrc && (
                    <img
                      src={iconSrc}
                      alt=""
                      className={cn("size-4 shrink-0", isColorless && "brightness-0 dark:invert")}
                    />
                  )}
                  {labels.domains[slug]}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </FieldRow>

        <FieldRow label="Supertypes">
          <ToggleGroup
            multiple
            variant="outline"
            spacing={1}
            className="flex-wrap"
            value={card.superTypes}
            onValueChange={(next) => setCardField("superTypes", next)}
          >
            {orders.superTypes.map((slug) => (
              <ToggleGroupItem key={slug} value={slug}>
                {labels.superTypes[slug]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldRow>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <FieldRow label="Energy">
            <NumberInput value={card.energy} onChange={(value) => setCardField("energy", value)} />
          </FieldRow>
          <FieldRow label="Might">
            <NumberInput value={card.might} onChange={(value) => setCardField("might", value)} />
          </FieldRow>
          <FieldRow label="Power">
            <NumberInput value={card.power} onChange={(value) => setCardField("power", value)} />
          </FieldRow>
          <FieldRow label="Might bonus">
            <NumberInput
              value={card.mightBonus}
              onChange={(value) => setCardField("mightBonus", value)}
            />
          </FieldRow>
        </div>

        <FieldRow label="Tags" hint="Press Enter or comma to add.">
          <ChipInput
            value={card.tags}
            onChange={(value) => setCardField("tags", value)}
            placeholder="Cat"
          />
        </FieldRow>

        <CardTextInput
          label="Rules text"
          value={card.rulesText}
          onChange={(value) => setCardField("rulesText", value)}
        />
        <CardTextInput
          label="Effect text"
          value={card.effectText}
          onChange={(value) => setCardField("effectText", value)}
        />
        <FieldRow label="Flavor text">
          <Textarea
            rows={2}
            value={card.flavorText}
            onChange={(e) => setCardField("flavorText", e.target.value)}
          />
        </FieldRow>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow label="Rarity">
            <SingleSelect
              value={card.rarity}
              onChange={(value) => setCardField("rarity", value as Rarity | null)}
              options={orders.rarities}
              labels={labels.rarities}
              placeholder="Pick a rarity"
            />
          </FieldRow>
          <FieldRow label="Code">
            <Input
              value={card.publicCode}
              onChange={(e) => setCardField("publicCode", e.target.value)}
              placeholder="MEOW-009/009"
            />
          </FieldRow>
          <FieldRow label="Artist">
            <Input
              value={card.artist}
              onChange={(e) => setCardField("artist", e.target.value)}
              placeholder="Whiskers von Catsworth"
            />
          </FieldRow>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="card-designer-attribution">
            Add openrift.app to help spread the word
          </Label>
          <Switch
            id="card-designer-attribution"
            checked={showAttribution}
            onCheckedChange={setShowAttribution}
          />
        </div>
      </CardContent>
    </Card>
  );
}
