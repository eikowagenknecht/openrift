import { CatchBoundary, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";

import { useCollectionsMap } from "@/features/collections/hooks/use-collections";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

/** Sends a viewer who can edit the collection on to the full view; the share URL stays read-only for everyone else. */
export function SharedCollectionAccessRedirect({ collectionId }: { collectionId: string }) {
  const hydrated = useHydrated();
  const userId = useUserId();

  // Public, SSR'd with a short cache; the per-viewer lookup must stay client-side.
  if (!hydrated || !userId) {
    return null;
  }

  return (
    <CatchBoundary getResetKey={() => collectionId} errorComponent={() => null}>
      <Suspense fallback={null}>
        <RedirectWhenAccessible collectionId={collectionId} />
      </Suspense>
    </CatchBoundary>
  );
}

function RedirectWhenAccessible({ collectionId }: { collectionId: string }) {
  // listAccessibleForUser: binders owned by the viewer, plus binders owned by
  // a group they're in. A binder merely shared with the group isn't in it.
  const collections = useCollectionsMap();
  const navigate = useNavigate();
  const accessible = collections.has(collectionId);

  useEffect(() => {
    if (!accessible) {
      return;
    }
    // Replace, or going back lands on the share URL and bounces forward again.
    void navigate({ to: "/collections/$collectionId", params: { collectionId }, replace: true });
  }, [accessible, collectionId, navigate]);

  return null;
}
