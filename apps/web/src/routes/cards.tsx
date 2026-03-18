import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CardBrowser } from "@/components/card-browser";
import { catalogQueryOptions } from "@/hooks/use-cards";

export const Route = createFileRoute("/cards")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  component: CardsPage,
});

function CardsPage() {
  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);

  return <CardBrowser />;
}
