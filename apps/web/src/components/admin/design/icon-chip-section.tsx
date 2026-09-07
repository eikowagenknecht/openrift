import { FolderIcon, HeartIcon, PackageIcon, TrophyIcon, UsersIcon, ZapIcon } from "lucide-react";

import { IconChip } from "@/components/ui/icon-chip";

import { DemoSection, Swatch, SwatchRow } from "./demo-primitives";

export function IconChipSection() {
  return (
    <DemoSection
      id="icon-chip"
      title="Icon chip"
      note="A tinted icon chip: square default size anchors dashboard tiles, round sm marks feed and rail rows."
    >
      <SwatchRow label="Tones (square, default)">
        <Swatch label="neutral">
          <IconChip icon={PackageIcon} tone="neutral" />
        </Swatch>
        <Swatch label="primary">
          <IconChip icon={PackageIcon} tone="primary" />
        </Swatch>
        <Swatch label="gold">
          <IconChip icon={ZapIcon} tone="gold" />
        </Swatch>
        <Swatch label="info">
          <IconChip icon={FolderIcon} tone="info" />
        </Swatch>
        <Swatch label="success">
          <IconChip icon={UsersIcon} tone="success" />
        </Swatch>
        <Swatch label="violet">
          <IconChip icon={TrophyIcon} tone="violet" />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Round small (feed/rail rows)">
        <Swatch label="sm round">
          <IconChip icon={HeartIcon} tone="primary" size="sm" shape="round" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}
