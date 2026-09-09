import { createLazyFileRoute } from "@tanstack/react-router";

import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { CardDesignerPage } from "@/features/designer/components/card-designer-page";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/card-designer")({
  component: CardDesignerRoute,
});

function CardDesignerRoute() {
  return (
    <>
      <PageTopBarSticky width="full">
        <PageTopBar>
          <PageTopBarTitle>Card Designer</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.full, PAGE_PADDING_NO_TOP, "flex flex-col gap-6 pt-3")}>
        <PageDescription>
          Make your own Riftbound-style card. Fill in the name, type, domains, stats, and rules
          text, drop in your own art, and the preview renders as you type. Download it as a PNG or
          copy it to the clipboard. Everything stays in your browser.
        </PageDescription>
        <CardDesignerPage />
      </div>
    </>
  );
}
