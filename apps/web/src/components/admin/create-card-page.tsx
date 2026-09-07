import { slugifyName } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
} from "@/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCreateCard } from "@/hooks/use-admin-card-mutations";
import { useEnumOrders } from "@/hooks/use-enums";

type NumField = "might" | "energy" | "power" | "mightBonus";

const NUM_FIELDS: { key: NumField; label: string }[] = [
  { key: "might", label: "Might" },
  { key: "energy", label: "Energy" },
  { key: "power", label: "Power" },
  { key: "mightBonus", label: "Might bonus" },
];

export function CreateCardPage() {
  const navigate = useNavigate();
  const createCard = useCreateCard();
  const { orders, labels } = useEnumOrders();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  // Selection order matters: the first type is primary.
  const [types, setTypes] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [superTypes, setSuperTypes] = useState<string[]>([]);
  const [numeric, setNumeric] = useState<Record<NumField, string>>({
    might: "",
    energy: "",
    power: "",
    mightBonus: "",
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const commitTagDraft = () => {
    const trimmed = tagDraft.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagDraft("");
  };

  const effectiveSlug = slugDirty ? slug : slugifyName(name);
  const canSubmit =
    name.trim().length > 0 &&
    effectiveSlug.trim().length > 0 &&
    types.length > 0 &&
    domains.length > 0 &&
    !createCard.isPending;

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
    const trimmedDraft = tagDraft.trim();
    const finalTags = trimmedDraft && !tags.includes(trimmedDraft) ? [...tags, trimmedDraft] : tags;

    createCard.mutate(
      {
        id: effectiveSlug.trim(),
        name: name.trim(),
        types,
        domains,
        ...(superTypes.length > 0 && { superTypes }),
        ...(numeric.might !== "" && { might: parseNum(numeric.might) }),
        ...(numeric.energy !== "" && { energy: parseNum(numeric.energy) }),
        ...(numeric.power !== "" && { power: parseNum(numeric.power) }),
        ...(numeric.mightBonus !== "" && { mightBonus: parseNum(numeric.mightBonus) }),
        ...(finalTags.length > 0 && { tags: finalTags }),
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
    <div className="max-w-2xl">
      <AdminPageTopBar title="Create Card" />
      <Card>
        <CardHeader>
          <CardTitle>Create new card</CardTitle>
          <CardDescription>Slug is auto-generated from the name until you edit it.</CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="create-card-name">Name *</FieldLabel>
                <Input
                  id="create-card-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jinx, Rebel"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-card-slug">Slug *</FieldLabel>
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
              </Field>
            </div>

            <Field>
              <FieldLabel>Types *</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                spacing={2}
                value={types}
                onValueChange={setTypes}
                className="w-full flex-wrap"
              >
                {orders.cardTypes.map((typeSlug) => (
                  <ToggleGroupItem key={typeSlug} value={typeSlug}>
                    {labels.cardTypes[typeSlug]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>Domains *</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                spacing={2}
                value={domains}
                onValueChange={setDomains}
                className="w-full flex-wrap"
              >
                {orders.domains.map((domainSlug) => (
                  <ToggleGroupItem key={domainSlug} value={domainSlug}>
                    {labels.domains[domainSlug]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>Supertypes</FieldLabel>
              <ToggleGroup
                multiple
                variant="outline"
                spacing={2}
                value={superTypes}
                onValueChange={setSuperTypes}
                className="w-full flex-wrap"
              >
                {orders.superTypes.map((superTypeSlug) => (
                  <ToggleGroupItem key={superTypeSlug} value={superTypeSlug}>
                    {labels.superTypes[superTypeSlug]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {NUM_FIELDS.map(({ key, label }) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`create-card-${key}`}>{label}</FieldLabel>
                  <Input
                    id={`create-card-${key}`}
                    type="number"
                    min={0}
                    value={numeric[key]}
                    onChange={(e) => setNumeric((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </Field>
              ))}
            </div>

            <Field>
              <FieldLabel>Tags</FieldLabel>
              <Combobox<string, true>
                multiple
                items={tags}
                value={tags}
                onValueChange={setTags}
                inputValue={tagDraft}
                onInputValueChange={setTagDraft}
              >
                <ComboboxChips>
                  {tags.map((tag) => (
                    <ComboboxChip key={tag}>{tag}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    placeholder={tags.length === 0 ? "Press Enter or comma to add" : ""}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        commitTagDraft();
                      }
                    }}
                    onBlur={commitTagDraft}
                  />
                </ComboboxChips>
              </Combobox>
            </Field>

            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button disabled={!canSubmit} onClick={handleSubmit}>
                <PlusIcon className="mr-1 size-4" />
                Create card
              </Button>
              <Button variant="ghost" onClick={() => void navigate({ to: "/admin/cards" })}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
