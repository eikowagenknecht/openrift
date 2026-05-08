import { slugifyName } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create new card</CardTitle>
          <CardDescription>
            Manual entry. Slug is auto-generated from the name until you edit it.
          </CardDescription>
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
              <FieldLabel>Type *</FieldLabel>
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
                    {labels.domains[domainSlug] ?? domainSlug}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel>Super types</FieldLabel>
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
                    {labels.superTypes[superTypeSlug] ?? superTypeSlug}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(["might", "energy", "power", "mightBonus"] as NumField[]).map((key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`create-card-${key}`}>{key}</FieldLabel>
                  <Input
                    id={`create-card-${key}`}
                    type="number"
                    min={0}
                    value={numeric[key]}
                    onChange={(e) => setNumeric((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>

            <Field>
              <FieldLabel htmlFor="create-card-tags">Tags (comma-separated)</FieldLabel>
              <Input
                id="create-card-tags"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="e.g. wish, reanimator"
              />
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
              <Button variant="ghost" onClick={() => navigate({ to: "/admin/cards" })}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
