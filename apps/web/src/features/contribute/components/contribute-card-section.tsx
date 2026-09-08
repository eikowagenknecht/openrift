import { enumLabel } from "@openrift/shared/enum-label";
import { WellKnown } from "@openrift/shared/well-known";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ExistingCardPicker } from "@/features/contribute/components/existing-card-picker";
import { ChipInput, FieldRow, NumberInput } from "@/features/contribute/components/form-fields";
import type { ContributeFormApi } from "@/features/contribute/hooks/use-contribute-form";
import { useEnumOrders } from "@/hooks/use-enums";
import { computeDomainDisabled } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ContributeCardSectionProps extends Pick<
  ContributeFormApi,
  "form" | "errorAt" | "setCardField" | "prefillFromExisting"
> {
  lockedSlug?: string;
}

export function ContributeCardSection({
  form,
  errorAt,
  setCardField,
  prefillFromExisting,
  lockedSlug,
}: ContributeCardSectionProps) {
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Name" required error={errorAt("card.name")}>
            <Input
              value={form.card.name}
              onChange={(e) => setCardField("name", e.target.value)}
              placeholder="Ahri, Alluring"
            />
          </FieldRow>
          <FieldRow label="Slug" error={errorAt("slug")}>
            <Input value={form.slug} disabled readOnly placeholder="ahri-alluring" />
          </FieldRow>
        </div>
        <FieldRow label="Domains">
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
                      className={cn("size-4 shrink-0", isColorless && "brightness-0 dark:invert")}
                    />
                  )}
                  {enumLabel(labels.domains, slug)}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </FieldRow>
        <FieldRow label="Types">
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
          <FieldRow label="Might">
            <NumberInput value={form.card.might} onChange={(v) => setCardField("might", v)} />
          </FieldRow>
          <FieldRow label="Energy">
            <NumberInput value={form.card.energy} onChange={(v) => setCardField("energy", v)} />
          </FieldRow>
          <FieldRow label="Power">
            <NumberInput value={form.card.power} onChange={(v) => setCardField("power", v)} />
          </FieldRow>
          <FieldRow label="Might bonus">
            <NumberInput
              value={form.card.mightBonus}
              onChange={(v) => setCardField("mightBonus", v)}
            />
          </FieldRow>
        </div>
        <FieldRow label="Tags" hint="Press Enter or comma to add.">
          <ChipInput
            value={form.card.tags}
            onChange={(v) => setCardField("tags", v)}
            placeholder="Poro"
          />
        </FieldRow>
      </CardContent>
    </Card>
  );
}
