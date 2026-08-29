import { isAllowedLinkUrl } from "@openrift/shared";
import type { ReactNode } from "react";
import { isValidElement } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";

import { cn } from "@/lib/utils";

const ALLOWED_ELEMENTS = ["p", "a", "em", "strong", "code", "ul", "ol", "li", "br"];

/** Heading levels available to primer-style surfaces (deck descriptions). */
const HEADING_ELEMENTS = ["h1", "h2", "h3"];

/**
 * Internal href scheme carrying a `[[Card Name]]` reference through the
 * markdown pipeline. Never rendered as a real link — the `a` component
 * intercepts it and hands the name to `renderCardLink`.
 */
const CARD_HREF_PREFIX = "#card=";

/**
 * Rewrites `[[Card Name]]` spans into markdown links on the internal card
 * href, so the markdown parser carries them as regular links.
 * Percent-encoding keeps names with parentheses inside the link target.
 * @returns The text with card spans expanded.
 */
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

/**
 * The bare hostname an http(s) link points at, `www.` stripped.
 * @returns The hostname, or null for a relative, malformed, or non-web href.
 */
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

/** Characters that can continue a hostname, so a match mid-domain isn't one. */
const HOSTNAME_CHAR = /[a-z0-9.-]/u;

/**
 * Whether `text` already names `host` as a whole domain. A written `www.` is
 * dropped first, since it is the same site. The boundary check is what stops
 * `evil.example.com` from passing itself off as a mention of `evil.example`.
 * @returns True when the host appears in the text.
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

/**
 * The visible text of a rendered markdown node, so a link's own label can be
 * checked for the host it points at.
 * @returns The concatenated text.
 */
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

/** Renders a resolved `[[Card Name]]` reference. */
export type RenderCardLink = (name: string, children: React.ReactNode) => React.ReactElement;

/** Renders plain text as a constrained markdown subset.
 *
 * Supports inline formatting and links; external links open in a new tab
 * with `rel="noreferrer nofollow ugc"`. Block elements like images, tables,
 * and raw HTML are stripped; headings only render when `headings` is set
 * (primer-style surfaces).
 *
 * The `links` mode decides how far a link may point:
 * - `"allowlist"` (default) holds hrefs to the shared host allowlist
 *   (`link-hosts.ts`, also used by deck links). One outside it is dropped, so
 *   the text stays visible but is no longer clickable. For anything a
 *   stranger can reach, where an open URL field would be a spam vector.
 * - `"labeled"` accepts any web host but appends the destination host after
 *   the link, unless the link's own text already names it. For user-written
 *   text whose reach is bounded by membership rather than by the allowlist,
 *   where the risk left is a label that lies about where it goes.
 * - `"any"` accepts any web host bare. Admin-curated content only.
 *
 * With `renderCardLink`, `[[Card Name]]` spans become card references
 * rendered through the callback (deck descriptions); without it they stay
 * literal text.
 * @returns The rendered markdown tree.
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
  /** How far a link may point, and whether its destination is shown. */
  links?: "allowlist" | "labeled" | "any";
  /** Allow h1-h3, styled as compact section headings. */
  headings?: boolean;
  /** Turns `[[Card Name]]` spans into card references. */
  renderCardLink?: RenderCardLink;
}) {
  const allowlisted = links === "allowlist";
  const components: Components | undefined =
    renderCardLink || links !== "any"
      ? {
          // react-markdown takes a components map, so the renderer has to be
          // built here to close over the link mode and renderCardLink; the
          // compiler memoizes it against both.
          // oxlint-disable-next-line react/no-unstable-nested-components -- see above
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
