import type { StagePreset } from "@openrift/shared/contracts/stage-presets";
import { BookmarkPlusIcon, XIcon } from "lucide-react";
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
import { MAX_PRESET_NAME_LENGTH } from "@/features/stage/components/stage-preset-name-dialog";
import { useCreateStagePreset, useStagePresets } from "@/features/stage/hooks/use-stage-presets";
import { captureStagePreset } from "@/features/stage/lib/stage-preset-apply";
import { usePresentationStore } from "@/features/stage/stores/presentation-store";
import { applyStagePresetConfig } from "@/features/stage/stores/stage-preset-actions";
import { useUserId } from "@/lib/auth-session";
import { useDisplayStore } from "@/stores/display-store";

// Presets never auto-apply on load.
export function StagePresetSettings() {
  const userId = useUserId();
  const { data: presets } = useStagePresets();
  const createPreset = useCreateStagePreset();
  const tierTileStep = useDisplayStore((state) => state.tierTileStep);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (userId === null) {
    return null;
  }

  const items = (presets ?? []).map((preset: StagePreset) => ({
    value: preset.id,
    label: preset.name,
  }));

  const apply = (id: string) => {
    const preset = presets?.find((candidate) => candidate.id === id);
    if (!preset) {
      return;
    }
    setAppliedId(id);
    applyStagePresetConfig(preset.config);
  };

  const trimmedName = name.trim();

  const save = () => {
    const config = captureStagePreset(usePresentationStore.getState(), tierTileStep);
    createPreset.mutate(
      { name: trimmedName, config },
      {
        // On failure the typed text stays put to be corrected; the global mutation toast covers the error.
        onSuccess: (preset) => {
          setAppliedId(preset.id);
          setNaming(false);
          setName("");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="stage-preset">Presets</Label>
      <div className="flex items-center gap-2">
        <Select
          items={items}
          value={appliedId}
          onValueChange={(next) => {
            if (typeof next === "string") {
              apply(next);
            }
          }}
        >
          <SelectTrigger id="stage-preset" className="flex-1" disabled={items.length === 0}>
            <SelectValue placeholder={items.length === 0 ? "None saved yet" : "Apply a preset"} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          aria-label={naming ? "Cancel saving a preset" : "Save current as preset"}
          title={naming ? "Cancel" : "Save current as preset"}
          onClick={() => {
            setName("");
            setNaming(!naming);
          }}
        >
          {naming ? <XIcon /> : <BookmarkPlusIcon />}
        </Button>
      </div>

      {naming && (
        <div className="flex items-center gap-2">
          <Input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the button just swapped itself for this field; leaving focus behind would strand a keyboard user on the stage
            autoFocus
            aria-label="Preset name"
            value={name}
            maxLength={MAX_PRESET_NAME_LENGTH}
            placeholder="Green screen, plate off"
            className="flex-1"
            onChange={(event) => setName(event.target.value)}
            // The stage's key handler stands down inside a text field, so Enter is free here.
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmedName !== "") {
                save();
              }
            }}
          />
          <Button size="sm" disabled={trimmedName === "" || createPreset.isPending} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
