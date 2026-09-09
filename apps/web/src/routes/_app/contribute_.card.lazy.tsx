import { createLazyFileRoute } from "@tanstack/react-router";

import { Heading } from "@/components/heading";
import { ContributeForm } from "@/features/contribute/components/contribute-form";
import { emptyFormState } from "@/features/contribute/lib/contribute-json";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/card")({
  component: ContributeCardPage,
});

function ContributeCardPage() {
  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-6")}>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Add a card</Heading>
        <p className="text-muted-foreground">
          Fill in what you know about the card. We take it from there.
        </p>
      </header>
      <ContributeForm initial={emptyFormState()} />
    </div>
  );
}
