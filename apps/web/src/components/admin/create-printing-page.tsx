import type { AdminCardDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { useCreatePrinting } from "@/hooks/use-admin-card-mutations";
import { useAdminCardDetail } from "@/hooks/use-admin-card-queries";
import { useEnumOrders } from "@/hooks/use-enums";
import { useLanguages } from "@/hooks/use-languages";
import { useMarkers } from "@/hooks/use-markers";
import { useSets } from "@/hooks/use-sets";

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
  const { orders, labels } = useEnumOrders();

  const sets = setsData.sets;
  const markers = markersData.markers;
  const languages = languagesData.languages;

  const firstSet = sets[0]?.slug ?? "";
  const source = duplicateFrom
    ? (cardDetail?.printings.find((p) => p.id === duplicateFrom) ?? null)
    : null;

  const [shortCode, setShortCode] = useState(source?.shortCode ?? "");
  const [setId, setSetId] = useState<string>(source?.setSlug ?? firstSet);
  const [rarity, setRarity] = useState<string>(source?.rarity ?? orders.rarities[0] ?? "Common");
  const [artVariant, setArtVariant] = useState<string>(
    source?.artVariant ?? orders.artVariants[0] ?? "normal",
  );
  const [finish, setFinish] = useState<string>(source?.finish ?? orders.finishes[0] ?? "normal");
  const [isSigned, setIsSigned] = useState(source?.isSigned ?? false);
  const [selectedMarkerSlugs, setSelectedMarkerSlugs] = useState<string[]>(
    source?.markerSlugs ?? [],
  );
  const [artist, setArtist] = useState(source?.artist ?? "");
  const [publicCode, setPublicCode] = useState(source?.publicCode ?? "");
  const [language, setLanguage] = useState<string>(source?.language ?? languages[0]?.code ?? "EN");
  const [printedName, setPrintedName] = useState(source?.printedName ?? "");
  const [printedYear, setPrintedYear] = useState<string>(
    source?.printedYear !== undefined && source.printedYear !== null
      ? String(source.printedYear)
      : "",
  );
  const [printedRulesText, setPrintedRulesText] = useState(source?.printedRulesText ?? "");
  const [printedEffectText, setPrintedEffectText] = useState(source?.printedEffectText ?? "");
  const [flavorText, setFlavorText] = useState(source?.flavorText ?? "");
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
      finish,
      artist: artist.trim(),
      publicCode: publicCode.trim(),
      language,
    };
    if (selectedMarkerSlugs.length > 0) {
      printingFields.markerSlugs = selectedMarkerSlugs;
    }
    if (printedName.trim()) {
      printingFields.printedName = printedName.trim();
    }
    if (printedYear.trim()) {
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
      { cardId, cardSlug, printingFields },
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {source ? "Duplicate printing" : "Create new printing"}
        </h2>
        <p className="text-muted-foreground">
          {source ? (
            <>
              Duplicating <span className="font-medium">{source.expectedPrintingId}</span> for{" "}
              <span className="font-medium">{card.name}</span>. Update fields as needed.
            </>
          ) : (
            <>
              Manual entry for <span className="font-medium">{card.name}</span>. No source
              candidates will be linked.
            </>
          )}
        </p>
      </div>

      <section className="space-y-4 rounded-md border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="create-printing-shortcode">Short code *</Label>
            <Input
              id="create-printing-shortcode"
              value={shortCode}
              onChange={(e) => setShortCode(e.target.value)}
              placeholder="e.g. OGN-202"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>Set *</Label>
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
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Rarity</Label>
            <Select value={rarity} onValueChange={(value) => value && setRarity(value)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => labels.rarities[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orders.rarities.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {labels.rarities[slug] ?? slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Art variant</Label>
            <Select value={artVariant} onValueChange={(value) => value && setArtVariant(value)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => labels.artVariants[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orders.artVariants.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {labels.artVariants[slug] ?? slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Finish</Label>
            <Select value={finish} onValueChange={(value) => value && setFinish(value)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(value: string) => labels.finishes[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orders.finishes.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {labels.finishes[slug] ?? slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Language</Label>
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
          </div>
          <div className="space-y-1">
            <Label>Markers</Label>
            <div className="flex flex-wrap gap-2">
              {markers.length === 0 ? (
                <span className="text-muted-foreground">No markers defined</span>
              ) : (
                markers.map((m) => {
                  const selected = selectedMarkerSlugs.includes(m.slug);
                  return (
                    <label key={m.slug} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          setSelectedMarkerSlugs((prev) =>
                            e.target.checked
                              ? [...prev, m.slug].sort()
                              : prev.filter((s) => s !== m.slug),
                          );
                        }}
                      />
                      <span>{m.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex items-end space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSigned}
                onChange={(e) => setIsSigned(e.target.checked)}
              />
              <span>Signed</span>
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="create-printing-artist">Artist *</Label>
            <Input
              id="create-printing-artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-printing-public-code">Public code *</Label>
            <Input
              id="create-printing-public-code"
              value={publicCode}
              onChange={(e) => setPublicCode(e.target.value)}
              placeholder="e.g. 202"
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="create-printing-printed-name">Printed name</Label>
            <Input
              id="create-printing-printed-name"
              value={printedName}
              onChange={(e) => setPrintedName(e.target.value)}
              placeholder="Leave blank to use card name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-printing-printed-year">Printed year</Label>
            <Input
              id="create-printing-printed-year"
              value={printedYear}
              onChange={(e) => setPrintedYear(e.target.value)}
              placeholder="e.g. 2025"
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="create-printing-rules">Printed rules text</Label>
            <Textarea
              id="create-printing-rules"
              value={printedRulesText}
              onChange={(e) => setPrintedRulesText(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-printing-effect">Printed effect text</Label>
            <Textarea
              id="create-printing-effect"
              value={printedEffectText}
              onChange={(e) => setPrintedEffectText(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-printing-flavor">Flavor text</Label>
          <Textarea
            id="create-printing-flavor"
            value={flavorText}
            onChange={(e) => setFlavorText(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-printing-image">Image URL</Label>
          <Input
            id="create-printing-image"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        {errorMsg && <p className="text-destructive">{errorMsg}</p>}

        <div className="flex gap-2">
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            <PlusIcon className="mr-1 size-4" />
            Create printing
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate({ to: "/admin/cards/$cardSlug", params: { cardSlug } })}
          >
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
