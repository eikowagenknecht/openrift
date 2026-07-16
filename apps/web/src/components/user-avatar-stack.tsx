import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export interface UserAvatarStackMember {
  userId: string;
  userName: string | null;
  userImage: string | null;
  gravatarHash: string;
}

/**
 * A row of overlapping profile avatars with a "+N" overflow count — the app's
 * one way to show "who's here" at a glance (group tiles, invite callouts, the
 * members stat card). Pass `totalCount` when `members` is only a preview of a
 * larger roster; the overflow count shows the difference.
 *
 * `avatarClassName` sets the ring/backdrop per surface (e.g. `ring-card
 * bg-card` on cards, `ring-background bg-background` on the page ground) so
 * the overlap cutout matches whatever the stack sits on.
 *
 * @returns The avatar stack element.
 */
export function UserAvatarStack({
  members,
  totalCount,
  size,
  className,
  avatarClassName,
}: {
  members: UserAvatarStackMember[];
  /** Roster size when `members` is a truncated preview. */
  totalCount?: number;
  size?: "default" | "sm" | "lg";
  className?: string;
  avatarClassName?: string;
}) {
  const extra = Math.max(0, (totalCount ?? members.length) - members.length);
  return (
    // sm avatars overlap 4px instead of 8px: at size-6 the deeper overlap eats
    // the second letter of initials-only members.
    <span
      className={cn("flex items-center", size === "sm" ? "-space-x-1" : "-space-x-2", className)}
    >
      {members.map((member) => (
        <UserAvatar
          key={member.userId}
          image={member.userImage}
          name={member.userName}
          gravatarHash={member.gravatarHash}
          size={size}
          className={cn("bg-card ring-card ring-2", avatarClassName)}
        />
      ))}
      {extra > 0 && (
        <span className="text-muted-foreground pl-3 text-xs tabular-nums">+{extra}</span>
      )}
    </span>
  );
}
