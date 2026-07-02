import type { SetListResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRightIcon, ExternalLinkIcon, LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { CardTextInput } from "@/components/contribute/card-text-input";
import {
  ChipInput,
  FieldRow,
  MultiSelectDropdown,
  NumberInput,
  SingleSelect,
} from "@/components/contribute/form-fields";
import { Heading } from "@/components/heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
import { computeDomainDisabled } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { SOCIAL_LINKS } from "@/lib/social-links";
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

      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <FieldRow label="Supertypes">
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
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Heading level={2}>Printings</Heading>
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
          A new tab opens on GitHub with everything filled in. First time? GitHub will offer to
          create your fork in one click. Click &ldquo;Propose changes&rdquo; at the bottom of the
          editor, then &ldquo;Create pull request&rdquo; on the next page. Add any notes (where you
          spotted the card, art variant unconfirmed, etc.) to the pull request description.
        </p>
      </div>
    </form>
  );
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
  const cardSuperTypes =
    state.card.superTypes.length > 0 ? state.card.superTypes : [WellKnown.superType.CHAMPION];
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
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
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
      Fill in what you have and leave the rest blank. Partial entries are still useful. Submitting
      opens a prefilled pull request on the{" "}
      <a
        href={SOCIAL_LINKS.githubDataRepo}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2"
      >
        openrift-data
      </a>{" "}
      repo. I review every submission before it goes live.
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
            <Switch
              checked={printing.isSigned}
              onCheckedChange={(checked) => onChange("isSigned", checked)}
              className="mt-1"
            />
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
          hint="Direct link to the official image (URL ending in .png, .jpg, etc.). Or leave blank and attach a photo or scan to the pull request after submitting."
          error={errorAt(`printings[${index.toString()}].imageUrl`)}
        >
          <InputGroup>
            <InputGroupAddon>
              <LinkIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="url"
              value={printing.imageUrl ?? ""}
              onChange={(e) => onChange("imageUrl", e.target.value || null)}
              placeholder="https://..."
            />
          </InputGroup>
        </FieldRow>
      </CardContent>
    </Card>
  );
}
