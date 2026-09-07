import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { UserAvatar } from "@/components/user-avatar";

export function PersonPageHeader({
  image,
  name,
  gravatarHash,
  children,
  actions,
}: {
  image: string | null;
  name: string | null;
  gravatarHash: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar
          image={image}
          name={name}
          gravatarHash={gravatarHash}
          size="lg"
          className="size-12"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={2} as="h1" className="truncate">
            {name ?? "Unknown user"}
          </Heading>
          {children ? <div className="flex flex-wrap items-center gap-1.5">{children}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
