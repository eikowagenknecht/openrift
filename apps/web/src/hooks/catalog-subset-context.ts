import { createContext } from "react";

import type { UseCardsResult } from "@/lib/catalog-query";

/** Null outside a provider: `useCards` falls back to the catalogue query in that case. */
export const CatalogSubsetContext = createContext<UseCardsResult | null>(null);
