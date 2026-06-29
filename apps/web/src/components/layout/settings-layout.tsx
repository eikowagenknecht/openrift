import type { ReactNode } from "react";

import { PageToc } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import { cn } from "@/lib/utils";

/**
 * Two-column settings shell: a sticky {@link PageToc} sidebar (desktop only)
 * beside a single content column of stacked {@link SettingsGroup}s. Shared by
 * the profile page and the tournament settings tab so both read the same way.
 * The caller owns the outer page padding and max width (pass it via
 * `className`); on a page that already centers its content (e.g. inside a
 * section frame) just drop this in as the single child.
 * @returns The TOC-plus-column layout.
 */
export function SettingsLayout({
  toc,
  children,
  className,
}: {
  toc: PageTocItem[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full gap-6", className)}>
      <PageToc items={toc} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}
