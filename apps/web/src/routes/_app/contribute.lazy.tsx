import { createLazyFileRoute } from "@tanstack/react-router";

import { ContributeForm } from "@/components/contribute/contribute-form";
import { Heading } from "@/components/heading";
import { emptyFormState } from "@/lib/contribute-json";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute")({
  component: ContributePage,
});

function ContributePage() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-3xl flex-col gap-6`}>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Add a card to OpenRift</Heading>
        <p className="text-muted-foreground">
          Spotted a card that&apos;s missing? Fill in what you know below and submit. You&apos;ll
          need a free GitHub account, but no coding or git experience.
        </p>
      </header>
      <ContributeForm initial={emptyFormState()} />
    </div>
  );
}
