import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { ContributeForm } from "@/features/contribute/components/contribute-form";
import { MyMissingImagesSection } from "@/features/contribute/components/my-missing-images-section";
import { emptyFormState } from "@/features/contribute/lib/contribute-json";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute")({
  component: ContributePage,
});

function ContributePage() {
  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-6")}>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Heading level={1}>Add a card to OpenRift</Heading>
          <Button variant="outline" size="sm" render={<Link to="/contribute/submissions" />}>
            My submissions
          </Button>
        </div>
        <p className="text-muted-foreground">
          Spotted a missing printing or a typo? Any help is appreciated!
        </p>
      </header>
      <MyMissingImagesSection />
      <ContributeForm initial={emptyFormState()} />
    </div>
  );
}
