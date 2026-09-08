import type { ReactElement, ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface LanguageItem {
  value: string;
  label: string;
}

export interface ScanSettingsProps {
  languageItems: LanguageItem[];
  language: string;
  onLanguageChange: (value: string) => void;
  autoScan: boolean;
  onAutoScanChange: (value: boolean) => void;
  muted: boolean;
  onMutedChange: (value: boolean) => void;
  tapToScan: boolean;
  onTapToScanChange: (value: boolean) => void;
  deviceTooSlow: boolean;
}

interface ScanSettingsMenuProps extends ScanSettingsProps {
  trigger: ReactElement;
  triggerContent?: ReactNode;
}

export function ScanSettingsMenu({
  trigger,
  triggerContent,
  languageItems,
  language,
  onLanguageChange,
  autoScan,
  onAutoScanChange,
  muted,
  onMutedChange,
  tapToScan,
  onTapToScanChange,
  deviceTooSlow,
}: ScanSettingsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger render={trigger}>{triggerContent}</PopoverTrigger>
      <PopoverContent align="end" className="w-88 max-w-[calc(100vw-1.5rem)] gap-0 p-0">
        <SettingRow label="Card language" description="Used to pick the printing">
          <Select
            items={languageItems}
            value={language}
            onValueChange={(value) => {
              if (value) {
                onLanguageChange(value);
              }
            }}
          >
            <SelectTrigger aria-label="Card language" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Count every copy"
          description="Keeps counting while cards are dealt past the camera. Off: each card once."
        >
          <Switch
            aria-label="Count every copy"
            checked={autoScan}
            onCheckedChange={onAutoScanChange}
          />
        </SettingRow>

        <SettingRow label="Sounds" description="A tick when a card is recognised">
          <Switch
            aria-label="Sounds"
            checked={!muted}
            onCheckedChange={(checked: boolean) => onMutedChange(!checked)}
          />
        </SettingRow>

        <SettingRow label="Tap to scan" description="For slow devices: recognise only when you tap">
          <Switch
            aria-label="Tap to scan"
            checked={deviceTooSlow || tapToScan}
            disabled={deviceTooSlow}
            onCheckedChange={onTapToScanChange}
          />
        </SettingRow>
      </PopoverContent>
    </Popover>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b p-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}
