import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { gravatarUrlFromHash } from "@/lib/gravatar";
import { getUserInitials } from "@/lib/user-initials";

interface UserAvatarProps {
  image?: string | null;
  name?: string | null;
  gravatarHash?: string | null;
  email?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}

/** Falls through image → Gravatar (if a hash is given) → initials. */
export function UserAvatar({ image, name, gravatarHash, email, size, className }: UserAvatarProps) {
  const [imageBroken, setImageBroken] = useState(false);
  const [lastImage, setLastImage] = useState(image);
  if (image !== lastImage) {
    setLastImage(image);
    setImageBroken(false);
  }

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
