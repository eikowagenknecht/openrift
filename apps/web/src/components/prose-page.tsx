import type { ReactNode } from "react";

import { PAGE_PADDING } from "@/lib/utils";

/**
 * Article wrapper for long-form prose pages (legal notice, privacy policy).
 * Owns the shared `prose` typography styling and page width so the legal
 * pages don't each repeat the class string.
 * @returns The styled article element wrapping `children`.
 */
export function ProsePage({ children }: { children: ReactNode }) {
  return (
    <article
      className={`prose dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base mx-auto max-w-2xl ${PAGE_PADDING}`}
    >
      {children}
    </article>
  );
}
