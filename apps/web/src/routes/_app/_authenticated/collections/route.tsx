import { createFileRoute } from "@tanstack/react-router";

import { filterSearchSchema } from "@/features/cards/lib/search-schemas";

export const Route = createFileRoute("/_app/_authenticated/collections")({
  // The sidebar's useLiveQuery calls useSyncExternalStore without a
  // getServerSnapshot, which throws "Switched to client rendering" under SSR.
  ssr: "data-only",
  staticData: { hideFooter: true },
  validateSearch: filterSearchSchema,
});
