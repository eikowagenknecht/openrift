import type { TournamentParticipantPreview } from "@openrift/shared";

import { UserAvatar } from "@/components/user-avatar";

const CLUSTER_SPOTS = [
  { left: "50%", top: "40%", size: "lg" },
  { left: "31%", top: "28%", size: "default" },
  { left: "68%", top: "54%", size: "default" },
  { left: "25%", top: "64%", size: "sm" },
  { left: "73%", top: "26%", size: "sm" },
] as const;

/** Host element must be `position: relative`; children are absolutely positioned. */
export function HeroAvatarCluster({
  preview,
  totalCount,
}: {
  preview: TournamentParticipantPreview[];
  totalCount: number;
}) {
  const shown = preview.slice(0, CLUSTER_SPOTS.length);
  const overflow = totalCount - shown.length;
  return (
    <>
      {shown.map((participant, index) => {
        const spot = CLUSTER_SPOTS[index];
        return (
          <span
            key={`${participant.name}-${index}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: spot.left, top: spot.top }}
          >
            <UserAvatar
              name={participant.name}
              image={participant.image}
              gravatarHash={participant.gravatarHash}
              size={spot.size}
            />
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="bg-muted text-muted-foreground absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-medium"
          style={{ left: "58%", top: "74%" }}
        >
          +{overflow}
        </span>
      )}
    </>
  );
}
