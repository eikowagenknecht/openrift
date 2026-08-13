import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { UserAvatar } from "@/components/user-avatar";

/**
 * The one-line person header shared by the pages that are "about a person":
 * the trade sheet and the group member page. One style so the header doesn't
 * jump as the viewer navigates between the two: a size-12 avatar, the name at
 * heading level 2's face (these pages are about a person, not a product, and
 * the page-title size would shout their name across a page whose job is the
 * content under it), and one chip line below the name.
 * @param children The chip line under the name (badges, contact chips).
 * @param actions Right-aligned header actions (buttons, overflow menu).
 * @returns The header row.
 */
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
