import { createLazyFileRoute } from "@tanstack/react-router";

import { ContributeForm } from "@/components/contribute/contribute-form";
import { emptyFormState } from "@/lib/contribute-json";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute")({
  component: ContributePage,
});

function ContributePage() {
  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-3xl flex-col gap-6`}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Contribute card data</h1>
        <p className="text-muted-foreground">
          Submit a missing card to OpenRift. Your changes are reviewed before going live.
        </p>
      </header>
      <ContributeForm initial={emptyFormState()} />
    </div>
  );
}
