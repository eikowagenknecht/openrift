import type { SetListResponse } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEnumOrders, useLanguageList } from "@/hooks/use-enums";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type {
  ContributeFormPrinting,
  ContributeFormState,
  ValidationError,
} from "@/lib/contribute-json";
import {
  buildContributionFilename,
  buildContributionJson,
  buildGithubNewFileUrl,
  emptyPrinting,
  formatDateStamp,
  nameToSlug,
  validateContribution,
} from "@/lib/contribute-json";
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
  const { data: setListData } = useSuspenseQuery(publicSetListQueryOptions);

  const setSlug = (slug: string) => {
    setState((s) => ({ ...s, slug }));
  };
  const setCardField = <K extends keyof ContributeFormState["card"]>(
    key: K,
    value: ContributeFormState["card"][K],
  ) => {
    setState((s) => {
      const nextSlug =
        !lockedSlug && key === "name" && !s.slug ? nameToSlug(value as string) : s.slug;
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
    const url = buildGithubNewFileUrl(filename, json);
    globalThis.open(url, "_blank", "noopener,noreferrer");
  };

  const errorAt = (path: string): string | undefined =>
    submitted ? errors.find((e) => e.path === path)?.message : undefined;

  const sets = setListData.sets;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <IntroBlock lockedSlug={lockedSlug} />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Card</h2>
        <FieldRow label="Name" required error={errorAt("card.name")}>
          <Input
            value={state.card.name}
            onChange={(e) => setCardField("name", e.target.value)}
            placeholder="Ahri, Alluring"
          />
        </FieldRow>
        <FieldRow
          label="Slug"
          required
          error={errorAt("slug")}
          hint="Lowercase, hyphenated. Used as the file name."
        >
          <Input
            value={state.slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={Boolean(lockedSlug)}
            placeholder="ahri-alluring"
          />
        </FieldRow>
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
        <FieldRow label="Domains">
          <ToggleGroup
            value={state.card.domains}
            onChange={(v) => setCardField("domains", v)}
            options={orders.domains}
            labels={labels.domains}
          />
        </FieldRow>
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
        <FieldRow label="Rules text">
          <Textarea
            rows={2}
            value={state.card.rulesText ?? ""}
            onChange={(e) => setCardField("rulesText", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow label="Effect text">
          <Textarea
            rows={2}
            value={state.card.effectText ?? ""}
            onChange={(e) => setCardField("effectText", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow label="Tags" hint="Press Enter or comma to add.">
          <ChipInput
            value={state.card.tags}
            onChange={(v) => setCardField("tags", v)}
            placeholder="Ahri"
          />
        </FieldRow>
        <FieldRow label="Short code" hint='e.g. "OGN-066".'>
          <Input
            value={state.card.shortCode ?? ""}
            onChange={(e) => setCardField("shortCode", e.target.value || null)}
            placeholder="OGN-066"
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
            errorAt={errorAt}
            sets={sets}
            languages={languages}
            orders={orders}
            labels={labels}
            onChange={(key, value) => setPrintingField(index, key, value)}
            onRemove={state.printings.length > 1 ? () => removePrinting(index) : undefined}
          />
        ))}
      </section>

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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">
          <ExternalLinkIcon className="size-4" />
          Open prefilled GitHub PR
        </Button>
        <p className="text-muted-foreground text-sm">
          A new tab opens with the file ready to commit. GitHub will fork the repo for you.
        </p>
      </div>
    </form>
  );
}

function IntroBlock({ lockedSlug }: { lockedSlug?: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-md border p-4 text-sm">
      {lockedSlug ? (
        <p>
          You&apos;re suggesting a correction for <span className="font-mono">{lockedSlug}</span>.
          Adjust any fields you need to fix and submit. A maintainer will review the diff before
          it&apos;s merged into the openrift-data repo.
        </p>
      ) : (
        <p>
          Add a card that&apos;s missing from OpenRift. Fill in what you have, leave the rest blank.
          The form opens a prefilled pull request against the{" "}
          <a
            href="https://github.com/openriftapp/openrift-data"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2"
          >
            openrift-data
          </a>{" "}
          repo.
        </p>
      )}
    </div>
  );
}

interface PrintingCardProps {
  index: number;
  printing: ContributeFormPrinting;
  errorAt: (path: string) => string | undefined;
  sets: SetListResponse["sets"];
  languages: { code: string; name: string }[];
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow
            label="Short code"
            required
            error={errorAt(`printings[${index.toString()}].shortCode`)}
          >
            <Input
              value={printing.shortCode}
              onChange={(e) => onChange("shortCode", e.target.value)}
              placeholder="OGN-066"
            />
          </FieldRow>
          <FieldRow label="Public code" hint='Printed code, e.g. "OGN-066/298".'>
            <Input
              value={printing.publicCode ?? ""}
              onChange={(e) => onChange("publicCode", e.target.value || null)}
              placeholder="OGN-066/298"
            />
          </FieldRow>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
              options={languages.map((l) => l.code.toLowerCase())}
              labels={Object.fromEntries(languages.map((l) => [l.code.toLowerCase(), l.name]))}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Artist">
            <Input
              value={printing.artist ?? ""}
              onChange={(e) => onChange("artist", e.target.value || null)}
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
        <FieldRow label="Markers" hint="Free-form slugs. Press Enter or comma to add.">
          <ChipInput
            value={printing.markerSlugs}
            onChange={(v) => onChange("markerSlugs", v)}
            placeholder="prerelease"
          />
        </FieldRow>
        <FieldRow label="Distribution channels" hint="Free-form slugs.">
          <ChipInput
            value={printing.distributionChannelSlugs}
            onChange={(v) => onChange("distributionChannelSlugs", v)}
            placeholder="lcs-promo"
          />
        </FieldRow>
        <FieldRow
          label="Image URL"
          hint="Stable HTTPS link. Don't hotlink the official Riftbound site."
          error={errorAt(`printings[${index.toString()}].imageUrl`)}
        >
          <Input
            type="url"
            value={printing.imageUrl ?? ""}
            onChange={(e) => onChange("imageUrl", e.target.value || null)}
            placeholder="https://..."
          />
        </FieldRow>
        <FieldRow label="Printed name" hint="Only if it differs from the card name.">
          <Input
            value={printing.printedName ?? ""}
            onChange={(e) => onChange("printedName", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow label="Printed rules text">
          <Textarea
            rows={2}
            value={printing.printedRulesText ?? ""}
            onChange={(e) => onChange("printedRulesText", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow label="Printed effect text">
          <Textarea
            rows={2}
            value={printing.printedEffectText ?? ""}
            onChange={(e) => onChange("printedEffectText", e.target.value || null)}
          />
        </FieldRow>
        <FieldRow label="Flavor text">
          <Textarea
            rows={2}
            value={printing.flavorText ?? ""}
            onChange={(e) => onChange("flavorText", e.target.value || null)}
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
      onValueChange={(next: string) => onChange(next || null)}
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
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((v) => v !== slug) : [...value, slug]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((slug) => {
        const selected = value.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            className={cn(
              "border-input rounded-md border px-2.5 py-1 transition-colors",
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent",
            )}
          >
            {labels[slug] ?? slug}
          </button>
        );
      })}
    </div>
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
