import { createLazyFileRoute, Link } from "@tanstack/react-router";

import { ContributeForm } from "@/components/contribute/contribute-form";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { emptyFormState } from "@/lib/contribute-json";
import { cn, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute")({
  component: ContributePage,
});

function ContributePage() {
  return (
    <div className={cn(PAGE_PADDING, "mx-auto flex max-w-3xl flex-col gap-6 xl:max-w-6xl")}>
      <header className="flex max-w-3xl flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Heading level={1}>Add a card to OpenRift</Heading>
          <Button variant="outline" size="sm" render={<Link to="/contribute/submissions" />}>
            My submissions
          </Button>
        </div>
        <p className="text-muted-foreground">
          Spotted a card that&apos;s missing? Fill in what you know below and submit. You don&apos;t
          need to complete every field. Partial entries still help, and the more detail you add, the
          faster I can review it.
        </p>
      </header>
      <ContributeForm initial={emptyFormState()} />
    </div>
  );
}
