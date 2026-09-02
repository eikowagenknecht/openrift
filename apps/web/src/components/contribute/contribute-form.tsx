import type { SetListResponse, VariantLabelPrinting } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CopyIcon,
  InfoIcon,
  LinkIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { CardTextInput } from "@/components/contribute/card-text-input";
import { ExistingCardPicker } from "@/components/contribute/existing-card-picker";
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
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSubmitCard } from "@/hooks/use-card-submission";
import {
  useChannelRegistry,
  useEnumOrders,
  useLanguageList,
  useMarkerList,
} from "@/hooks/use-enums";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type {
  ContributeFormPrinting,
  ContributeFormState,
  ValidationError,
} from "@/lib/contribute-json";
import {
  buildSubmissionPayload,
  emptyFormState,
  emptyPrinting,
  nameToSlug,
  validateContribution,
} from "@/lib/contribute-json";
import { isBlankPrinting, toVariantLabelPrinting } from "@/lib/contribute-printing-labels";
import { buildChannelTree, leafChannels } from "@/lib/distribution-channel-tree";
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
  // What the form last opened *or was prefilled* with. `handleSubmit` diffs
  // against it, so picking an existing card makes that card's printings the
  // baseline and only the ones the contributor then edits reach the queue.
  const [baseline, setBaseline] = useState<ContributeFormState>(initial);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);
  // Index of the printing whose fields are expanded; null when all are closed.
  // The live preview and the layout help follow it, falling back to the first.
  const [activePrinting, setActivePrinting] = useState<number | null>(0);
  const [note, setNote] = useState("");

  const submit = useSubmitCard();

  const { orders, labels } = useEnumOrders();
  const languages = useLanguageList();
  const markerOptions = useMarkerList();
  // Leaf channels only (printings link to leaves), each shown with its full
  // breadcrumb path via the shared channel-tree helper.
  const channelOptions = leafChannels(buildChannelTree(useChannelRegistry())).map((node) => ({
    slug: node.channel.slug,
    label: node.breadcrumb,
  }));
  const { data: setListData } = useSuspenseQuery(publicSetListQueryOptions);

  // Once a submission has succeeded, the next edit means the contributor is
  // working on a fresh entry — clear the success banner and re-enable submit.
  const clearSuccess = () => {
    if (submit.isSuccess) {
      submit.reset();
    }
  };

  const setCardField = <K extends keyof ContributeFormState["card"]>(
    key: K,
    value: ContributeFormState["card"][K],
  ) => {
    clearSuccess();
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
    clearSuccess();
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
  const duplicatePrinting = (index: number) => {
    setState((s) => {
      const source = s.printings[index];
      if (!source) {
        return s;
      }
      const nextPrintings = [
        ...s.printings.slice(0, index + 1),
        { ...source },
        ...s.printings.slice(index + 1),
      ];
      setActivePrinting(index + 1);
      return { ...s, printings: nextPrintings };
    });
  };
  const removePrinting = (index: number) => {
    setState((s) => {
      const nextPrintings = s.printings.filter((_, i) => i !== index);
      setActivePrinting((prev) =>
        prev === null ? null : Math.min(prev, nextPrintings.length - 1),
      );
      return { ...s, printings: nextPrintings };
    });
  };

  const prefillFromExisting = (prefilled: ContributeFormState) => {
    clearSuccess();
    setState(prefilled);
    setBaseline(prefilled);
    setErrors([]);
    setSubmitted(false);
    // Everything closed: the point of prefilling is to show at a glance which
    // printings the card already has, so the contributor can copy the closest.
    setActivePrinting(null);
  };

  const startAnother = () => {
    submit.reset();
    const empty = emptyFormState();
    setState(empty);
    setBaseline(empty);
    setNote("");
    setErrors([]);
    setSubmitted(false);
    setActivePrinting(0);
  };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const result = validateContribution(state);
    setErrors(result.errors);
    if (!result.ok) {
      // A closed printing renders none of its field errors, so open the first
      // one that failed. Without this the form looks like it ignored the click.
      const failed = [...printingErrorIndexes(result.errors)].toSorted((a, b) => a - b);
      const first = failed[0];
      if (first !== undefined) {
        setActivePrinting(first);
      }
      return;
    }
    // Printings the contributor never touched are left out of the payload so
    // the admin column shows only real proposals.
    submit.mutate(buildSubmissionPayload(state, note, baseline));
  };

  const errorAt = (path: string): string | undefined =>
    submitted ? errors.find((e) => e.path === path)?.message : undefined;

  const sets = setListData.sets;
  // Each row names itself the way the card detail panel does: against its
  // siblings, so shared attributes drop out and only the differences show.
  const markerLabels = Object.fromEntries(markerOptions.map((m) => [m.slug, m.label]));
  const printingVariants = state.printings.map((p) => toVariantLabelPrinting(p, markerLabels));
  const printingsWithErrors = submitted ? printingErrorIndexes(errors) : new Set<number>();
  const domainDisabled = computeDomainDisabled(state.card.domains, orders.domains);
  const domainIcons = Object.fromEntries(
    orders.domains.map((slug) => [slug, getFilterIconPath("domains", slug)]),
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <IntroBlock lockedSlug={lockedSlug} />

          <CardLayoutHelp state={state} activePrinting={activePrinting} />

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
                  spacing={0}
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
                            className={cn(
                              "size-4 shrink-0",
                              isColorless && "brightness-0 dark:invert",
                            )}
                          />
                        )}
                        {labels.domains[slug]}
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
                  value={state.card.types}
                  onValueChange={(next) => setCardField("types", next)}
                >
                  {orders.cardTypes.map((slug) => (
                    <ToggleGroupItem key={slug} value={slug}>
                      {labels.cardTypes[slug]}
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
                  <NumberInput
                    value={state.card.might}
                    onChange={(v) => setCardField("might", v)}
                  />
                </FieldRow>
                <FieldRow label="Energy">
                  <NumberInput
                    value={state.card.energy}
                    onChange={(v) => setCardField("energy", v)}
                  />
                </FieldRow>
                <FieldRow label="Power">
                  <NumberInput
                    value={state.card.power}
                    onChange={(v) => setCardField("power", v)}
                  />
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
                  placeholder="Poro"
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
            <div className="flex flex-col gap-3">
              {state.printings.map((printing, index) => (
                <PrintingCard
                  key={index}
                  index={index}
                  printing={printing}
                  variant={printingVariants[index]}
                  siblings={printingVariants}
                  open={index === activePrinting}
                  hasError={printingsWithErrors.has(index)}
                  onToggle={() => setActivePrinting(index === activePrinting ? null : index)}
                  errorAt={errorAt}
                  sets={sets}
                  languages={languages}
                  markers={markerOptions}
                  channels={channelOptions}
                  orders={orders}
                  labels={labels}
                  onChange={(key, value) => setPrintingField(index, key, value)}
                  onCopy={() => duplicatePrinting(index)}
                  onRemove={state.printings.length > 1 ? () => removePrinting(index) : undefined}
                />
              ))}
            </div>
          </section>
        </div>
        <div className="xl:sticky xl:top-20 xl:w-80 xl:shrink-0">
          <LivePreview state={state} activePrinting={activePrinting} />
        </div>
      </div>

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

      {submit.isSuccess && (
        <Alert>
          <CheckCircle2Icon className="size-4" />
          <AlertTitle>Thanks! Your submission is in the review queue.</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>I check every submission before it goes live.</span>
            {!lockedSlug && (
              <Button type="button" variant="outline" size="sm" onClick={startAnother}>
                <PlusIcon className="size-4" />
                Start another card
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <FieldRow label="Note">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => {
              clearSuccess();
              setNote(e.target.value);
            }}
            placeholder="Spotted in the OGN set list, art variant unconfirmed."
          />
        </FieldRow>

        {submit.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t submit</AlertTitle>
            <AlertDescription>{submitErrorMessage(submit.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="self-start"
            disabled={submit.isPending || submit.isSuccess}
          >
            <SendIcon className="size-4" />
            {submit.isPending ? "Submitting…" : "Submit your contribution"}
          </Button>
          <p className="text-muted-foreground text-sm">
            Your submission goes straight into the review queue. I check every one before it goes
            live.
          </p>
        </div>
      </div>
    </form>
  );
}

/**
 * Extracts a contributor-facing message from a failed submission. The endpoint's
 * daily-cap and validation errors already carry a readable message; anything
 * else falls back to a generic line.
 * @param error The mutation error.
 * @returns A message to show the contributor.
 */
function submitErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message || "Something went wrong. Please try again in a moment.";
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

/** Matches the `printings[3].publicCode` form-state paths `validateContribution` returns. */
const PRINTING_ERROR_PATH = /^printings\[(?<index>\d+)\]\./u;

/**
 * Which printings failed validation, so a closed one can still show that
 * something inside it needs attention.
 * @param errors Validation errors in form-state path form.
 * @returns The set of printing indexes carrying at least one error.
 */
function printingErrorIndexes(errors: ValidationError[]): Set<number> {
  const indexes = new Set<number>();
  for (const error of errors) {
    const index = PRINTING_ERROR_PATH.exec(error.path)?.groups?.index;
    if (index !== undefined) {
      indexes.add(Number(index));
    }
  }
  return indexes;
}

function CardLayoutHelp({
  state,
  activePrinting,
}: {
  state: ContributeFormState;
  activePrinting: number | null;
}) {
  const printing = state.printings[activePrinting ?? 0] ?? state.printings[0];
  const cardName = state.card.name || "Your card name";
  const cardDomains = state.card.domains.length > 0 ? state.card.domains : ["fury"];
  const cardTypes = state.card.types.length > 0 ? state.card.types : [WellKnown.cardType.UNIT];
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

function LivePreview({
  state,
  activePrinting,
}: {
  state: ContributeFormState;
  activePrinting: number | null;
}) {
  const printing = state.printings[activePrinting ?? 0] ?? state.printings[0];
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
            types={state.card.types}
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
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Change only what&apos;s wrong</AlertTitle>
        <AlertDescription>Edit the fields that are off and leave the rest alone.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>It&apos;s okay to not fill in everything</AlertTitle>
      <AlertDescription>
        <p>
          Only the name and code are mandatory. For a new version of a known card, select it first
          and copy a printing. Need help? Visit the{" "}
          <a href={SOCIAL_LINKS.discordInvite} target="_blank" rel="noreferrer">
            Discord
          </a>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}

interface PrintingCardProps {
  index: number;
  printing: ContributeFormPrinting;
  /** This printing in the shared labeller's shape; undefined only if the arrays desync. */
  variant?: VariantLabelPrinting;
  /** Every printing on the form, the set the label disambiguates against. */
  siblings: VariantLabelPrinting[];
  /** Only the open printing renders its fields; the rest stay one summary row. */
  open: boolean;
  /** Set once the contributor has submitted and this printing failed validation. */
  hasError: boolean;
  onToggle: () => void;
  errorAt: (path: string) => string | undefined;
  sets: SetListResponse["sets"];
  languages: { code: string; name: string }[];
  markers: { slug: string; label: string }[];
  channels: { slug: string; label: string }[];
  orders: ReturnType<typeof useEnumOrders>["orders"];
  labels: ReturnType<typeof useEnumOrders>["labels"];
  onChange: <K extends keyof ContributeFormPrinting>(
    key: K,
    value: ContributeFormPrinting[K],
  ) => void;
  onCopy: () => void;
  onRemove?: () => void;
}

function PrintingCard({
  index,
  printing,
  variant,
  siblings,
  open,
  hasError,
  onToggle,
  errorAt,
  sets,
  languages,
  markers,
  channels,
  orders,
  labels,
  onChange,
  onCopy,
  onRemove,
}: PrintingCardProps) {
  const handleSetChange = (slug: string | null) => {
    onChange("setId", slug);
    const matched = sets.find((s) => s.slug === slug);
    onChange("setName", matched?.name ?? null);
  };

  return (
    <Card className={cn(!open && "py-3")}>
      <CardHeader>
        <CardTitle className="min-w-0">
          <ExpandToggle expanded={open} onClick={onToggle} className="w-full min-w-0">
            {variant && (
              <PrintingVariantLabel
                printing={variant}
                siblings={siblings}
                fallback={isBlankPrinting(printing) ? "New printing" : "Standard"}
                className="min-w-0"
              />
            )}
            {printing.publicCode && (
              <span className="text-muted-foreground truncate font-normal">
                {printing.publicCode}
              </span>
            )}
            {hasError && (
              <>
                <TriangleAlertIcon className="text-destructive size-4 shrink-0" aria-hidden />
                <span className="sr-only">has a problem</span>
              </>
            )}
          </ExpandToggle>
        </CardTitle>
        <CardAction className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
            <CopyIcon className="size-4" />
            Copy
          </Button>
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          )}
        </CardAction>
      </CardHeader>
      {/* A closed printing drops its fields rather than hiding them: prefilling
          from an existing card can bring in 40, and mounting a dozen selects
          each is pointless. `hasError` is what keeps a problem in a closed
          printing visible, since its own field errors render nowhere. */}
      {open && (
        <CardContent className="flex flex-col gap-4">
          <FieldRow
            label="Name"
            hint="Defaults to the card name. Edit only if the printed name differs (e.g. for non-English versions)."
          >
            <Input
              value={printing.printedName}
              onChange={(e) => onChange("printedName", e.target.value)}
            />
          </FieldRow>
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
            <FieldRow label="Size">
              <SingleSelect
                value={printing.size}
                onChange={(v) => onChange("size", v ?? WellKnown.cardSize.STANDARD)}
                options={orders.cardSizes}
                labels={labels.cardSizes}
                placeholder="Standard"
              />
            </FieldRow>
            <FieldRow
              label="Year"
              hint="Year stamped on the physical card (bottom right)."
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
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldRow label="Artist">
              <Input
                value={printing.artist ?? ""}
                onChange={(e) => onChange("artist", e.target.value || null)}
              />
            </FieldRow>
            <FieldRow
              label="Markers (e.g. Promo)"
              hint="Visual add-ons stamped on the card: a promo stamp, a Skirmish circle, a launch-exclusive mark, and the like."
            >
              <MultiSelectDropdown
                value={printing.markerSlugs}
                onChange={(v) => onChange("markerSlugs", v)}
                options={markers}
                placeholder="None"
              />
            </FieldRow>
            <FieldRow
              label="Distribution channels"
              hint="Where this printing was handed out, e.g. a specific event or product."
            >
              <MultiSelectDropdown
                value={printing.distributionChannelSlugs}
                onChange={(v) => onChange("distributionChannelSlugs", v)}
                options={channels}
                placeholder="None"
              />
            </FieldRow>
          </div>
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
          <CardTextInput
            label="Flavor text"
            variant="flavor"
            value={printing.flavorText ?? ""}
            onChange={(v) => onChange("flavorText", v || null)}
          />
          <FieldRow
            label="Image URL"
            hint="Direct link to the best image you can find. A clear scan works too."
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
      )}
    </Card>
  );
}
