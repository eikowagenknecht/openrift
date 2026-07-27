import { createLazyFileRoute } from "@tanstack/react-router";

import { CardDesignerPage } from "@/components/card-designer/card-designer-page";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/card-designer")({
  component: CardDesignerRoute,
});

function CardDesignerRoute() {
  return (
    <>
      <PageTopBarSticky maxWidth="6xl">
        <PageTopBar>
          <PageTopBarTitle>Card Designer</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_PADDING_NO_TOP, "mx-auto flex max-w-6xl flex-col gap-6 pt-3")}>
        <PageDescription>
          Make your own Riftbound-style card: pick a background image, fill in the details, then
          download it or copy it to share. Everything stays in your browser.
        </PageDescription>
        <CardDesignerPage />
      </div>
    </>
  );
}
