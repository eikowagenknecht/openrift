import type { CandidateCard, Card as CardData, CardType, Domain, Rarity } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
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

const VALID_RARITIES = new Set(["Common", "Uncommon", "Rare", "Epic", "Showcase"]);

function toRarity(r: string): Rarity {
  return VALID_RARITIES.has(r) ? (r as Rarity) : "Common";
}

function candidatePrintingToCard(candidate: CandidateCard, printingIndex: number): CardData {
  const p = candidate.printings[printingIndex];
  return {
    id: p.id,
    cardId: candidate.sourceId,
    sourceId: p.sourceId,
    name: candidate.name,
    type: candidate.type as CardType,
    superTypes: candidate.superTypes,
    domains: candidate.domains,
    stats: { energy: candidate.energy, might: candidate.might, power: candidate.power },
    keywords: candidate.keywords,
    tags: candidate.tags,
    mightBonus: candidate.mightBonus,
    set: p.setName ?? p.setId,
    collectorNumber: p.collectorNumber,
    rarity: toRarity(p.rarity),
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isPromo: p.isPromo,
    finish: p.finish,
    art: { imageURL: p.imageUrl, artist: p.artist },
    description: candidate.rulesText,
    effect: candidate.effectText,
    publicCode: p.publicCode,
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
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editSuperTypes, setEditSuperTypes] = useState<Set<string>>(new Set());
  const [editDomains, setEditDomains] = useState<Set<string>>(new Set());
  const [editEnergy, setEditEnergy] = useState("");
  const [editMight, setEditMight] = useState("");
  const [editPower, setEditPower] = useState("");
  const [editMightBonus, setEditMightBonus] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editRulesText, setEditRulesText] = useState("");
  const [editEffectText, setEditEffectText] = useState("");

  function startEditing() {
    setEditName(candidate.name);
    setEditType(candidate.type);
    setEditSuperTypes(new Set(candidate.superTypes));
    setEditDomains(new Set(candidate.domains));
    setEditEnergy(candidate.energy?.toString() ?? "");
    setEditMight(candidate.might?.toString() ?? "");
    setEditPower(candidate.power?.toString() ?? "");
    setEditMightBonus(candidate.mightBonus?.toString() ?? "");
    setEditKeywords(candidate.keywords.join(", "));
    setEditTags(candidate.tags.join(", "));
    setEditRulesText(candidate.rulesText);
    setEditEffectText(candidate.effectText);
    setEditing(true);
    if (!expanded) {
      setExpanded(true);
    }
  }

  function toggleSuperType(st: string) {
    setEditSuperTypes((prev) => {
      const next = new Set(prev);
      if (next.has(st)) {
        next.delete(st);
      } else {
        next.add(st);
      }
      return next;
    });
  }

  function toggleDomain(domain: string) {
    setEditDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }

  function saveEdits() {
    const fields: Record<string, unknown> = {};
    if (editName !== candidate.name) {
      fields.name = editName;
    }
    if (editType !== candidate.type) {
      fields.type = editType;
    }
    const newDomains = [...editDomains];
    if (JSON.stringify(newDomains.sort()) !== JSON.stringify([...candidate.domains].sort())) {
      fields.domains = newDomains;
    }
    const energy = editEnergy ? Number(editEnergy) : null;
    if (energy !== candidate.energy) {
      fields.energy = energy;
    }
    const might = editMight ? Number(editMight) : null;
    if (might !== candidate.might) {
      fields.might = might;
    }
    const newSuperTypes = [...editSuperTypes];
    if (JSON.stringify(newSuperTypes.sort()) !== JSON.stringify([...candidate.superTypes].sort())) {
      fields.super_types = newSuperTypes;
    }
    const power = editPower ? Number(editPower) : null;
    if (power !== candidate.power) {
      fields.power = power;
    }
    const mightBonus = editMightBonus ? Number(editMightBonus) : null;
    if (mightBonus !== candidate.mightBonus) {
      fields.might_bonus = mightBonus;
    }
    const newKeywords = editKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (JSON.stringify(newKeywords) !== JSON.stringify(candidate.keywords)) {
      fields.keywords = newKeywords;
    }
    const newTags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (JSON.stringify(newTags) !== JSON.stringify(candidate.tags)) {
      fields.tags = newTags;
    }
    if (editRulesText !== candidate.rulesText) {
      fields.rules_text = editRulesText;
    }
    if (editEffectText !== candidate.effectText) {
      fields.effect_text = editEffectText;
    }

    if (Object.keys(fields).length > 0) {
      onEdit(fields);
    }
    setEditing(false);
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
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Printings
            </h4>
            <div className="flex flex-wrap gap-4">
              {candidate.printings.map((p, i) => (
                <div key={p.id} className="w-[320px] rounded-lg">
                  <CardThumbnail
                    card={candidatePrintingToCard(candidate, i)}
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
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Card Fields
            </h4>
            {editing ? (
              <div className="space-y-3">
                <EditField label="Name" value={editName} onChange={setEditName} />
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={editType}
                    onValueChange={(v) => {
                      if (v) {
                        setEditType(v);
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
                  selected={editSuperTypes}
                  onToggle={toggleSuperType}
                />
                <MultiSelect
                  label="Domains"
                  options={ALL_DOMAINS}
                  selected={editDomains}
                  onToggle={toggleDomain}
                  iconPath={domainIconPath}
                />
                <EditField label="Energy" value={editEnergy} onChange={setEditEnergy} />
                <EditField label="Might" value={editMight} onChange={setEditMight} />
                <EditField label="Power" value={editPower} onChange={setEditPower} />
                <EditField
                  label="Might Bonus"
                  value={editMightBonus}
                  onChange={setEditMightBonus}
                />
                <EditField label="Keywords" value={editKeywords} onChange={setEditKeywords} />
                <EditField label="Tags" value={editTags} onChange={setEditTags} />
                <EditField label="Rules Text" value={editRulesText} onChange={setEditRulesText} />
                <EditField
                  label="Effect Text"
                  value={editEffectText}
                  onChange={setEditEffectText}
                />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={saveEdits}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full text-sm"
      />
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  iconPath,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const summary = selected.size === 0 ? "None" : [...selected].join(", ");

  return (
    <div className="relative space-y-1">
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => onToggle(opt)}
                className="size-3.5 rounded border-border"
              />
              {iconPath && <CardIcon src={iconPath(opt)} />}
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
