import { isAllowedLinkUrl } from "@openrift/shared";
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
export function expandCardLinks(text: string): string {
  return text.replaceAll(
    /\[\[(?<name>[^[\]\n]{1,80})\]\]/gu,
    (_match, name: string) =>
      `[${name.trim()}](${CARD_HREF_PREFIX}${encodeURIComponent(name.trim())})`,
  );
}

function isAllowedLinkHref(href: string | undefined): boolean {
  return href !== undefined && isAllowedLinkUrl(href);
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
 * Treats `text` as untrusted by default: link hrefs outside the shared host
 * allowlist (`link-hosts.ts`, also used by deck links) are dropped — the link
 * text stays visible but is no longer clickable. Pass `trusted` for
 * admin-curated content where any http(s) host should be linkable.
 *
 * With `renderCardLink`, `[[Card Name]]` spans become card references
 * rendered through the callback (deck descriptions); without it they stay
 * literal text.
 * @returns The rendered markdown tree.
 */
export function MarkdownText({
  text,
  className,
  trusted = false,
  headings = false,
  renderCardLink,
}: {
  text: string;
  className?: string;
  /** When true, skips the host allowlist. Only use for admin-curated content. */
  trusted?: boolean;
  /** Allow h1-h3, styled as compact section headings. */
  headings?: boolean;
  /** Turns `[[Card Name]]` spans into card references. */
  renderCardLink?: RenderCardLink;
}) {
  const components: Components | undefined =
    renderCardLink || !trusted
      ? {
          // react-markdown takes a components map, so the renderer has to be
          // built here to close over trusted/renderCardLink; the compiler
          // memoizes it against both.
          // oxlint-disable-next-line react/no-unstable-nested-components -- see above
          a: ({ href, children, ...rest }) => {
            if (renderCardLink && href?.startsWith(CARD_HREF_PREFIX)) {
              return renderCardLink(
                decodeURIComponent(href.slice(CARD_HREF_PREFIX.length)),
                children,
              );
            }
            if (!trusted && !isAllowedLinkHref(href)) {
              return <span>{children}</span>;
            }
            return (
              <a href={href} {...rest}>
                {children}
              </a>
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
