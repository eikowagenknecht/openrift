import type { FriendGroupDetailResponse } from "@openrift/shared";
import { formatRelativeTime } from "@openrift/shared";
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";

import { ActionBand } from "@/components/ui/action-band";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useAcceptFriendGroupInvite, useDeclineFriendGroupInvite } from "@/hooks/use-friend-groups";

/**
 * The pending join requests as an accented action band (the overview's
 * trades-hub treatment): a headline count, then one row per request with
 * inline approve / deny. Rendered on both the group overview and the members
 * page, so an admin can act wherever the "N requests to review" badge led
 * them. Call sites own the admin + non-empty gate.
 * @returns The requests band.
 */
export function PendingRequestsBand({
  slug,
  requests,
}: {
  slug: string;
  requests: FriendGroupDetailResponse["pendingRequests"];
}) {
  const acceptInvite = useAcceptFriendGroupInvite();
  const declineInvite = useDeclineFriendGroupInvite();
  return (
    <ActionBand
      icon={UserPlusIcon}
      accent
      label="Requests"
      value={requests.length}
      sub={`${requests.length === 1 ? "person" : "people"} waiting to join`}
    >
      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="bg-muted flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <UserAvatar
              image={req.userImage}
              name={req.userName}
              gravatarHash={req.gravatarHash}
              size="sm"
              className="size-7"
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{req.userName ?? "Unknown user"}</span>
              <span className="text-muted-foreground">
                {" "}
                · requested {formatRelativeTime(req.createdAt)}
              </span>
            </span>
            <Button
              size="sm"
              onClick={() => acceptInvite.mutate({ slug, userId: req.userId })}
              disabled={acceptInvite.isPending}
            >
              <CheckIcon className="size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => declineInvite.mutate({ slug, userId: req.userId })}
              disabled={declineInvite.isPending}
            >
              <XIcon className="size-4" />
              Deny
            </Button>
          </div>
        ))}
      </div>
    </ActionBand>
  );
}
