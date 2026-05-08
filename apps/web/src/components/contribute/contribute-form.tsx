import type { SetListResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ExternalLinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { CardTextInput } from "@/components/contribute/card-text-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useEnumOrders, useLanguageList, useMarkerList } from "@/hooks/use-enums";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type {
  ContributeFormPrinting,
  ContributeFormState,
  ValidationError,
} from "@/lib/contribute-json";
import {
  buildCommitMessage,
  buildContributionFilename,
  buildContributionJson,
  buildGithubNewFileUrl,
  emptyPrinting,
  formatDateStamp,
  nameToSlug,
  validateContribution,
} from "@/lib/contribute-json";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ContributeFormProps {
  initial: ContributeFormState;
  /**
   * When set, the slug input is locked: the form is correcting an existing
   * card and the slug must round-trip to the same `contributions/<slug>.json`
   * file after the consolidation Action runs.
   */
  lockedSlug?: string;
}

export function ContributeForm({ initial, lockedSlug }: ContributeFormProps) {
  const [state, setState] = useState<ContributeFormState>(initial);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [activePrinting, setActivePrinting] = useState(0);

  const { orders, labels } = useEnumOrders();
  const languages = useLanguageList();
  const markerOptions = useMarkerList();
  const { data: setListData } = useSuspenseQuery(publicSetListQueryOptions);

  const setCardField = <K extends keyof ContributeFormState["card"]>(
    key: K,
    value: ContributeFormState["card"][K],
  ) => {
    setState((s) => {
      const nextSlug = !lockedSlug && key === "name" ? nameToSlug(value as string) : s.slug;
      let nextPrintings = s.printings;
      if (key === "name") {
        const oldName = s.card.name;
        const nextName = value as string;
        nextPrintings = s.printings.map((p) =>
          p.printedName === oldName || p.printedName === "" ? { ...p, printedName: nextName } : p,
        );
      }
      return {
        ...s,
        slug: nextSlug,
        card: { ...s.card, [key]: value },
        printings: nextPrintings,
      };
    });
  };
  const setPrintingField = <K extends keyof ContributeFormPrinting>(
    index: number,
    key: K,
    value: ContributeFormPrinting[K],
  ) => {
    setState((s) => ({
      ...s,
      printings: s.printings.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    }));
  };
  const addPrinting = () => {
    setState((s) => {
      const nextPrintings = [...s.printings, emptyPrinting()];
      setActivePrinting(nextPrintings.length - 1);
      return { ...s, printings: nextPrintings };
    });
  };
  const removePrinting = (index: number) => {
    setState((s) => {
      const nextPrintings = s.printings.filter((_, i) => i !== index);
      setActivePrinting((prev) => Math.min(prev, nextPrintings.length - 1));
      return { ...s, printings: nextPrintings };
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const result = validateContribution(state);
    setErrors(result.errors);
    if (!result.ok) {
      return;
    }
    const stamp = formatDateStamp(new Date());
    const json = buildContributionJson(state, stamp);
    const filename = buildContributionFilename(state.slug, stamp);
    const message = buildCommitMessage(state.card.name, lockedSlug !== undefined);
    const url = buildGithubNewFileUrl(filename, json, message);
    globalThis.open(url, "_blank", "noopener,noreferrer");
  };

  const errorAt = (path: string): string | undefined =>
    submitted ? errors.find((e) => e.path === path)?.message : undefined;

  const sets = setListData.sets;
  const domainDisabled = computeDomainDisabled(state.card.domains, orders.domains);
  const domainIcons = Object.fromEntries(
    orders.domains.map((slug) => [slug, getFilterIconPath("domains", slug)]),
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <IntroBlock lockedSlug={lockedSlug} />

      <CardLayoutHelp state={state} activePrinting={activePrinting} />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Card</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Name" required error={errorAt("card.name")}>
            <Input
              value={state.card.name}
              onChange={(e) => setCardField("name", e.target.value)}
              placeholder="Ahri, Alluring"
            />
          </FieldRow>
          <FieldRow label="Slug" error={errorAt("slug")}>
            <Input value={state.slug} disabled readOnly placeholder="ahri-alluring" />
          </FieldRow>
        </div>
        <FieldRow label="Domains">
          <ToggleGroup
            multiple
            variant="outline"
            value={state.card.domains}
            onValueChange={(next) => setCardField("domains", next)}
          >
            {orders.domains.map((slug) => {
              const selected = state.card.domains.includes(slug);
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Type">
            <SingleSelect
              value={state.card.type}
              onChange={(v) => setCardField("type", v)}
              options={orders.cardTypes}
              labels={labels.cardTypes}
              placeholder="Pick a type"
            />
          </FieldRow>
          <FieldRow label="Super types">
            <ToggleGroup
              multiple
              variant="outline"
              value={state.card.superTypes}
              onValueChange={(next) => setCardField("superTypes", next)}
            >
              {orders.superTypes.map((slug) => (
                <ToggleGroupItem key={slug} value={slug}>
                  {labels.superTypes[slug]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldRow>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <FieldRow label="Might">
            <NumberInput value={state.card.might} onChange={(v) => setCardField("might", v)} />
          </FieldRow>
          <FieldRow label="Energy">
            <NumberInput value={state.card.energy} onChange={(v) => setCardField("energy", v)} />
          </FieldRow>
          <FieldRow label="Power">
            <NumberInput value={state.card.power} onChange={(v) => setCardField("power", v)} />
          </FieldRow>
          <FieldRow label="Might bonus">
            <NumberInput
              value={state.card.mightBonus}
              onChange={(v) => setCardField("mightBonus", v)}
            />
          </FieldRow>
        </div>
        <FieldRow label="Tags" hint="Press Enter or comma to add.">
          <ChipInput
            value={state.card.tags}
            onChange={(v) => setCardField("tags", v)}
            placeholder="Ahri"
          />
        </FieldRow>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Printings</h2>
          <Button type="button" variant="outline" size="sm" onClick={addPrinting}>
            <PlusIcon className="size-4" />
            Add printing
          </Button>
        </div>
        {state.printings.length > 1 ? (
          <Tabs
            value={activePrinting.toString()}
            onValueChange={(next) => setActivePrinting(Number(next))}
          >
            <TabsList className="w-full justify-start overflow-x-auto">
              {state.printings.map((printing, index) => (
                <TabsTrigger key={index} value={index.toString()}>
                  {printingTabLabel(index, printing)}
                </TabsTrigger>
              ))}
            </TabsList>
            {state.printings.map((printing, index) => (
              <TabsContent key={index} value={index.toString()}>
                <PrintingCard
                  index={index}
                  printing={printing}
                  errorAt={errorAt}
                  sets={sets}
                  languages={languages}
                  markers={markerOptions}
                  orders={orders}
                  labels={labels}
                  onChange={(key, value) => setPrintingField(index, key, value)}
                  onRemove={() => removePrinting(index)}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          state.printings.map((printing, index) => (
            <PrintingCard
              key={index}
              index={index}
              printing={printing}
              errorAt={errorAt}
              sets={sets}
              languages={languages}
              markers={markerOptions}
              orders={orders}
              labels={labels}
              onChange={(key, value) => setPrintingField(index, key, value)}
              onRemove={undefined}
            />
          ))
        )}
      </section>

      <LivePreview state={state} activePrinting={activePrinting} />

      {submitted && errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Fix the following before submitting:</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {errors.map((e) => (
                <li key={e.path}>
                  <span className="font-mono">{e.path}</span>: {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start">
          <ExternalLinkIcon className="size-4" />
          Submit your contribution
        </Button>
        <p className="text-muted-foreground text-sm">
          A new tab opens on GitHub with everything filled in. If you don&apos;t already have a fork
          of the data repo, GitHub will offer to create one in a single click. Then click
          &ldquo;Propose changes&rdquo; at the bottom of the editor, and &ldquo;Create pull
          request&rdquo; on the next page to confirm. If you have notes about this contribution
          (e.g. where you spotted the card, art variant unconfirmed), add them to the pull request
          description on GitHub. I&apos;ll review your submission before it goes live.
        </p>
      </div>
    </form>
  );
}

const MAX_DOMAINS = 2;

function computeDomainDisabled(
  selected: string[],
  options: readonly string[],
): ReadonlySet<string> {
  const disabled = new Set<string>();
  const hasColorless = selected.includes(WellKnown.domain.COLORLESS);
  const atMax = selected.length >= MAX_DOMAINS;
  for (const slug of options) {
    if (selected.includes(slug)) {
      continue;
    }
    if (hasColorless) {
      disabled.add(slug);
      continue;
    }
    if (slug === WellKnown.domain.COLORLESS) {
      if (selected.length > 0) {
        disabled.add(slug);
      }
    } else if (atMax) {
      disabled.add(slug);
    }
  }
  return disabled;
}

const LAYOUT_LEGEND: { label: string; region: string }[] = [
  { label: "Card name", region: "Centre band" },
  { label: "Type, super types", region: "Italic stripe above the name" },
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

function printingTabLabel(index: number, printing: ContributeFormPrinting): string {
  const base = `Printing ${(index + 1).toString()}`;
  return printing.publicCode ? `${base} · ${printing.publicCode}` : base;
}

function CardLayoutHelp({
  state,
  activePrinting,
}: {
  state: ContributeFormState;
  activePrinting: number;
}) {
  const printing = state.printings[activePrinting] ?? state.printings[0];
  const cardName = state.card.name || "Your card name";
  const cardDomains = state.card.domains.length > 0 ? state.card.domains : ["fury"];
  const cardType = state.card.type ?? WellKnown.cardType.UNIT;
  const cardSuperTypes = state.card.superTypes.length > 0 ? state.card.superTypes : ["champion"];
  const cardTags = state.card.tags.length > 0 ? state.card.tags : ["Tag"];
  const cardEnergy = state.card.energy ?? 3;
  const cardMight = state.card.might ?? 4;
  const cardPower = state.card.power ?? 2;
  const cardRulesText = printing?.printedRulesText || "Rules text appears in this section.";
  const cardEffectText = printing?.printedEffectText || "Effect text gets a highlighted band.";
  const cardMightBonus = state.card.mightBonus ?? 1;
  const printingFlavor = printing?.flavorText || "Optional flavor line, in italics.";
  const printingRarity = printing?.rarity || WellKnown.rarity.COMMON;
  const printingPublicCode = printing?.publicCode || "ABC-001/002";
  const printingArtist = printing?.artist || "Artist name";
  return (
    <Collapsible className="border-border rounded-md border p-3">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 text-sm select-none">
        <span>Where do these fields appear on a card?</span>
        <ChevronDownIcon className="size-4 shrink-0 transition-transform data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div className="w-56 justify-self-center sm:justify-self-start">
          <CardPlaceholderImage
            name={cardName}
            domain={cardDomains}
            energy={cardEnergy}
            might={cardMight}
            power={cardPower}
            type={cardType}
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
            Empty fields show placeholder values so you can see the layout; as you fill in the form,
            your real values replace them. Pure-metadata fields (slug, set, language, finish, art
            variant, markers, image URL, etc.) don&apos;t appear on the card.
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

function LivePreview({
  state,
  activePrinting,
}: {
  state: ContributeFormState;
  activePrinting: number;
}) {
  const printing = state.printings[activePrinting] ?? state.printings[0];
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Preview</h2>
      <div className="w-full max-w-sm">
        <CardPlaceholderImage
          name={state.card.name}
          domain={state.card.domains}
          energy={state.card.energy}
          might={state.card.might}
          power={state.card.power}
          type={state.card.type ?? undefined}
          superTypes={state.card.superTypes}
          tags={state.card.tags}
          rulesText={printing?.printedRulesText ?? null}
          effectText={printing?.printedEffectText ?? null}
          mightBonus={state.card.mightBonus}
          flavorText={printing?.flavorText ?? null}
          rarity={printing?.rarity ?? undefined}
          publicCode={printing?.publicCode ?? undefined}
          artist={printing?.artist ?? undefined}
        />
      </div>
    </section>
  );
}

function IntroBlock({ lockedSlug }: { lockedSlug?: string }) {
  if (lockedSlug) {
    return (
      <p className="text-muted-foreground">
        You&apos;re suggesting a correction for <span className="font-mono">{lockedSlug}</span>.
        Edit any field that needs fixing and submit. I&apos;ll review the diff before it&apos;s
        merged.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      Fill in whatever details you have and leave the rest blank; even partial entries are useful,
      and I&apos;ll tidy up the rest. Submitting opens a prefilled pull request on the{" "}
      <a
        href="https://github.com/openriftapp/openrift-data"
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2"
      >
        openrift-data
      </a>{" "}
      repo (GitHub will fork it for you in one click), and I&apos;ll review it before it goes live.
    </p>
  );
}

interface PrintingCardProps {
  index: number;
  printing: ContributeFormPrinting;
  errorAt: (path: string) => string | undefined;
  sets: SetListResponse["sets"];
  languages: { code: string; name: string }[];
  markers: { slug: string; label: string }[];
  orders: ReturnType<typeof useEnumOrders>["orders"];
  labels: ReturnType<typeof useEnumOrders>["labels"];
  onChange: <K extends keyof ContributeFormPrinting>(
    key: K,
    value: ContributeFormPrinting[K],
  ) => void;
  onRemove?: () => void;
}

function PrintingCard({
  index,
  printing,
  errorAt,
  sets,
  languages,
  markers,
  orders,
  labels,
  onChange,
  onRemove,
}: PrintingCardProps) {
  const handleSetChange = (slug: string | null) => {
    onChange("setId", slug);
    const matched = sets.find((s) => s.slug === slug);
    onChange("setName", matched?.name ?? null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printing {index + 1}</CardTitle>
        {onRemove && (
          <CardAction>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow
            label="Code"
            required
            error={errorAt(`printings[${index.toString()}].publicCode`)}
          >
            <Input
              value={printing.publicCode ?? ""}
              onChange={(e) => onChange("publicCode", e.target.value || null)}
              placeholder="OGN-066/298"
            />
          </FieldRow>
          <FieldRow label="Set">
            <SingleSelect
              value={printing.setId}
              onChange={handleSetChange}
              options={sets.map((s) => s.slug)}
              labels={Object.fromEntries(sets.map((s) => [s.slug, s.name]))}
              placeholder="Pick a set"
            />
          </FieldRow>
          <FieldRow label="Language" error={errorAt(`printings[${index.toString()}].language`)}>
            <SingleSelect
              value={printing.language}
              onChange={(v) => onChange("language", v)}
              options={languages.map((language) => language.code)}
              labels={Object.fromEntries(
                languages.map((language) => [language.code, language.name]),
              )}
              placeholder="Pick a language"
            />
          </FieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow label="Rarity">
            <SingleSelect
              value={printing.rarity}
              onChange={(v) => onChange("rarity", v)}
              options={orders.rarities}
              labels={labels.rarities}
              placeholder="Pick a rarity"
            />
          </FieldRow>
          <FieldRow label="Finish">
            <SingleSelect
              value={printing.finish}
              onChange={(v) => onChange("finish", v)}
              options={orders.finishes}
              labels={labels.finishes}
              placeholder="Pick a finish"
            />
          </FieldRow>
          <FieldRow label="Art variant">
            <SingleSelect
              value={printing.artVariant}
              onChange={(v) => onChange("artVariant", v)}
              options={orders.artVariants}
              labels={labels.artVariants}
              placeholder="Pick a variant"
            />
          </FieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow label="Artist">
            <Input
              value={printing.artist ?? ""}
              onChange={(e) => onChange("artist", e.target.value || null)}
            />
          </FieldRow>
          <FieldRow
            label="Year"
            hint="Year stamped on the physical card. Differs from the set release year for reprints."
            error={errorAt(`printings[${index.toString()}].printedYear`)}
          >
            <NumberInput
              value={printing.printedYear}
              onChange={(v) => onChange("printedYear", v)}
            />
          </FieldRow>
          <FieldRow label="Signed">
            <div className="flex h-9 items-center gap-2">
              <Switch
                checked={printing.isSigned}
                onCheckedChange={(checked) => onChange("isSigned", checked)}
              />
              <span className="text-muted-foreground text-sm">
                {printing.isSigned ? "Yes" : "No"}
              </span>
            </div>
          </FieldRow>
        </div>
        <FieldRow label="Promo markers">
          <MultiSelectDropdown
            value={printing.markerSlugs}
            onChange={(v) => onChange("markerSlugs", v)}
            options={markers}
            placeholder="None"
          />
        </FieldRow>

        <FieldRow
          label="Name"
          hint="Defaults to the card name. Edit only if the printed name differs (e.g. for non-English versions)."
        >
          <Input
            value={printing.printedName}
            onChange={(e) => onChange("printedName", e.target.value)}
          />
        </FieldRow>
        <CardTextInput
          label="Rules text"
          value={printing.printedRulesText ?? ""}
          onChange={(v) => onChange("printedRulesText", v || null)}
        />
        <CardTextInput
          label="Effect text"
          value={printing.printedEffectText ?? ""}
          onChange={(v) => onChange("printedEffectText", v || null)}
        />
        <FieldRow label="Flavor text">
          <Textarea
            rows={2}
            value={printing.flavorText ?? ""}
            onChange={(e) => onChange("flavorText", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow
          label="Image URL"
          hint="A link to the official image is preferred. The link should point directly to the image file itself. You can leave this empty and attach photos or scans to the GitHub PR later if you have any."
          error={errorAt(`printings[${index.toString()}].imageUrl`)}
        >
          <Input
            type="url"
            value={printing.imageUrl ?? ""}
            onChange={(e) => onChange("imageUrl", e.target.value || null)}
            placeholder="https://..."
          />
        </FieldRow>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {children}
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <Input
      type="number"
      min={0}
      value={value === null ? "" : value.toString()}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "") {
          onChange(null);
          return;
        }
        const parsed = Number.parseInt(next, 10);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className="[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function SingleSelect({
  value,
  onChange,
  options,
  labels,
  placeholder,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  options: readonly string[];
  labels: Record<string, string>;
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next: string | null) => onChange(next || null)}
      items={options.map((slug) => ({ value: slug, label: labels[slug] ?? slug }))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder}>
          {(current: string) => labels[current] ?? current}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((slug) => (
          <SelectItem key={slug} value={slug}>
            {labels[slug] ?? slug}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: { slug: string; label: string }[];
  placeholder: string;
}) {
  const items = options.map((opt) => opt.slug);
  const labelFor = (slug: string) => options.find((opt) => opt.slug === slug)?.label ?? slug;
  const summary = value.length === 0 ? placeholder : value.map((slug) => labelFor(slug)).join(", ");
  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={value}
      onValueChange={onChange}
      itemToStringLabel={labelFor}
    >
      <ComboboxTrigger
        render={<Button variant="outline" />}
        className={cn(
          "w-full justify-between font-normal",
          value.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate">{summary}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput placeholder="Search markers…" showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(slug: string) => (
            <ComboboxItem key={slug} value={slug}>
              {labelFor(slug)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  };
  return (
    <Combobox<string, true>
      multiple
      items={value}
      value={value}
      onValueChange={onChange}
      inputValue={draft}
      onInputValueChange={setDraft}
    >
      <ComboboxChips>
        {value.map((chip) => (
          <ComboboxChip key={chip}>{chip}</ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={value.length === 0 ? placeholder : ""}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </ComboboxChips>
    </Combobox>
  );
}
