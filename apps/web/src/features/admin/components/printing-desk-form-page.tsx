import type {
  DeskPrintingRow,
  DeskReleasePrecision,
} from "@openrift/shared/contracts/admin/printing-desk";
import { enumLabel } from "@openrift/shared/enum-label";
import { formatPrintingCode, isTbaCode } from "@openrift/shared/printing-code";
import { formatReleasePeriod, normalizeToPeriodStart } from "@openrift/shared/set-release";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PageTopBarBack } from "@/components/layout/page-top-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { PrintingDeskChannelPicker } from "@/features/admin/components/printing-desk-channel-picker";
import { PrintingDeskMarkerPicker } from "@/features/admin/components/printing-desk-marker-picker";
import { DeskSegmented, DeskThumb } from "@/features/admin/components/printing-desk-shared";
import {
  useCreateDeskPrinting,
  useDeskCardPrintings,
  useDeskPrinting,
  useUpdateDeskPrinting,
} from "@/features/admin/hooks/use-printing-desk";
import {
  basePrintingForLanguage,
  defaultCardLanguage,
} from "@/features/admin/lib/printing-desk-base";
import { useDistinctArtists } from "@/features/cards/hooks/use-distinct-artists";
import { useSets } from "@/features/cards/hooks/use-sets";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders, useLanguageLabels, useLanguageList } from "@/hooks/use-enums";
import { errorText } from "@/lib/error-text";

/** Quarter is a valid stored precision but not one the desk offers. */
const PRECISION_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
] as const satisfies readonly { value: DeskReleasePrecision; label: string }[];

export function PrintingDeskCreatePage({ cardSlug }: { cardSlug: string }) {
  const { data } = useDeskCardPrintings(cardSlug);
  const navigate = useNavigate();
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const preferred = useEffectiveLanguageOrder();
  const seedLanguage = defaultCardLanguage(
    data.printings.map((printing) => printing.language),
    preferred,
  );

  const form = usePrintingDeskFormState({
    cardId: data.card.id,
    cardPrintings: data.printings,
    seedLanguage,
    existing: null,
    onSaved: (printingId) =>
      void navigate({ to: "/admin/printing-desk/printings/$printingId", params: { printingId } }),
  });

  const base = form.base;

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title={`New printing · ${data.card.name}`}
        back={<PageTopBarBack to="/admin/printing-desk/cards/$cardSlug" params={{ cardSlug }} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{data.card.name}</CardTitle>
            <CardDescription>
              Only what differs from the base printing. Everything else is copied.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrintingDeskFields
              form={form}
              submitLabel="Create printing"
              onCancel={() =>
                void navigate({
                  to: "/admin/printing-desk/cards/$cardSlug",
                  params: { cardSlug },
                })
              }
            />
          </CardContent>
        </Card>

        <BaseAside
          base={base}
          rarityLabel={base ? enumLabel(labels.rarities, base.rarity) : ""}
          typeLabel={base ? enumLabel(labels.cardTypes, base.cardType) : ""}
          languageLabel={languageLabels[form.language] ?? form.language}
        />
      </div>
    </div>
  );
}

/** Loads the form's own data, so the printing page pays for it only once the viewer edits. */
export function PrintingDeskEditFields({
  printingId,
  onSaved,
  onCancel,
}: {
  printingId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { data } = useDeskPrinting(printingId);
  const card = useDeskCardPrintings(data.printing.cardSlug);

  const form = usePrintingDeskFormState({
    cardId: data.printing.cardId,
    cardPrintings: card.data.printings.filter((printing) => printing.printingId !== printingId),
    seedLanguage: data.printing.language,
    existing: data.printing,
    onSaved,
  });

  return <PrintingDeskFields form={form} submitLabel="Save changes" onCancel={onCancel} />;
}

function usePrintingDeskFormState({
  cardId,
  cardPrintings,
  seedLanguage,
  existing,
  onSaved,
}: {
  cardId: string;
  cardPrintings: readonly DeskPrintingRow[];
  seedLanguage: string;
  existing: DeskPrintingRow | null;
  onSaved: (printingId: string) => void;
}) {
  const createPrinting = useCreateDeskPrinting();
  const updatePrinting = useUpdateDeskPrinting();

  const [language, setLanguage] = useState(existing?.language ?? seedLanguage);
  const base = basePrintingForLanguage(cardPrintings, language);

  const { orders } = useEnumOrders();
  const [channelSlugs, setChannelSlugs] = useState<string[]>(
    existing ? [...existing.distributionChannelSlugs] : [],
  );
  const [markerSlugs, setMarkerSlugs] = useState<string[]>(
    existing ? [...existing.markerSlugs] : [],
  );
  const [codeTba, setCodeTba] = useState(existing ? isTbaCode(existing.publicCode) : false);
  const [shortCode, setShortCode] = useState(
    existing && !isTbaCode(existing.publicCode) ? existing.shortCode : "",
  );
  const [setId, setSetId] = useState(existing?.setId ?? base?.setId ?? "");
  const [finish, setFinish] = useState(
    existing?.finish ?? base?.finish ?? orders.finishes[0] ?? "",
  );
  const [size, setSize] = useState(existing?.size ?? base?.size ?? orders.cardSizes[0] ?? "");
  const [artistOverride, setArtistOverride] = useState<string | null>(existing?.artist ?? null);
  const [showArtist, setShowArtist] = useState(existing !== null);
  const [announcedAt, setAnnouncedAt] = useState<string | null>(existing?.announcedAt ?? null);
  const [releasedAt, setReleasedAt] = useState<string | null>(existing?.releasedAt ?? null);
  const [precision, setPrecision] = useState<DeskReleasePrecision>(
    existing?.releasePrecision === "quarter" ? "month" : (existing?.releasePrecision ?? "day"),
  );
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const artist = artistOverride ?? base?.artist ?? "";
  const isPending = createPrinting.isPending || updatePrinting.isPending;
  const canSubmit =
    setId.length > 0 &&
    finish.length > 0 &&
    language.length > 0 &&
    size.length > 0 &&
    (codeTba || shortCode.trim().length > 0) &&
    !isPending;

  const release = releasedAt
    ? normalizeToPeriodStart({ releasedAt, precision })
    : { releasedAt: null, precision: null };

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setFormError(null);
    const fields = {
      setId,
      distributionChannelSlugs: channelSlugs,
      markerSlugs,
      codeTba,
      shortCode: codeTba ? undefined : shortCode.trim(),
      finish,
      language,
      size,
      artist: artist.length > 0 ? artist : undefined,
      announcedAt,
      releasedAt: release.releasedAt,
      releasePrecision: release.precision,
      comment: comment.trim().length > 0 ? comment.trim() : null,
    };

    const basePrintingId = base?.printingId;
    try {
      if (existing) {
        await updatePrinting.mutateAsync({ printingId: existing.printingId, ...fields });
        onSaved(existing.printingId);
        return;
      }
      const created = await createPrinting.mutateAsync({ ...fields, cardId, basePrintingId });
      onSaved(created.printingId);
    } catch (error) {
      setFormError(errorText(error, "Could not save the printing."));
    }
  }

  return {
    base,
    artist,
    setArtistOverride,
    showArtist,
    setShowArtist,
    channelSlugs,
    setChannelSlugs,
    markerSlugs,
    setMarkerSlugs,
    codeTba,
    setCodeTba,
    shortCode,
    setShortCode,
    setId,
    setSetId,
    finish,
    setFinish,
    language,
    setLanguage,
    size,
    setSize,
    announcedAt,
    setAnnouncedAt,
    releasedAt,
    setReleasedAt,
    precision,
    setPrecision,
    comment,
    setComment,
    release,
    error: formError,
    canSubmit,
    submit,
  };
}

type PrintingDeskFormState = ReturnType<typeof usePrintingDeskFormState>;

function PrintingDeskFields({
  form,
  submitLabel,
  onCancel,
}: {
  form: PrintingDeskFormState;
  submitLabel: string;
  onCancel: () => void;
}) {
  const { orders, labels } = useEnumOrders();
  const languages = useLanguageList();
  const { data: setData } = useSets();
  const { data: artistData } = useDistinctArtists();

  return (
    <>
      <div className="@container/desk-form">
        <FieldGroup className="@3xl/desk-form:grid @3xl/desk-form:grid-cols-2 @3xl/desk-form:gap-x-6">
          <div className="@3xl/desk-form:col-span-2">
            <PrintingDeskChannelPicker
              value={form.channelSlugs}
              onChange={(next) => form.setChannelSlugs(next)}
            />
          </div>
          <div className="@3xl/desk-form:col-span-2">
            <PrintingDeskMarkerPicker
              value={form.markerSlugs}
              onChange={(next) => form.setMarkerSlugs(next)}
            />
          </div>

          <Field>
            <FieldLabel htmlFor="desk-code">Card code</FieldLabel>
            <Input
              id="desk-code"
              value={form.shortCode}
              disabled={form.codeTba}
              onChange={(event) => form.setShortCode(event.target.value)}
              placeholder="OGN-101p"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="desk-code-tba"
                checked={form.codeTba}
                onCheckedChange={(checked) => form.setCodeTba(checked === true)}
              />
              <FieldLabel htmlFor="desk-code-tba">Code not announced yet</FieldLabel>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="desk-set">Set</FieldLabel>
            <Select
              items={setData.sets.map((set) => ({ value: set.id, label: set.name }))}
              value={form.setId}
              onValueChange={(value) => {
                if (value !== null) {
                  form.setSetId(value);
                }
              }}
            >
              <SelectTrigger id="desk-set" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {setData.sets.map((set) => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2 @3xl/desk-form:col-span-2">
            <Field>
              <FieldLabel htmlFor="desk-language">Language</FieldLabel>
              <Select
                items={languages.map((entry) => ({ value: entry.code, label: entry.name }))}
                value={form.language}
                onValueChange={(value) => {
                  if (value !== null) {
                    form.setLanguage(value);
                  }
                }}
              >
                <SelectTrigger id="desk-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="desk-size">Size</FieldLabel>
              <Select
                items={orders.cardSizes.map((slug) => ({
                  value: slug,
                  label: labels.cardSizes[slug],
                }))}
                value={form.size}
                onValueChange={(value) => {
                  if (value !== null) {
                    form.setSize(value);
                  }
                }}
              >
                <SelectTrigger id="desk-size" className="w-full">
                  <SelectValue />
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

          <Field>
            <FieldLabel>Finish</FieldLabel>
            <DeskSegmented
              ariaLabel="Finish"
              value={form.finish}
              onChange={(next) => form.setFinish(next)}
              options={orders.finishes.map((slug) => ({
                value: slug,
                label: enumLabel(labels.finishes, slug),
              }))}
            />
            <FieldDescription>
              Metal is the Prize Wall finish, Metal (Deluxe) the Best-Of finish.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="desk-artist">Artist</FieldLabel>
            {form.showArtist ? (
              <>
                <Input
                  id="desk-artist"
                  list="desk-artist-options"
                  value={form.artist}
                  onChange={(event) => form.setArtistOverride(event.target.value)}
                />
                <datalist id="desk-artist-options">
                  {artistData.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </datalist>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  {form.artist}
                  <Button variant="ghost" size="xs" onClick={() => form.setShowArtist(true)}>
                    Change
                  </Button>
                </div>
                <FieldDescription>
                  Copied from the base printing. Change it if the promo has different art.
                </FieldDescription>
              </>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="desk-announced-at">Announced on</FieldLabel>
            <DatePicker
              className="w-44"
              value={form.announcedAt}
              onChange={(next) => form.setAnnouncedAt(next)}
              onClear={() => form.setAnnouncedAt(null)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="desk-released-at">Available from</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                className="w-44"
                value={form.releasedAt}
                onChange={(next) => form.setReleasedAt(next)}
                onClear={() => form.setReleasedAt(null)}
              />
              <DeskSegmented
                ariaLabel="How exact the date is"
                value={form.precision}
                onChange={(next) => form.setPrecision(next)}
                options={PRECISION_OPTIONS}
              />
            </div>
            {form.release.releasedAt !== null && form.release.precision !== "day" && (
              <FieldDescription>{formatReleasePeriod(form.release)}</FieldDescription>
            )}
          </Field>

          <Field className="@3xl/desk-form:col-span-2">
            <FieldLabel htmlFor="desk-note">Note</FieldLabel>
            <Textarea
              id="desk-note"
              value={form.comment}
              onChange={(event) => form.setComment(event.target.value)}
              placeholder="Handed out at the door, one per player."
            />
          </Field>
        </FieldGroup>
      </div>

      {form.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button disabled={!form.canSubmit} onClick={() => void form.submit()}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-muted-foreground text-sm">Goes live as soon as you save.</span>
      </div>
    </>
  );
}

function BaseAside({
  base,
  rarityLabel,
  typeLabel,
  languageLabel,
}: {
  base: DeskPrintingRow | undefined;
  rarityLabel: string;
  typeLabel: string;
  languageLabel: string;
}) {
  if (!base) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to copy from</CardTitle>
          <CardDescription>
            This card has no printing in {languageLabel} yet, so fill in every field yourself.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prefilled from {formatPrintingCode(base.publicCode)}</CardTitle>
        <CardDescription>
          Copied from the base printing. Rarity, type and text stay with the admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DeskThumb row={base} className="w-24" />

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Rarity</dt>
            <dd>{rarityLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{typeLabel}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
