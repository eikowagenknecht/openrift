import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { HandshakeIcon, MessageCircleIcon, XIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRequiredUserId } from "@/lib/auth-session";
import type { GroupNudgeKind } from "@/stores/onboarding-store";
import { groupNudgeKey, useOnboardingStore } from "@/stores/onboarding-store";

/**
 * The two things a member has to set up before the group works for them:
 * a contact method the others can see, and at least one shared list. Both are
 * invisible omissions — nothing on the page looks broken, the member just
 * never shows up in anyone's matches — so the overview says so out loud.
 *
 * Returns the kinds that are still missing. The viewer's membership row is
 * required: without it there is nothing to read a reveal state off, and the
 * detail payload is either still loading or the viewer isn't a member.
 * @returns The nudges that apply, in display order.
 */
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
  /** Anchor on the group's Manage page where the setting lives. */
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

/**
 * The dismissible setup nudges at the top of the group overview. Each one is
 * dismissed per group, so leaving it on one group doesn't hide the same gap on
 * another. Renders nothing once both are handled or dismissed.
 * @returns The nudge stack, or null.
 */
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
