import { CatchBoundary, Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { Suspense } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCollectionsMap } from "@/hooks/use-collections";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

/**
 * Shown on the anonymous `/collections/share/$token` page when the signed-in
 * viewer can actually open the collection for real: it is their own binder, or
 * a group binder they are a member of. Without it a member who scans the same
 * QR as everyone else lands on the stranger view with no way back to the one
 * that lets them take copies.
 *
 * Deliberately a notice rather than a redirect, because opening the share URL
 * is how an owner checks what the public actually sees.
 *
 * @returns The notice, or null when the viewer has no better access.
 */
export function SharedCollectionAccessNotice({ collectionId }: { collectionId: string }) {
  const hydrated = useHydrated();
  const userId = useUserId();

  // The share page is public and SSR'd with a short cache, so the lookup has
  // to stay client-side: it is per-viewer, and the collections query needs a
  // session that anonymous visitors don't have.
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
  // Backed by listAccessibleForUser, which is exactly "binders I own, plus
  // binders owned by a group I'm in". That is the same set /collections/$id
  // opens with full add/take controls. A personal binder someone else merely
  // shared with the group is not in it, and correctly gets no notice.
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
