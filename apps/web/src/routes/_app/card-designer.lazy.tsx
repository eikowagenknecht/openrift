import { createLazyFileRoute } from "@tanstack/react-router";

import { CardDesignerPage } from "@/components/card-designer/card-designer-page";
import { Heading } from "@/components/heading";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/card-designer")({
  component: CardDesignerRoute,
});

function CardDesignerRoute() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-6xl flex-col gap-6`}>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Card Designer</Heading>
        <p className="text-muted-foreground">
          Make your own Riftbound-style card: pick a background image, fill in the details, then
          download it or copy it to share. Everything stays in your browser.
        </p>
      </header>
      <CardDesignerPage />
    </div>
  );
}
