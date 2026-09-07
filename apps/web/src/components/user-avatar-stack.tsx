import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export interface UserAvatarStackMember {
  userId: string;
  userName: string | null;
  userImage: string | null;
  gravatarHash: string;
}

export function UserAvatarStack({
  members,
  totalCount,
  size,
  className,
  avatarClassName,
}: {
  members: UserAvatarStackMember[];
  totalCount?: number;
  size?: "default" | "sm" | "lg";
  className?: string;
  avatarClassName?: string;
}) {
  const extra = Math.max(0, (totalCount ?? members.length) - members.length);
  return (
    // sm avatars overlap 4px, not 8px: at size-6 the deeper overlap eats the
    // second letter of initials-only members.
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
