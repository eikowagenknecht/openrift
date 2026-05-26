import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "a", "em", "strong", "code", "ul", "ol", "li", "br"];

const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "riftdecks.com",
  "piltoverarchive.com",
  "openrift.app",
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

const UNTRUSTED_COMPONENTS: Components = {
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

/** Renders plain text as a constrained markdown subset.
 *
 * Supports inline formatting and links; external links open in a new tab
 * with `rel="noreferrer nofollow ugc"`. Block elements like headings,
 * images, tables, and raw HTML are stripped.
 *
 * Treats `text` as untrusted by default: link hrefs outside the curated
 * host allowlist are dropped (the link text stays visible but is no
 * longer clickable). Pass `trusted` for admin-curated content where any
 * http(s) host should be linkable.
 * @returns The rendered markdown tree.
 */
export function MarkdownText({
  text,
  className,
  trusted = false,
}: {
  text: string;
  className?: string;
  /** When true, skips the host allowlist. Only use for admin-curated content. */
  trusted?: boolean;
}) {
  return (
    <div className={cn("space-y-2 [&_a]:underline [&_a]:underline-offset-2", className)}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        rehypePlugins={[
          [rehypeExternalLinks, { target: "_blank", rel: ["noreferrer", "nofollow", "ugc"] }],
        ]}
        components={trusted ? undefined : UNTRUSTED_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
