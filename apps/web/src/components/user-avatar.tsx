import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { gravatarUrlFromHash } from "@/lib/gravatar";
import { getUserInitials } from "@/lib/user-initials";

interface UserAvatarProps {
  image?: string | null;
  name?: string | null;
  /** SHA-256 of the user's lowercased email — drives the Gravatar fallback. */
  gravatarHash?: string | null;
  /** Used for the initials fallback only; never leaked to the network. */
  email?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * Profile avatar with the chain image → Gravatar (when a hash is provided)
 * → initials. Falls through to Gravatar when an explicit image URL fails
 * to load.
 *
 * @returns A circular avatar.
 */
export function UserAvatar({ image, name, gravatarHash, email, size, className }: UserAvatarProps) {
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [image]);

  const primary =
    image && !imageBroken ? image : gravatarHash ? gravatarUrlFromHash(gravatarHash) : undefined;

  return (
    <Avatar size={size} className={className}>
      {primary && (
        <AvatarImage
          src={primary}
          alt={name ?? ""}
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error" && image && !imageBroken && primary === image) {
              setImageBroken(true);
            }
          }}
        />
      )}
      <AvatarFallback>{getUserInitials(name ?? undefined, email ?? undefined)}</AvatarFallback>
    </Avatar>
  );
}
