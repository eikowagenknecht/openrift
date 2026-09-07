import { createFileRoute } from "@tanstack/react-router";
import { createContext } from "react";

import { filterSearchSchema } from "@/lib/search-schemas";

/** Portal slot for the full-width top bar rendered above the sidebar + content row. */
export const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

export const Route = createFileRoute("/_app/_authenticated/collections")({
  // The sidebar's useLiveQuery calls useSyncExternalStore without a
  // getServerSnapshot, which throws "Switched to client rendering" under SSR.
  ssr: "data-only",
  staticData: { hideFooter: true },
  validateSearch: filterSearchSchema,
});
