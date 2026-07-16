import type { TournamentParticipantPreview } from "@openrift/shared";

import { UserAvatarStack } from "@/components/user-avatar-stack";

interface ParticipantFacepileProps {
  preview: TournamentParticipantPreview[];
  /** The tournament's full participant count; the overflow count shows the rest. */
  totalCount: number;
  size?: "sm" | "default";
  className?: string;
}

/**
 * The tournament summary's participant preview adapted onto the app's
 * standard {@link UserAvatarStack}. Participants without a linked account get
 * an initials avatar (no image, no Gravatar).
 *
 * @returns The avatar stack, or null when there are no participants.
 */
export function ParticipantFacepile({
  preview,
  totalCount,
  size = "default",
  className,
}: ParticipantFacepileProps) {
  if (preview.length === 0) {
    return null;
  }
  return (
    <UserAvatarStack
      members={preview.map((participant, index) => ({
        // Previews are positional (an unlinked walk-in has no user id).
        userId: `${index}-${participant.name}`,
        userName: participant.name,
        userImage: participant.image,
        gravatarHash: participant.gravatarHash ?? "",
      }))}
      totalCount={totalCount}
      size={size}
      className={className}
    />
  );
}
