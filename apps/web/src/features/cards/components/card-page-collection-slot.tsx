import type { Printing } from "@openrift/shared/types/catalog";
import { Link } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";
import { lazy, Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card as CardPanel } from "@/components/ui/card";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/lib/auth-session";

const CardPageCollectionActions = lazy(async () => {
  const m = await import("@/features/cards/components/card-page-collection-actions");
  return { default: m.CardPageCollectionActions };
});

// The counts come from a live query with no server snapshot, so this mounts
// only after hydration to avoid a server/client mismatch.
export function CollectionSlot({
  cardSlug,
  printing,
  siblings,
}: {
  cardSlug: string;
  printing: Printing;
  siblings: readonly Printing[];
}) {
  const { data: session, isPending } = useSession();
  const hydrated = useHydrated();
  if (isPending) {
    return null;
  }
  if (!session?.user) {
    return <TrackCollectionNudge cardSlug={cardSlug} />;
  }
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <CardPageCollectionActions printing={printing} siblings={siblings} />
    </Suspense>
  );
}

function TrackCollectionNudge({ cardSlug }: { cardSlug: string }) {
  return (
    <CardPanel className="flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PackageIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Keep count of your copies of this card, with wishlists and tradelists that update
          themselves.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
        render={<Link to="/signup" search={{ redirect: `/cards/${cardSlug}`, email: undefined }} />}
      >
        Sign up free
      </Button>
    </CardPanel>
  );
}
