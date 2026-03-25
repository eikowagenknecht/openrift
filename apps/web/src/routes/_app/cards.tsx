import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CardBrowser } from "@/components/card-browser";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, catalogQueryOptions } from "@/hooks/use-cards";

export const Route = createFileRoute("/_app/cards")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  component: CardsPage,
  pendingComponent: CardsPending,
  errorComponent: CardsError,
});

function CardsPending() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {Array.from({ length: 20 }, (_, i) => (
            <Skeleton key={i} className="aspect-card rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardsError({ error }: { error: Error }) {
  const healthStatus = error instanceof ApiError ? error.healthStatus : null;
  let title = "Failed to load cards.";
  let hint: string | null = null;

  if (healthStatus === "db_unreachable") {
    title = "The database isn't running.";
    hint = "docker compose up db -d";
  } else if (healthStatus === "db_not_migrated") {
    title = "The database hasn't been set up yet.";
    hint = "bun db:migrate && bun db:seed";
  } else if (healthStatus === "db_empty") {
    title = "The database is empty.";
    hint = "bun db:seed";
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <p className="text-muted-foreground">{title}</p>
      {hint && (
        <code className="bg-muted text-muted-foreground rounded px-3 py-1.5 text-sm">{hint}</code>
      )}
      <button
        type="button"
        className="text-sm underline"
        onClick={() => globalThis.location.reload()}
      >
        Retry
      </button>
    </div>
  );
}

function CardsPage() {
  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);

  return <CardBrowser />;
}
