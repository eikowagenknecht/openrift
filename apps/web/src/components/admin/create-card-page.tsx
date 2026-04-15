import { slugifyName } from "@openrift/shared";
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
import { useCreateCard } from "@/hooks/use-admin-card-mutations";
import { useEnumOrders } from "@/hooks/use-enums";

type NumField = "might" | "energy" | "power" | "mightBonus";

export function CreateCardPage() {
  const navigate = useNavigate();
  const createCard = useCreateCard();
  const { orders, labels } = useEnumOrders();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [type, setType] = useState<string>(orders.cardTypes[0] ?? "");
  const [domains, setDomains] = useState<string[]>([]);
  const [superTypes, setSuperTypes] = useState<string[]>([]);
  const [numeric, setNumeric] = useState<Record<NumField, string>>({
    might: "",
    energy: "",
    power: "",
    mightBonus: "",
  });
  const [tagsText, setTagsText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveSlug = slugDirty ? slug : slugifyName(name);
  const canSubmit =
    name.trim().length > 0 &&
    effectiveSlug.trim().length > 0 &&
    type.length > 0 &&
    domains.length > 0 &&
    !createCard.isPending;

  function toggleDomain(value: string) {
    setDomains((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  function toggleSuperType(value: string) {
    setSuperTypes((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }

  function parseNum(value: string): number | null {
    if (value.trim() === "") {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setErrorMsg(null);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    createCard.mutate(
      {
        id: effectiveSlug.trim(),
        name: name.trim(),
        type,
        domains,
        ...(superTypes.length > 0 && { superTypes }),
        ...(numeric.might !== "" && { might: parseNum(numeric.might) }),
        ...(numeric.energy !== "" && { energy: parseNum(numeric.energy) }),
        ...(numeric.power !== "" && { power: parseNum(numeric.power) }),
        ...(numeric.mightBonus !== "" && { mightBonus: parseNum(numeric.mightBonus) }),
        ...(tags.length > 0 && { tags }),
      },
      {
        onSuccess: (result) => {
          void navigate({
            to: "/admin/cards/$cardSlug",
            params: { cardSlug: result.cardSlug },
          });
        },
        onError: (error) => {
          setErrorMsg(error instanceof Error ? error.message : "Failed to create card");
        },
      },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create new card</h2>
        <p className="text-muted-foreground">
          Manual entry. Slug is auto-generated from the name until you edit it.
        </p>
      </div>

      <section className="space-y-4 rounded-md border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="create-card-name">Name *</Label>
            <Input
              id="create-card-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jinx, Rebel"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-card-slug">Slug *</Label>
            <Input
              id="create-card-slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugDirty(true);
              }}
              placeholder="auto-generated from name"
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Type *</Label>
          <Select value={type} onValueChange={(value) => value && setType(value)}>
            <SelectTrigger className="w-48">
              <SelectValue>{(value: string) => labels.cardTypes[value] ?? value}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {orders.cardTypes.map((typeSlug) => (
                <SelectItem key={typeSlug} value={typeSlug}>
                  {labels.cardTypes[typeSlug] ?? typeSlug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Domains *</Label>
          <div className="flex flex-wrap gap-2">
            {orders.domains.map((domainSlug) => {
              const selected = domains.includes(domainSlug);
              return (
                <Button
                  key={domainSlug}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleDomain(domainSlug)}
                >
                  {labels.domains[domainSlug] ?? domainSlug}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <Label>Super types</Label>
          <div className="flex flex-wrap gap-2">
            {orders.superTypes.map((superTypeSlug) => {
              const selected = superTypes.includes(superTypeSlug);
              return (
                <Button
                  key={superTypeSlug}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSuperType(superTypeSlug)}
                >
                  {labels.superTypes[superTypeSlug] ?? superTypeSlug}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["might", "energy", "power", "mightBonus"] as NumField[]).map((key) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`create-card-${key}`}>{key}</Label>
              <Input
                id={`create-card-${key}`}
                type="number"
                min={0}
                value={numeric[key]}
                onChange={(e) => setNumeric((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-card-tags">Tags (comma-separated)</Label>
          <Input
            id="create-card-tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="e.g. wish, reanimator"
          />
        </div>

        {errorMsg && <p className="text-destructive">{errorMsg}</p>}

        <div className="flex gap-2">
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            <PlusIcon className="mr-1 size-4" />
            Create card
          </Button>
          <Button variant="ghost" onClick={() => navigate({ to: "/admin/cards" })}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
