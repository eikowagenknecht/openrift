import type { ReactNode } from "react";

import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

// Nested inside the `capped` page width: `max-w-prose` here caps the line
// length inside it, which is narrower than the page column.
export function ProsePage({ children }: { children: ReactNode }) {
  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING)}>
      <article className="prose dark:prose-invert prose-h1:font-heading prose-h1:text-2xl prose-h1:font-bold prose-h2:font-heading prose-h2:text-lg prose-h2:font-semibold prose-h3:text-base prose-h3:font-semibold mx-auto max-w-prose">
        {children}
      </article>
    </div>
  );
}
