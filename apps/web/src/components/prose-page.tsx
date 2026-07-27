import type { ReactNode } from "react";

import { cn, PAGE_PADDING } from "@/lib/utils";

/**
 * Article wrapper for long-form prose pages (legal notice, privacy policy).
 * Owns the shared `prose` typography styling and page width so the legal
 * pages don't each repeat the class string.
 * @returns The styled article element wrapping `children`.
 */
export function ProsePage({ children }: { children: ReactNode }) {
  return (
    <article
      className={cn(
        "prose dark:prose-invert prose-h1:font-heading prose-h1:text-2xl prose-h1:font-bold prose-h2:font-heading prose-h2:text-lg prose-h2:font-semibold prose-h3:text-base prose-h3:font-semibold mx-auto max-w-2xl",
        PAGE_PADDING,
      )}
    >
      {children}
    </article>
  );
}
