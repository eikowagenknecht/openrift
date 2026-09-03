import type { AdminCardDetailResponse } from "@openrift/shared";
import { WellKnown, fixTypography } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { CardTextInput } from "@/components/contribute/card-text-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreatePrinting } from "@/hooks/use-admin-card-mutations";
import type { CreatePrintingBody } from "@/hooks/use-admin-card-mutations";
import { useAdminCardDetail } from "@/hooks/use-admin-card-queries";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { useLanguages } from "@/hooks/use-languages";
import { useMarkers } from "@/hooks/use-markers";
import { useSets } from "@/hooks/use-sets";
import { buildChannelTree, leafChannels } from "@/lib/distribution-channel-tree";
import { printingFormDefaults } from "@/lib/printing-form-defaults";
import { cn } from "@/lib/utils";

export function CreatePrintingPage({
  cardSlug,
  duplicateFrom,
}: {
  cardSlug: string;
  duplicateFrom?: string;
}) {
  const navigate = useNavigate();
  const createPrinting = useCreatePrinting();
  const { data: cardDetail, isLoading } = useAdminCardDetail(cardSlug) as {
    data: AdminCardDetailResponse | undefined;
    isLoading: boolean;
  };
  const { data: setsData } = useSets();
  const { data: markersData } = useMarkers();
  const { data: languagesData } = useLanguages();
  const { data: channelsData } = useDistributionChannels();
  const { orders, labels } = useEnumOrders();
  const keywordStyles = useKeywordStyles();
  const costKeywords = Object.entries(keywordStyles)
    .filter(([, entry]) => entry.costKeyword)
    .map(([name]) => name);
  const reformatRules = (value: string) => fixTypography(value, { costKeywords });
  const reformatFlavor = (value: string) =>
    fixTypography(value, { italicParens: false, keywordGlyphs: false });

  const sets = setsData.sets;
  const markers = markersData.markers;
  const languages = languagesData.languages;
  const channelOptions = leafChannels(buildChannelTree(channelsData.distributionChannels))
    .map((node) => ({ value: node.channel.slug, label: node.breadcrumb }))
    .toSorted((a, b) => a.label.localeCompare(b.label));

  const source = duplicateFrom
    ? (cardDetail?.printings.find((p) => p.id === duplicateFrom) ?? null)
    : null;
  const defaults = printingFormDefaults(source, {
    setSlug: sets[0]?.slug ?? "",
    rarity: orders.rarities[0] ?? WellKnown.rarity.COMMON,
    artVariant: orders.artVariants[0] ?? "normal",
    finish: orders.finishes[0] ?? "normal",
    size: orders.cardSizes[0] ?? WellKnown.cardSize.STANDARD,
    language: languages[0]?.code ?? WellKnown.language.EN,
  });

  const [shortCode, setShortCode] = useState(defaults.shortCode);
  const [setId, setSetId] = useState<string>(defaults.setId);
  const [rarity, setRarity] = useState<string>(defaults.rarity);
  const [artVariant, setArtVariant] = useState<string>(defaults.artVariant);
  const [finish, setFinish] = useState<string>(defaults.finish);
  const [size, setSize] = useState<string>(defaults.size);
  const [isSigned, setIsSigned] = useState(defaults.isSigned);
  const [isOvernumbered, setIsOvernumbered] = useState(defaults.isOvernumbered);
  const [selectedMarkerSlugs, setSelectedMarkerSlugs] = useState<string[]>(defaults.markerSlugs);
  const [selectedChannelSlugs, setSelectedChannelSlugs] = useState<string[]>(
    defaults.distributionChannelSlugs,
  );
  const [artist, setArtist] = useState(defaults.artist);
  const [publicCode, setPublicCode] = useState(defaults.publicCode);
  const [language, setLanguage] = useState<string>(defaults.language);
  const [printedName, setPrintedName] = useState(defaults.printedName);
  const [printedYear, setPrintedYear] = useState<string>(defaults.printedYear);
  const [printedRulesText, setPrintedRulesText] = useState(defaults.printedRulesText);
  const [printedEffectText, setPrintedEffectText] = useState(defaults.printedEffectText);
  const [flavorText, setFlavorText] = useState(defaults.flavorText);
  const [imageUrl, setImageUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const card = cardDetail?.card;
  const cardId = card?.id;

  const canSubmit =
    cardId !== undefined &&
    shortCode.trim().length > 0 &&
    setId.length > 0 &&
    artist.trim().length > 0 &&
    publicCode.trim().length > 0 &&
    !createPrinting.isPending;

  function handleSubmit() {
    if (!canSubmit || !cardId) {
      return;
    }
    setErrorMsg(null);

    const printingFields: Record<string, unknown> = {
      shortCode: shortCode.trim(),
      setId,
      rarity,
      artVariant,
      isSigned,
      isOvernumbered,
      finish,
      size,
      artist: artist.trim(),
      publicCode: publicCode.trim(),
      language,
    };
    if (selectedMarkerSlugs.length > 0) {
      printingFields.markerSlugs = selectedMarkerSlugs;
    }
    if (selectedChannelSlugs.length > 0) {
      printingFields.distributionChannelSlugs = selectedChannelSlugs;
    }
    if (printedName.trim()) {
      printingFields.printedName = printedName.trim();
    }
    if (printedYear.trim()) {
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(printedYear.trim(), 10);
      if (Number.isFinite(parsed)) {
        printingFields.printedYear = parsed;
      }
    }
    if (printedRulesText.trim()) {
      printingFields.printedRulesText = printedRulesText.trim();
    }
    if (printedEffectText.trim()) {
      printingFields.printedEffectText = printedEffectText.trim();
    }
    if (flavorText.trim()) {
      printingFields.flavorText = flavorText.trim();
    }
    if (imageUrl.trim()) {
      printingFields.imageUrl = imageUrl.trim();
    }

    createPrinting.mutate(
      { cardId, cardSlug, printingFields: printingFields as CreatePrintingBody },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug } });
        },
        onError: (error) => {
          setErrorMsg(error instanceof Error ? error.message : "Failed to create printing");
        },
      },
    );
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!card) {
    return <p className="text-muted-foreground">Card not found.</p>;
  }

  return (
    <div className="max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>{source ? "Duplicate printing" : "Create new printing"}</CardTitle>
          {source && (
            <CardDescription>
              Duplicating <span className="font-medium">{source.expectedPrintingId}</span> for{" "}
              <span className="font-medium">{card.name}</span>. Update fields as needed.
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="create-printing-shortcode">Short code *</FieldLabel>
                <Input
                  id="create-printing-shortcode"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                  placeholder="e.g. OGN-202"
                  className="font-mono"
                />
              </Field>
              <Field>
                <FieldLabel>Set *</FieldLabel>
                <Select value={setId} onValueChange={(value) => value && setSetId(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) => sets.find((s) => s.slug === value)?.name ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((s) => (
                      <SelectItem key={s.slug} value={s.slug}>
                        {s.name} ({s.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Rarity</FieldLabel>
                <Select value={rarity} onValueChange={(value) => value && setRarity(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(value: string) => labels.rarities[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {orders.rarities.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {labels.rarities[slug]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Art variant</FieldLabel>
                <Select value={artVariant} onValueChange={(value) => value && setArtVariant(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(value: string) => labels.artVariants[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {orders.artVariants.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {labels.artVariants[slug]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Finish</FieldLabel>
                <Select value={finish} onValueChange={(value) => value && setFinish(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(value: string) => labels.finishes[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {orders.finishes.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {labels.finishes[slug]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Size</FieldLabel>
                <Select value={size} onValueChange={(value) => value && setSize(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(value: string) => labels.cardSizes[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {orders.cardSizes.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {labels.cardSizes[slug]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Select value={language} onValueChange={(value) => value && setLanguage(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) => languages.find((l) => l.code === value)?.name ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal" className="sm:col-start-3 sm:self-end">
                <Checkbox
                  id="create-printing-signed"
                  checked={isSigned}
                  onCheckedChange={setIsSigned}
                />
                <FieldLabel htmlFor="create-printing-signed">Signed</FieldLabel>
              </Field>
              <Field orientation="horizontal" className="sm:col-start-3 sm:self-end">
                <Checkbox
                  id="create-printing-overnumbered"
                  checked={isOvernumbered}
                  onCheckedChange={setIsOvernumbered}
                />
                <FieldLabel htmlFor="create-printing-overnumbered">Overnumbered</FieldLabel>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Markers</FieldLabel>
                <MultiSelectDropdown
                  options={markers
                    .map((m) => ({ value: m.slug, label: m.label }))
                    .toSorted((a, b) => a.label.localeCompare(b.label))}
                  selected={selectedMarkerSlugs}
                  onChange={setSelectedMarkerSlugs}
                  emptyOptionsText="No markers defined"
                  placeholder="— select markers —"
                  searchPlaceholder="Search markers…"
                />
              </Field>
              <Field>
                <FieldLabel>Distribution channels</FieldLabel>
                <MultiSelectDropdown
                  options={channelOptions}
                  selected={selectedChannelSlugs}
                  onChange={setSelectedChannelSlugs}
                  emptyOptionsText="No channels defined"
                  placeholder="— select channels —"
                  searchPlaceholder="Search channels…"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="create-printing-artist">Artist *</FieldLabel>
                <Input
                  id="create-printing-artist"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="e.g. Jane Doe"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-printing-public-code">Public code *</FieldLabel>
                <Input
                  id="create-printing-public-code"
                  value={publicCode}
                  onChange={(e) => setPublicCode(e.target.value)}
                  placeholder="e.g. 202"
                  className="font-mono"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="create-printing-printed-name">Printed name</FieldLabel>
                <Input
                  id="create-printing-printed-name"
                  value={printedName}
                  onChange={(e) => setPrintedName(e.target.value)}
                  placeholder="Leave blank to use card name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-printing-printed-year">Printed year</FieldLabel>
                <Input
                  id="create-printing-printed-year"
                  value={printedYear}
                  onChange={(e) => setPrintedYear(e.target.value)}
                  placeholder="e.g. 2025"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
              <Field className="lg:sticky lg:top-20 lg:self-start">
                <FieldLabel htmlFor="create-printing-image">Reference image</FieldLabel>
                {imageUrl.trim() ? (
                  <img
                    src={imageUrl.trim()}
                    alt="Card reference"
                    className="max-h-[70vh] w-full rounded-md object-contain"
                  />
                ) : (
                  <div className="text-muted-foreground border-input flex h-48 items-center justify-center rounded-md border border-dashed px-3 text-center">
                    Paste an image URL to preview the card while you type.
                  </div>
                )}
                <Input
                  id="create-printing-image"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Image URL — https://…"
                />
              </Field>
              <div className="space-y-4">
                <CardTextInput
                  label="Printed rules text"
                  value={printedRulesText}
                  onChange={setPrintedRulesText}
                  rows={3}
                  reformat={reformatRules}
                />
                <CardTextInput
                  label="Printed effect text"
                  value={printedEffectText}
                  onChange={setPrintedEffectText}
                  rows={3}
                  reformat={reformatRules}
                />
                <CardTextInput
                  label="Flavor text"
                  variant="flavor"
                  value={flavorText}
                  onChange={setFlavorText}
                  rows={2}
                  reformat={reformatFlavor}
                />
              </div>
            </div>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button disabled={!canSubmit} onClick={handleSubmit}>
                <PlusIcon className="mr-1 size-4" />
                Create printing
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug } })
                }
              >
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyOptionsText,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyOptionsText: string;
}) {
  if (options.length === 0) {
    return <span className="text-muted-foreground text-sm">{emptyOptionsText}</span>;
  }
  const items = options.map((opt) => opt.value);
  const labelFor = (value: string) => options.find((opt) => opt.value === value)?.label ?? value;
  const orderSelected = (next: string[]) => {
    const nextSet = new Set(next);
    return options.filter((opt) => nextSet.has(opt.value)).map((opt) => opt.value);
  };
  const ordered = orderSelected(selected);
  const summary = ordered.length === 0 ? placeholder : ordered.map((v) => labelFor(v)).join(", ");
  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={ordered}
      onValueChange={(next) => onChange(orderSelected(next))}
      itemToStringLabel={labelFor}
    >
      <ComboboxTrigger
        render={<Button variant="outline" />}
        className={cn(
          "w-full justify-between font-normal",
          ordered.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate">{summary}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(value: string) => (
            <ComboboxItem key={value} value={value}>
              {labelFor(value)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
