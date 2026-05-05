import type { SetListResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { CardTextInput } from "@/components/contribute/card-text-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
      return { ...s, slug: nextSlug, card: { ...s.card, [key]: value } };
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
    setState((s) => ({ ...s, printings: [...s.printings, emptyPrinting()] }));
  };
  const removePrinting = (index: number) => {
    setState((s) => ({ ...s, printings: s.printings.filter((_, i) => i !== index) }));
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

      <CardLayoutHelp state={state} />

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
            value={state.card.domains}
            onChange={(v) => setCardField("domains", v)}
            options={orders.domains}
            labels={labels.domains}
            disabledOptions={domainDisabled}
            icons={domainIcons}
          />
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
              value={state.card.superTypes}
              onChange={(v) => setCardField("superTypes", v)}
              options={orders.superTypes}
              labels={labels.superTypes}
            />
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
        {state.printings.map((printing, index) => (
          <PrintingCard
            key={index}
            index={index}
            printing={printing}
            cardName={state.card.name}
            errorAt={errorAt}
            sets={sets}
            languages={languages}
            markers={markerOptions}
            orders={orders}
            labels={labels}
            onChange={(key, value) => setPrintingField(index, key, value)}
            onRemove={state.printings.length > 1 ? () => removePrinting(index) : undefined}
          />
        ))}
      </section>

      <LivePreview state={state} />

      {submitted && errors.length > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
          <p className="mb-1 font-semibold text-red-700 dark:text-red-400">
            Fix the following before submitting:
          </p>
          <ul className="list-inside list-disc text-red-700 dark:text-red-400">
            {errors.map((e) => (
              <li key={e.path}>
                <span className="font-mono">{e.path}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start">
          <ExternalLinkIcon className="size-4" />
          Submit your contribution
        </Button>
        <p className="text-muted-foreground text-sm">
          A new tab opens with everything filled in. GitHub forks the repo for you, so all you need
          to do is click &ldquo;Propose changes&rdquo;. If you have notes about this contribution
          (e.g. where you spotted the card, art variant unconfirmed), add them to the pull request
          description on GitHub.
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

function CardLayoutHelp({ state }: { state: ContributeFormState }) {
  const firstPrinting = state.printings[0];
  const cardName = state.card.name || "Your card name";
  const cardDomains = state.card.domains.length > 0 ? state.card.domains : ["fury"];
  const cardType = state.card.type ?? WellKnown.cardType.UNIT;
  const cardSuperTypes = state.card.superTypes.length > 0 ? state.card.superTypes : ["champion"];
  const cardTags = state.card.tags.length > 0 ? state.card.tags : ["Tag"];
  const cardEnergy = state.card.energy ?? 3;
  const cardMight = state.card.might ?? 4;
  const cardPower = state.card.power ?? 2;
  const cardRulesText = firstPrinting?.printedRulesText || "Rules text appears in this section.";
  const cardEffectText = firstPrinting?.printedEffectText || "Effect text gets a highlighted band.";
  const cardMightBonus = state.card.mightBonus ?? 1;
  const printingFlavor = firstPrinting?.flavorText || "Optional flavor line, in italics.";
  const printingRarity = firstPrinting?.rarity || WellKnown.rarity.COMMON;
  const printingPublicCode = firstPrinting?.publicCode || "ABC-001/002";
  const printingArtist = firstPrinting?.artist || "Artist name";
  return (
    <details className="border-border rounded-md border p-3">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm select-none">
        Where do these fields appear on a card?
      </summary>
      <div className="mt-4 grid gap-6 sm:grid-cols-[14rem_1fr] sm:items-start">
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
      </div>
    </details>
  );
}

function LivePreview({ state }: { state: ContributeFormState }) {
  const firstPrinting = state.printings[0];
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
          rulesText={firstPrinting?.printedRulesText ?? null}
          effectText={firstPrinting?.printedEffectText ?? null}
          mightBonus={state.card.mightBonus}
          flavorText={firstPrinting?.flavorText ?? null}
          rarity={firstPrinting?.rarity ?? undefined}
          publicCode={firstPrinting?.publicCode ?? undefined}
          artist={firstPrinting?.artist ?? undefined}
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
  cardName: string;
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
  cardName,
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
    <div className="border-border rounded-md border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">Printing {index + 1}</h3>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2Icon className="size-4" />
            Remove
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow label="Code">
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
          hint={
            printing.printedName === null
              ? "Defaulting to the card name. Edit only if the printed name differs (e.g. for non-English versions)."
              : undefined
          }
        >
          <Input
            value={printing.printedName ?? cardName}
            onChange={(e) => onChange("printedName", e.target.value || null)}
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
          hint="A link to the official image is preferred. The link should point directly to the image file itself."
          error={errorAt(`printings[${index.toString()}].imageUrl`)}
        >
          <Input
            type="url"
            value={printing.imageUrl ?? ""}
            onChange={(e) => onChange("imageUrl", e.target.value || null)}
            placeholder="https://..."
          />
        </FieldRow>
      </div>
    </div>
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
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-muted-foreground">{hint}</p>}
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
    </div>
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

function ToggleGroup({
  value,
  onChange,
  options,
  labels,
  disabledOptions,
  icons,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: readonly string[];
  labels: Record<string, string>;
  disabledOptions?: ReadonlySet<string>;
  icons?: Record<string, string | undefined>;
}) {
  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((slug) => {
        const selected = value.includes(slug);
        const disabled = !selected && (disabledOptions?.has(slug) ?? false);
        const iconSrc = icons?.[slug];
        return (
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            disabled={disabled}
            className={cn(
              "border-input inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors",
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent",
              disabled && "hover:bg-background cursor-not-allowed opacity-40",
            )}
          >
            {iconSrc && <img src={iconSrc} alt="" className="size-4 shrink-0" />}
            {labels[slug] ?? slug}
          </button>
        );
      })}
    </div>
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
  const labelFor = (slug: string) => options.find((opt) => opt.slug === slug)?.label ?? slug;
  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug]);
  };
  const summary = value.length === 0 ? placeholder : value.map((slug) => labelFor(slug)).join(", ");
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-input bg-background hover:bg-accent inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left transition-colors",
          value.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-72 overflow-auto p-1">
        {options.map((opt) => {
          const selected = value.includes(opt.slug);
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => toggle(opt.slug)}
              className={cn(
                "hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
              )}
            >
              <CheckIcon
                className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
              />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
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
    <div className="border-input flex flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5">
      {value.map((chip) => (
        <Badge key={chip} variant="secondary" className="gap-1">
          {chip}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== chip))}
            className="hover:text-foreground"
            aria-label={`Remove ${chip}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ""}
        className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
