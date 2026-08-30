import { createLazyFileRoute } from "@tanstack/react-router";

import { CardDesignerPage } from "@/components/card-designer/card-designer-page";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
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
          Make your own Riftbound-style card. Everything stays in your browser.
        </PageDescription>
        <CardDesignerPage />
      </div>
    </>
  );
}
