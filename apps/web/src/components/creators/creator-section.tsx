import type { ReactNode } from "react";

import { Heading } from "@/components/heading";

/**
 * A tool's section on /creators, and the anchor its tile links to.
 *
 * The scroll margin clears both sticky bars above it (the global header plus
 * the page top bar), so a tile click lands the heading below them rather than
 * underneath them.
 *
 * @returns The section element.
 */
export function CreatorSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-[calc(var(--header-height)+4rem)] flex-col gap-3">
      <Heading level={2}>{title}</Heading>
      {children}
    </section>
  );
}
