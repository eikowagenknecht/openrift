import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "a", "em", "strong", "code", "ul", "ol", "li", "br"];

/** Renders untrusted plain text as a constrained markdown subset.
 * Supports inline formatting and links; external links open in a new tab
 * with `rel="noreferrer"`. Block elements like headings, images, tables,
 * and raw HTML are stripped.
 * @returns The rendered markdown tree.
 */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 [&_a]:underline [&_a]:underline-offset-2", className)}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        rehypePlugins={[[rehypeExternalLinks, { target: "_blank", rel: ["noreferrer"] }]]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
