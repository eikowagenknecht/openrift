import { createLazyFileRoute } from "@tanstack/react-router";

import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/promos")({
  component: PromosEmpty,
});

// Reached only when the dataset has no printings — the loader otherwise
// redirects to /promos/$language for the default language.
function PromosEmpty() {
  return (
    <div className={PAGE_PADDING}>
      <h1 className="text-2xl font-bold">Promos</h1>
      <p className="text-muted-foreground mt-2 text-sm">No promos yet.</p>
    </div>
  );
}
