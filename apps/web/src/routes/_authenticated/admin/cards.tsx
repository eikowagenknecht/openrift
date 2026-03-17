import { createFileRoute } from "@tanstack/react-router";

interface CardsSearch {
  set?: string;
}

export const Route = createFileRoute("/_authenticated/admin/cards")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    set: typeof search.set === "string" ? search.set : undefined,
  }),
});
