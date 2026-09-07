import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { Link } from "@tanstack/react-router";
import { HandshakeIcon, MessageCircleIcon, XIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { GroupNudgeKind } from "@/features/account/stores/onboarding-store";
import { groupNudgeKey, useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { useRequiredUserId } from "@/lib/auth-session";

/** Empty when the viewer isn't in data.members yet (still loading, or not a member). */
export function pendingGroupNudges(
  data: FriendGroupDetailResponse,
  viewerId: string,
): GroupNudgeKind[] {
  const self = data.members.find((member) => member.userId === viewerId);
  if (!self) {
    return [];
  }
  const nudges: GroupNudgeKind[] = [];
  if (self.contactMethods.length === 0) {
    nudges.push("contacts");
  }
  if (!data.shares.some((share) => share.userId === viewerId)) {
    nudges.push("lists");
  }
  return nudges;
}

interface NudgeCopy {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  hash: string;
  actionLabel: string;
  helpLabel: string;
}

const NUDGE_COPY: Record<GroupNudgeKind, NudgeCopy> = {
  contacts: {
    icon: MessageCircleIcon,
    title: "Members can't reach you",
    description:
      "You aren't showing a contact method in this group, so nobody can arrange a swap with you once a match comes up.",
    hash: "contacts",
    actionLabel: "Choose your contacts",
    helpLabel: "How contacts work",
  },
  lists: {
    icon: HandshakeIcon,
    title: "This group can't see any of your lists",
    description:
      "Share a wishlist or tradelist and the group starts matching your wants against what other members are offering.",
    hash: "lists",
    actionLabel: "Share your lists",
    helpLabel: "How sharing works",
  },
};

export function GroupSetupNudges({
  slug,
  data,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
}) {
  const viewerId = useRequiredUserId();
  const dismissed = useOnboardingStore((state) => state.dismissedGroupNudges);
  const dismiss = useOnboardingStore((state) => state.dismissGroupNudge);

  const kinds = pendingGroupNudges(data, viewerId).filter(
    (kind) => !dismissed.includes(groupNudgeKey(slug, kind)),
  );
  if (kinds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {kinds.map((kind) => {
        const copy = NUDGE_COPY[kind];
        return (
          <Alert key={kind} variant="info">
            <copy.icon />
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <span>{copy.description}</span>
              <span className="flex flex-wrap items-center gap-x-3">
                <Link to="/groups/$slug/manage" params={{ slug }} hash={copy.hash}>
                  {copy.actionLabel}
                </Link>
                <Link to="/help/$slug" params={{ slug: "groups" }}>
                  {copy.helpLabel}
                </Link>
              </span>
            </AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => dismiss(slug, kind)}
                aria-label={`Dismiss "${copy.title}"`}
              >
                <XIcon className="size-4" />
              </Button>
            </AlertAction>
          </Alert>
        );
      })}
    </div>
  );
}
