import { SlidersHorizontalIcon } from "lucide-react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import type { ScanSettingsProps } from "@/features/scan/components/scan-settings-menu";
import { ScanSettingsMenu } from "@/features/scan/components/scan-settings-menu";

export function ScanTopBar({ settings }: { settings: ScanSettingsProps }) {
  return (
    <PageTopBarSticky width="capped">
      <PageTopBar>
        <PageTopBarTitle>Scan cards</PageTopBarTitle>
        <PageTopBarActions>
          <ScanSettingsMenu
            {...settings}
            trigger={<PageTopBarButton />}
            triggerContent={
              <>
                <SlidersHorizontalIcon className="size-4" />
                Settings
              </>
            }
          />
        </PageTopBarActions>
      </PageTopBar>
    </PageTopBarSticky>
  );
}
