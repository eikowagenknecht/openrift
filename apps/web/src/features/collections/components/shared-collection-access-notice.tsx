import { CatchBoundary, Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCollectionsMap } from "@/features/collections/hooks/use-collections";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

// Not a redirect: opening the share URL is how an owner checks what the public sees.
export function SharedCollectionAccessNotice({ collectionId }: { collectionId: string }) {
  const hydrated = useHydrated();
  const userId = useUserId();

  // Public, SSR'd with a short cache; the per-viewer lookup must stay client-side.
  if (!hydrated || !userId) {
    return null;
  }

  return (
    <CatchBoundary getResetKey={() => collectionId} errorComponent={() => null}>
      <Suspense fallback={null}>
        <AccessNoticeBody collectionId={collectionId} />
      </Suspense>
    </CatchBoundary>
  );
}

function AccessNoticeBody({ collectionId }: { collectionId: string }) {
  // listAccessibleForUser: binders owned by the viewer, plus binders owned by
  // a group they're in. A binder merely shared with the group isn't in it.
  const collections = useCollectionsMap();
  if (!collections.has(collectionId)) {
    return null;
  }

  return (
    <Alert variant="info" className="mt-3">
      <InfoIcon />
      <AlertTitle>You have full access to this collection</AlertTitle>
      <AlertDescription>
        This is the read-only link that anyone can open.{" "}
        <Link to="/collections/$collectionId" params={{ collectionId }}>
          Open the full view
        </Link>{" "}
        to add or take copies.
      </AlertDescription>
    </Alert>
  );
}
