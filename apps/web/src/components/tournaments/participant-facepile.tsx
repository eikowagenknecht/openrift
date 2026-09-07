import type { TournamentParticipantPreview } from "@openrift/shared";

import { UserAvatarStack } from "@/components/user-avatar-stack";

interface ParticipantFacepileProps {
  preview: TournamentParticipantPreview[];
  totalCount: number;
  size?: "sm" | "default";
  className?: string;
}

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
