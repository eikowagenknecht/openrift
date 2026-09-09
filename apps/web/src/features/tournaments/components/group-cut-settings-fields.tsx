import type { CutSize } from "@openrift/shared/pairing/group-cut-types";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CUT_SIZE_ITEMS, parseCutSize } from "@/features/tournaments/lib/group-cut-display";

export interface GroupCutSettings {
  cutSize: CutSize;
  groupsSelfPaced: boolean;
  cutRematchAvoidance: boolean;
  legendTiebreak: boolean;
}

/** The four group-stage options; shared by the create wizard and the settings tab. */
export function GroupCutSettingsFields({
  idPrefix,
  value,
  disabled = false,
  onChange,
}: {
  idPrefix: string;
  value: GroupCutSettings;
  disabled?: boolean;
  onChange: (patch: Partial<GroupCutSettings>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-40 flex-col gap-1.5">
        <Label>Cut</Label>
        <Select
          items={CUT_SIZE_ITEMS}
          value={String(value.cutSize)}
          disabled={disabled}
          onValueChange={(next) => {
            const parsed = next === null ? null : parseCutSize(next);
            if (parsed !== null) {
              onChange({ cutSize: parsed });
            }
          }}
        >
          <SelectTrigger className="w-full" aria-label="Cut">
            <SelectValue placeholder="Cut" />
          </SelectTrigger>
          <SelectContent>
            {CUT_SIZE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SwitchField
        id={`${idPrefix}-self-paced`}
        label="Groups advance on their own"
        hint="Each group starts its next round when its results are in. Off: you start every round for all groups."
        checked={value.groupsSelfPaced}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ groupsSelfPaced: checked })}
      />
      <SwitchField
        id={`${idPrefix}-rematch`}
        label="Rematch avoidance"
        hint="Keep group opponents apart in the bracket where possible"
        checked={value.cutRematchAvoidance}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ cutRematchAvoidance: checked })}
      />
      <SwitchField
        id={`${idPrefix}-legend-tiebreak`}
        label="Legend tiebreak"
        hint="Rarer Legend in the field wins a tie, then lower meta share. Every player needs a Legend when groups are generated."
        checked={value.legendTiebreak}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ legendTiebreak: checked })}
      />
    </div>
  );
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
        <Label htmlFor={id}>{label}</Label>
      </div>
      <span className="text-muted-foreground text-sm">{hint}</span>
    </div>
  );
}
