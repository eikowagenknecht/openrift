import { enumLabel } from "@openrift/shared/enum-label";
import { WellKnown } from "@openrift/shared/well-known";
import { useState } from "react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { ExistingCardPicker } from "@/features/contribute/components/existing-card-picker";
import { ChipInput, FieldRow, NumberInput } from "@/features/contribute/components/form-fields";
import type { ContributeFormApi } from "@/features/contribute/hooks/use-contribute-form";
import type { ContributeFormCard } from "@/features/contribute/lib/contribute-json";
import { useEnumOrders } from "@/hooks/use-enums";
import { computeDomainDisabled } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ContributeCardSectionProps extends Pick<
  ContributeFormApi,
  "form" | "errorAt" | "setCardField" | "prefillFromExisting"
> {
  lockedSlug?: string;
  reveal?: PlaceholderField | null;
}

function hasCardDetails(card: ContributeFormCard): boolean {
  return (
    card.domains.length > 0 ||
    card.types.length > 0 ||
    card.superTypes.length > 0 ||
    card.tags.length > 0 ||
    card.might !== null ||
    card.energy !== null ||
    card.power !== null ||
    card.mightBonus !== null
  );
}

export function ContributeCardSection({
  form,
  errorAt,
  setCardField,
  prefillFromExisting,
  lockedSlug,
  reveal,
}: ContributeCardSectionProps) {
  const [open, setOpen] = useState(() => hasCardDetails(form.card));
  const [lastReveal, setLastReveal] = useState(reveal ?? null);
  if (reveal !== undefined && reveal !== lastReveal) {
    setLastReveal(reveal);
    if (reveal !== null && reveal !== "card.name") {
      setOpen(true);
    }
  }
  const { orders, labels } = useEnumOrders();
  const domainDisabled = computeDomainDisabled(form.card.domains, orders.domains);
  const domainIcons = Object.fromEntries(
    orders.domains.map((slug) => [slug, getFilterIconPath("domains", slug)]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card</CardTitle>
        {!lockedSlug && (
          <CardAction>
            <ExistingCardPicker onPick={prefillFromExisting} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldRow
          label="Name"
          required
          field="card.name"
          error={errorAt("card.name") ?? errorAt("slug")}
        >
          <Input
            value={form.card.name}
            onChange={(e) => setCardField("name", e.target.value)}
            placeholder="Ahri, Alluring"
          />
        </FieldRow>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger
            render={
              <ExpandToggle expanded={open} className="text-muted-foreground hover:text-foreground">
                Card details
              </ExpandToggle>
            }
          />
          <CollapsibleContent className="mt-4 flex flex-col gap-4">
            <FieldRow label="Domains" field="card.domains">
              <ToggleGroup
                multiple
                variant="outline"
                spacing={0}
                value={form.card.domains}
                onValueChange={(next) => setCardField("domains", next)}
              >
                {orders.domains.map((slug) => {
                  const selected = form.card.domains.includes(slug);
                  const disabled = !selected && domainDisabled.has(slug);
                  const iconSrc = domainIcons[slug];
                  const isColorless = slug === WellKnown.domain.COLORLESS;
                  return (
                    <ToggleGroupItem key={slug} value={slug} disabled={disabled}>
                      {iconSrc && (
                        <img
                          src={iconSrc}
                          alt=""
                          className={cn(
                            "size-4 shrink-0",
                            isColorless && "brightness-0 dark:invert",
                          )}
                        />
                      )}
                      {enumLabel(labels.domains, slug)}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </FieldRow>
            <FieldRow label="Types" field="card.types">
              <ToggleGroup
                multiple
                variant="outline"
                spacing={0}
                value={form.card.types}
                onValueChange={(next) => setCardField("types", next)}
              >
                {orders.cardTypes.map((slug) => (
                  <ToggleGroupItem key={slug} value={slug}>
                    {enumLabel(labels.cardTypes, slug)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldRow>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Supertypes">
                <ToggleGroup
                  multiple
                  variant="outline"
                  spacing={0}
                  value={form.card.superTypes}
                  onValueChange={(next) => setCardField("superTypes", next)}
                >
                  {orders.superTypes.map((slug) => (
                    <ToggleGroupItem key={slug} value={slug}>
                      {enumLabel(labels.superTypes, slug)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldRow>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <FieldRow label="Might" field="card.might">
                <NumberInput value={form.card.might} onChange={(v) => setCardField("might", v)} />
              </FieldRow>
              <FieldRow label="Energy" field="card.energy">
                <NumberInput value={form.card.energy} onChange={(v) => setCardField("energy", v)} />
              </FieldRow>
              <FieldRow label="Power" field="card.power">
                <NumberInput value={form.card.power} onChange={(v) => setCardField("power", v)} />
              </FieldRow>
              <FieldRow label="Might bonus" field="card.mightBonus">
                <NumberInput
                  value={form.card.mightBonus}
                  onChange={(v) => setCardField("mightBonus", v)}
                />
              </FieldRow>
            </div>
            <FieldRow label="Tags" hint="Press Enter or comma to add." field="card.tags">
              <ChipInput
                value={form.card.tags}
                onChange={(v) => setCardField("tags", v)}
                placeholder="Poro"
              />
            </FieldRow>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
