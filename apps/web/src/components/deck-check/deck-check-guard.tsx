import type { FriendGroupDetailResponse } from "@openrift/shared";
import type { ReactNode } from "react";

import { isJudge } from "@/components/friend-groups/friend-group-shell";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

/**
 * Gates deck-check pages behind the feature flag and the judge+ role (the
 * PII boundary: plain members never see entrant names, emails, or lists).
 * @returns The children, or a not-available message.
 */
export function DeckCheckGuard({
  data,
  children,
}: {
  data: FriendGroupDetailResponse;
  children: ReactNode;
}) {
  const enabled = useFeatureEnabled("deck-check");
  if (!enabled) {
    return <p className="text-muted-foreground">This feature is not available yet.</p>;
  }
  if (!isJudge(data.viewerRole)) {
    return (
      <p className="text-muted-foreground">
        Events are visible to judges only. Ask a group admin to make you a judge.
      </p>
    );
  }
  return children;
}
