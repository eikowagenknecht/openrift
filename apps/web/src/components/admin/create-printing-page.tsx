import type { AdminCardDetailResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useLanguages } from "@/hooks/use-languages";
import { useMarkers } from "@/hooks/use-markers";
import { useSets } from "@/hooks/use-sets";
import { buildChannelTree, leafChannels } from "@/lib/distribution-channel-tree";
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

  const sets = setsData.sets;
  const markers = markersData.markers;
  const languages = languagesData.languages;
  const channelOptions = leafChannels(buildChannelTree(channelsData.distributionChannels)).map(
    (node) => ({ value: node.channel.slug, label: node.breadcrumb }),
  );

  const firstSet = sets[0]?.slug ?? "";
  const source = duplicateFrom
    ? (cardDetail?.printings.find((p) => p.id === duplicateFrom) ?? null)
    : null;

  const [shortCode, setShortCode] = useState(source?.shortCode ?? "");
  const [setId, setSetId] = useState<string>(source?.setSlug ?? firstSet);
  const [rarity, setRarity] = useState<string>(
    source?.rarity ?? orders.rarities[0] ?? WellKnown.rarity.COMMON,
  );
  const [artVariant, setArtVariant] = useState<string>(
    source?.artVariant ?? orders.artVariants[0] ?? "normal",
  );
  const [finish, setFinish] = useState<string>(source?.finish ?? orders.finishes[0] ?? "normal");
  const [isSigned, setIsSigned] = useState(source?.isSigned ?? false);
  const [selectedMarkerSlugs, setSelectedMarkerSlugs] = useState<string[]>(
    source?.markerSlugs ?? [],
  );
  const [selectedChannelSlugs, setSelectedChannelSlugs] = useState<string[]>(
    source?.distributionChannelSlugs ?? [],
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
    if (selectedChannelSlugs.length > 0) {
      printingFields.distributionChannelSlugs = selectedChannelSlugs;
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
          <div className="flex items-end space-y-1 sm:col-start-3">
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
            <Label>Markers</Label>
            <MultiSelectDropdown
              options={markers.map((m) => ({ value: m.slug, label: m.label }))}
              selected={selectedMarkerSlugs}
              onChange={setSelectedMarkerSlugs}
              emptyOptionsText="No markers defined"
              placeholder="— select markers —"
            />
          </div>
          <div className="space-y-1">
            <Label>Distribution channels</Label>
            <MultiSelectDropdown
              options={channelOptions}
              selected={selectedChannelSlugs}
              onChange={setSelectedChannelSlugs}
              emptyOptionsText="No channels defined"
              placeholder="— select channels —"
            />
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

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  emptyOptionsText,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyOptionsText: string;
}) {
  if (options.length === 0) {
    return <span className="text-muted-foreground">{emptyOptionsText}</span>;
  }
  const selectedSet = new Set(selected);
  const triggerLabel = options
    .filter((opt) => selectedSet.has(opt.value))
    .map((opt) => opt.label)
    .join(", ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="border-input bg-background flex h-9 w-full items-center gap-1 rounded-md border px-3 text-left text-sm"
          />
        }
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected.length === 0 && "text-muted-foreground",
          )}
          title={triggerLabel || undefined}
        >
          {selected.length > 0 ? triggerLabel : placeholder}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(({ value, label }) => {
          const isSelected = selectedSet.has(value);
          return (
            <DropdownMenuCheckboxItem
              key={value}
              checked={isSelected}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                const next = isSelected
                  ? selected.filter((v) => v !== value)
                  : options
                      .filter((o) => selectedSet.has(o.value) || o.value === value)
                      .map((o) => o.value);
                onChange(next);
              }}
            >
              {label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
