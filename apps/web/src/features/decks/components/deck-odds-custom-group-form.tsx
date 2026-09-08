import { WellKnown } from "@openrift/shared/well-known";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { OddsGroupDef } from "@/features/decks/lib/deck-odds-groups";

const CUSTOM_GROUP_TYPES: readonly string[] = [
  WellKnown.cardType.UNIT,
  "spell",
  WellKnown.cardType.GEAR,
];

// At least one condition is required so a group can't silently match the whole deck.
export function DeckOddsCustomGroupForm({
  typeLabels,
  onAdd,
}: {
  typeLabels: Record<string, string>;
  onAdd: (group: OddsGroupDef) => void;
}) {
  const [label, setLabel] = useState("");
  const [types, setTypes] = useState<ReadonlySet<string>>(new Set());
  const [energyMin, setEnergyMin] = useState("");
  const [energyMax, setEnergyMax] = useState("");
  const canAdd =
    label.trim().length > 0 && (types.size > 0 || energyMin !== "" || energyMax !== "");

  const toggleType = (type: string) => {
    const next = new Set(types);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    setTypes(next);
  };

  const submit = () => {
    if (!canAdd) {
      return;
    }
    onAdd({
      key: `custom-${crypto.randomUUID()}`,
      label: label.trim(),
      ...(types.size > 0 && { types: [...types] }),
      ...(energyMin !== "" && { energyMin: Number(energyMin) }),
      ...(energyMax !== "" && { energyMax: Number(energyMax) }),
    });
    setLabel("");
    setTypes(new Set());
    setEnergyMin("");
    setEnergyMax("");
  };

  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-md border border-dashed p-2">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="New group, e.g. Turn-1 gear"
        aria-label="Group name"
        className="h-7 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        {CUSTOM_GROUP_TYPES.map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox checked={types.has(type)} onCheckedChange={() => toggleType(type)} />
            {typeLabels[type]}
          </label>
        ))}
      </div>
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        Energy
        <Input
          type="number"
          min={0}
          value={energyMin}
          onChange={(event) => setEnergyMin(event.target.value)}
          aria-label="Minimum energy"
          className="h-7 w-14 [appearance:textfield] text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        to
        <Input
          type="number"
          min={0}
          value={energyMax}
          onChange={(event) => setEnergyMax(event.target.value)}
          aria-label="Maximum energy"
          className="h-7 w-14 [appearance:textfield] text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={submit}
          disabled={!canAdd}
          className="ml-auto"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
