import { isAllowedLinkUrl } from "@openrift/shared";
import type { ReactNode } from "react";
import { isValidElement } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "a", "em", "strong", "code", "ul", "ol", "li", "br"];

const HEADING_ELEMENTS = ["h1", "h2", "h3"];

const CARD_HREF_PREFIX = "#card=";

function expandCardLinks(text: string): string {
  return text.replaceAll(
    /\[\[(?<name>[^[\]\n]{1,80})\]\]/gu,
    (_match, name: string) =>
      `[${name.trim()}](${CARD_HREF_PREFIX}${encodeURIComponent(name.trim())})`,
  );
}

function isAllowedLinkHref(href: string | undefined): boolean {
  return href !== undefined && isAllowedLinkUrl(href);
}

function linkHost(href: string | undefined): string | null {
  if (href === undefined) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

const HOSTNAME_CHAR = /[a-z0-9.-]/u;

/**
 * `www.` is dropped before matching, since it's the same site; the boundary
 * check stops `evil.example.com` passing itself off as `evil.example`.
 */
function namesHost(text: string, host: string): boolean {
  const haystack = text.toLowerCase().replaceAll("www.", "");
  for (let from = 0; ;) {
    const at = haystack.indexOf(host, from);
    if (at === -1) {
      return false;
    }
    const before = haystack[at - 1] ?? "";
    const after = haystack[at + host.length] ?? "";
    if (!HOSTNAME_CHAR.test(before) && !HOSTNAME_CHAR.test(after)) {
      return true;
    }
    from = at + host.length;
  }
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child: ReactNode) => nodeText(child)).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

export type RenderCardLink = (name: string, children: React.ReactNode) => React.ReactElement;

/**
 * `links`: "allowlist" (default) drops non-allowlisted hrefs, "labeled" allows any
 * host but appends it, "any" allows any host bare (admin-curated content only).
 */
export function MarkdownText({
  text,
  className,
  links = "allowlist",
  headings = false,
  renderCardLink,
}: {
  text: string;
  className?: string;
  links?: "allowlist" | "labeled" | "any";
  headings?: boolean;
  renderCardLink?: RenderCardLink;
}) {
  const allowlisted = links === "allowlist";
  const components: Components | undefined =
    renderCardLink || links !== "any"
      ? {
          // oxlint-disable-next-line react/no-unstable-nested-components -- built inline to close over link mode and renderCardLink
          a: ({ href, children, ...rest }) => {
            if (renderCardLink && href?.startsWith(CARD_HREF_PREFIX)) {
              return renderCardLink(
                decodeURIComponent(href.slice(CARD_HREF_PREFIX.length)),
                children,
              );
            }
            if (allowlisted && !isAllowedLinkHref(href)) {
              return <span>{children}</span>;
            }
            const anchor = (
              <a href={href} {...rest}>
                {children}
              </a>
            );
            const host = links === "labeled" ? linkHost(href) : null;
            if (host === null || namesHost(nodeText(children), host)) {
              return anchor;
            }
            return (
              <>
                {anchor}
                <span className="text-muted-foreground"> ({host})</span>
              </>
            );
          },
        }
      : undefined;

  return (
    <div
      className={cn(
        // Tailwind's preflight strips list markers and indentation, so the
        // ul/ol/li we allow through would otherwise render as bare lines.
        "space-y-2 [&_a]:underline [&_a]:underline-offset-2 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        headings &&
          "[&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h1:first-child]:mt-0 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_h3]:mt-3 [&_h3]:font-medium [&_h3:first-child]:mt-0",
        className,
      )}
    >
      <ReactMarkdown
        allowedElements={headings ? [...ALLOWED_ELEMENTS, ...HEADING_ELEMENTS] : ALLOWED_ELEMENTS}
        unwrapDisallowed
        skipHtml
        rehypePlugins={[
          [rehypeExternalLinks, { target: "_blank", rel: ["noreferrer", "nofollow", "ugc"] }],
        ]}
        components={components}
      >
        {renderCardLink ? expandCardLinks(text) : text}
      </ReactMarkdown>
    </div>
  );
}
