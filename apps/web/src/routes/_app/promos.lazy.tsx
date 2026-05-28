import { createLazyFileRoute } from "@tanstack/react-router";

import { Heading } from "@/components/heading";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/promos")({
  component: PromosEmpty,
});

// Reached only when the dataset has no printings — the loader otherwise
// redirects to /promos/$language for the default language.
function PromosEmpty() {
  return (
    <div className={PAGE_PADDING}>
      <Heading level={1}>Promos</Heading>
      <p className="text-muted-foreground mt-2 text-sm">No promos yet.</p>
    </div>
  );
}
