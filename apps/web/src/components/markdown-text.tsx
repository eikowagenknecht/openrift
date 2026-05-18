import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "a", "em", "strong", "code", "ul", "ol", "li", "br"];

const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "riftdecks.com",
  "www.riftdecks.com",
  "piltoverarchive.com",
  "www.piltoverarchive.com",
]);

function isAllowedLinkHref(href: string | undefined): boolean {
  if (!href) {
    return false;
  }
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return ALLOWED_LINK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children, ...rest }) => {
    if (!isAllowedLinkHref(href)) {
      return <span>{children}</span>;
    }
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
};

/** Renders untrusted plain text as a constrained markdown subset.
 * Supports inline formatting and links; external links open in a new tab
 * with `rel="noreferrer nofollow ugc"`. Block elements like headings,
 * images, tables, and raw HTML are stripped. Link hrefs outside the
 * curated allowlist are dropped — the link text remains visible but is
 * no longer clickable.
 * @returns The rendered markdown tree.
 */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 [&_a]:underline [&_a]:underline-offset-2", className)}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        rehypePlugins={[
          [rehypeExternalLinks, { target: "_blank", rel: ["noreferrer", "nofollow", "ugc"] }],
        ]}
        components={MARKDOWN_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
