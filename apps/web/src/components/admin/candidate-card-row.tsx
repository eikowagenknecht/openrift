import type { CandidateCard, CardType, Domain, Printing, Rarity } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EditField } from "./edit-field";
import { Field } from "./field";
import { MultiSelect } from "./multi-select";
import { SectionHeading } from "./section-heading";

// oxlint-disable-next-line no-empty-function -- noop handler for read-only CardThumbnail
const NOOP = () => {};

const ALL_TYPES: CardType[] = ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"];
const ALL_SUPER_TYPES = ["Basic", "Champion", "Signature", "Token"];
const ALL_DOMAINS: Domain[] = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"];

function domainIconPath(d: string): string {
  const lower = d.toLowerCase();
  return `/images/domains/${lower}.${d === "Colorless" ? "svg" : "webp"}`;
}

function typeIconPath(t: string): string {
  return `/images/types/${t.toLowerCase()}.svg`;
}

interface EditState {
  name: string;
  type: string;
  superTypes: Set<string>;
  domains: Set<string>;
  energy: string;
  might: string;
  power: string;
  mightBonus: string;
  keywords: string;
  tags: string;
  rulesText: string;
  effectText: string;
}

const VALID_RARITIES = new Set(["Common", "Uncommon", "Rare", "Epic", "Showcase"]);

function toRarity(r: string): Rarity {
  return VALID_RARITIES.has(r) ? (r as Rarity) : "Common";
}

function candidatePrintingToPrinting(candidate: CandidateCard, printingIndex: number): Printing {
  const p = candidate.printings[printingIndex];
  return {
    id: p.id,
    sourceId: p.sourceId,
    set: p.setName ?? p.setId,
    collectorNumber: p.collectorNumber,
    rarity: toRarity(p.rarity),
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isPromo: p.isPromo,
    finish: p.finish,
    images: p.imageUrl ? [{ face: "front", url: p.imageUrl }] : [],
    artist: p.artist,
    publicCode: p.publicCode,
    card: {
      id: candidate.sourceId,
      name: candidate.name,
      type: candidate.type as CardType,
      superTypes: candidate.superTypes,
      domains: candidate.domains,
      stats: { energy: candidate.energy, might: candidate.might, power: candidate.power },
      keywords: candidate.keywords,
      tags: candidate.tags,
      mightBonus: candidate.mightBonus,
      description: candidate.rulesText,
      effect: candidate.effectText,
    },
  };
}

export function CandidateCardRow({
  candidate,
  isSelected,
  onToggleSelect,
  onAccept,
  onReject,
  onEdit,
  acceptPending,
  rejectPending,
}: {
  candidate: CandidateCard;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (fields: Record<string, unknown>) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleSetField(key: "superTypes" | "domains", value: string) {
    setEdit((prev) => {
      if (!prev) {
        return prev;
      }
      const next = new Set(prev[key]);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [key]: next };
    });
  }

  function startEditing() {
    setEdit({
      name: candidate.name,
      type: candidate.type,
      superTypes: new Set(candidate.superTypes),
      domains: new Set(candidate.domains),
      energy: candidate.energy?.toString() ?? "",
      might: candidate.might?.toString() ?? "",
      power: candidate.power?.toString() ?? "",
      mightBonus: candidate.mightBonus?.toString() ?? "",
      keywords: candidate.keywords.join(", "),
      tags: candidate.tags.join(", "),
      rulesText: candidate.rulesText,
      effectText: candidate.effectText,
    });
    if (!expanded) {
      setExpanded(true);
    }
  }

  function saveEdits() {
    if (!edit) {
      return;
    }
    const fields: Record<string, unknown> = {};
    if (edit.name !== candidate.name) {
      fields.name = edit.name;
    }
    if (edit.type !== candidate.type) {
      fields.type = edit.type;
    }
    const newDomains = [...edit.domains];
    if (JSON.stringify(newDomains.sort()) !== JSON.stringify([...candidate.domains].sort())) {
      fields.domains = newDomains;
    }
    const energy = edit.energy ? Number(edit.energy) : null;
    if (energy !== candidate.energy) {
      fields.energy = energy;
    }
    const might = edit.might ? Number(edit.might) : null;
    if (might !== candidate.might) {
      fields.might = might;
    }
    const newSuperTypes = [...edit.superTypes];
    if (JSON.stringify(newSuperTypes.sort()) !== JSON.stringify([...candidate.superTypes].sort())) {
      fields.super_types = newSuperTypes;
    }
    const power = edit.power ? Number(edit.power) : null;
    if (power !== candidate.power) {
      fields.power = power;
    }
    const mightBonus = edit.mightBonus ? Number(edit.mightBonus) : null;
    if (mightBonus !== candidate.mightBonus) {
      fields.might_bonus = mightBonus;
    }
    const newKeywords = edit.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (JSON.stringify(newKeywords) !== JSON.stringify(candidate.keywords)) {
      fields.keywords = newKeywords;
    }
    const newTags = edit.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (JSON.stringify(newTags) !== JSON.stringify(candidate.tags)) {
      fields.tags = newTags;
    }
    if (edit.rulesText !== candidate.rulesText) {
      fields.rules_text = edit.rulesText;
    }
    if (edit.effectText !== candidate.effectText) {
      fields.effect_text = edit.effectText;
    }

    if (Object.keys(fields).length > 0) {
      onEdit(fields);
    }
    setEdit(null);
  }

  return (
    <div className="rounded-lg border">
      {/* Clickable summary row */}
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}

        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="size-4 rounded border-border"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="mr-2 font-normal text-muted-foreground">{candidate.sourceId}</span>
            <span className="font-medium">{candidate.name}</span>
            <Badge variant="outline" className="text-xs">
              {candidate.type}
            </Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {candidate.printings.length} printing
              {candidate.printings.length === 1 ? "" : "s"}
            </span>
            {candidate.domains.length > 0 && (
              <>
                <span>&middot;</span>
                <span>{candidate.domains.join(", ")}</span>
              </>
            )}
            {candidate.source && (
              <>
                <span>&middot;</span>
                <span>{candidate.source}</span>
              </>
            )}
          </div>
        </div>

        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stop-propagation wrapper for action buttons */}
        <div
          role="presentation"
          className="flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size="sm" variant="ghost" onClick={startEditing}>
            <PencilIcon className="size-4" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-green-600 hover:text-green-700 dark:text-green-400"
            disabled={acceptPending}
            onClick={onAccept}
          >
            <CheckIcon className="size-4" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 dark:text-red-400"
            disabled={rejectPending}
            onClick={onReject}
          >
            <XIcon className="size-4" />
            Reject
          </Button>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="flex flex-col gap-6 border-t bg-muted/30 px-4 py-4 sm:flex-row sm:px-6">
          {/* Printings grid */}
          <div className="min-w-0">
            <SectionHeading>Printings</SectionHeading>
            <div className="flex flex-wrap gap-4">
              {candidate.printings.map((p, i) => (
                <div key={p.id} className="w-[320px] rounded-lg">
                  <CardThumbnail
                    printing={candidatePrintingToPrinting(candidate, i)}
                    onClick={NOOP}
                    showImages
                    cardFields={{
                      number: true,
                      title: true,
                      type: true,
                      rarity: true,
                      price: false,
                    }}
                  />
                  <div className="space-y-1 px-2.5 pb-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>{p.finish}</span>
                      {p.isSigned && <span>&middot; Signed</span>}
                      {p.isPromo && <span>&middot; Promo</span>}
                    </div>
                    <div>
                      {p.setId}
                      {p.setName ? ` (${p.setName})` : ""} &middot; #{p.collectorNumber}
                    </div>
                    {p.artVariant && <div>Variant: {p.artVariant}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card fields sidebar */}
          <div className="w-full shrink-0 sm:w-80">
            <SectionHeading>Card Fields</SectionHeading>
            {edit ? (
              <div className="space-y-3">
                <EditField label="Name" value={edit.name} onChange={(v) => updateEdit("name", v)} />
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={edit.type}
                    onValueChange={(v) => {
                      if (v) {
                        updateEdit("type", v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          <span className="flex items-center gap-1.5">
                            <CardIcon src={typeIconPath(t)} />
                            {t}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <MultiSelect
                  label="Super Types"
                  options={ALL_SUPER_TYPES}
                  selected={edit.superTypes}
                  onToggle={(st) => toggleSetField("superTypes", st)}
                />
                <MultiSelect
                  label="Domains"
                  options={ALL_DOMAINS}
                  selected={edit.domains}
                  onToggle={(d) => toggleSetField("domains", d)}
                  iconPath={domainIconPath}
                />
                <EditField
                  label="Energy"
                  value={edit.energy}
                  onChange={(v) => updateEdit("energy", v)}
                />
                <EditField
                  label="Might"
                  value={edit.might}
                  onChange={(v) => updateEdit("might", v)}
                />
                <EditField
                  label="Power"
                  value={edit.power}
                  onChange={(v) => updateEdit("power", v)}
                />
                <EditField
                  label="Might Bonus"
                  value={edit.mightBonus}
                  onChange={(v) => updateEdit("mightBonus", v)}
                />
                <EditField
                  label="Keywords"
                  value={edit.keywords}
                  onChange={(v) => updateEdit("keywords", v)}
                />
                <EditField label="Tags" value={edit.tags} onChange={(v) => updateEdit("tags", v)} />
                <EditField
                  label="Rules Text"
                  value={edit.rulesText}
                  onChange={(v) => updateEdit("rulesText", v)}
                />
                <EditField
                  label="Effect Text"
                  value={edit.effectText}
                  onChange={(v) => updateEdit("effectText", v)}
                />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={saveEdits}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEdit(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-sm">
                <Field label="Source ID" value={candidate.sourceId} />
                <Field label="Type" value={candidate.type} />
                <Field label="Super Types" value={candidate.superTypes.join(", ") || "—"} />
                <Field label="Domains" value={candidate.domains.join(", ")} />
                <Field label="Might" value={candidate.might?.toString() ?? "—"} />
                <Field label="Energy" value={candidate.energy?.toString() ?? "—"} />
                <Field label="Power" value={candidate.power?.toString() ?? "—"} />
                <Field label="Keywords" value={candidate.keywords.join(", ") || "—"} />
                <Field label="Tags" value={candidate.tags.join(", ") || "—"} />
                <Field label="Might Bonus" value={candidate.mightBonus?.toString() ?? "—"} />
                <Field label="Rules Text" value={candidate.rulesText || "—"} />
                <Field label="Effect Text" value={candidate.effectText || "—"} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
