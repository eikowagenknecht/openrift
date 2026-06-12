import type { FriendGroupDetailResponse } from "@openrift/shared";
import type { ReactNode } from "react";

import { isJudge } from "@/components/friend-groups/friend-group-shell";

/**
 * Gates deck-check pages behind the judge+ role (the PII boundary: plain
 * members never see entrant names, emails, or lists).
 * @returns The children, or a not-available message.
 */
export function DeckCheckGuard({
  data,
  children,
}: {
  data: FriendGroupDetailResponse;
  children: ReactNode;
}) {
  if (!isJudge(data.viewerRole)) {
    return (
      <p className="text-muted-foreground">
        Events are visible to judges only. Ask a group admin to make you a judge.
      </p>
    );
  }
  return children;
}
