import { createFileRoute } from "@tanstack/react-router";
import { createContext } from "react";
import { z } from "zod";

import { filterSearchSchema } from "@/lib/search-schemas";

/** Portal slot for the full-width top bar rendered above the sidebar + content row. */
export const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

const collectionsSearchSchema = filterSearchSchema.extend({
  browsing: z.boolean().optional(),
});

export const Route = createFileRoute("/_app/_authenticated/collections")({
  // data-only: the sidebar uses useLiveQuery on the copies collection
  // (derived copyCount), which calls useSyncExternalStore without a
  // getServerSnapshot. Skipping SSR for this subtree avoids the resulting
  // "Switched to client rendering" error; every child route is already
  // data-only for the same reason.
  ssr: "data-only",
  staticData: { hideFooter: true },
  validateSearch: collectionsSearchSchema,
});
