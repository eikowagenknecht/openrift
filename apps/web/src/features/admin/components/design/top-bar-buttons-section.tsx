import { BellIcon, CopyIcon, PlusIcon } from "lucide-react";

import {
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
} from "@/components/layout/page-top-bar";

import { DemoSection, Swatch, SwatchRow } from "./demo-primitives";

export function TopBarButtonsSection() {
  return (
    <DemoSection
      id="top-bar-buttons"
      title="Top-bar buttons"
      note="Only inside PageTopBarActions. One PageTopBarPrimaryButton per bar, everything else ghost. The wrappers lock variant and size so every bar shares the h-8 tier."
    >
      <SwatchRow label="Ladder">
        <Swatch label="PageTopBarButton" colors>
          <PageTopBarButton>
            <CopyIcon /> Copy code
          </PageTopBarButton>
        </Swatch>
        <Swatch label="PageTopBarPrimaryButton" colors>
          <PageTopBarPrimaryButton>
            <PlusIcon /> New deck
          </PageTopBarPrimaryButton>
        </Swatch>
        <Swatch label="PageTopBarIconButton">
          <PageTopBarIconButton aria-label="Notifications">
            <BellIcon />
          </PageTopBarIconButton>
        </Swatch>
        <Swatch label="PageTopBarBack">
          <PageTopBarBack to="/admin" aria-label="Back to admin" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}
