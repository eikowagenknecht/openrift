import { formatRuleNumber } from "@openrift/shared/rules";
import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { copyTextToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { HastNode, MdNode } from "@/lib/rules-markdown";
import {
  diffRuleMarkdown,
  preprocessRuleMarkdown,
  rehypeHighlightPenalties,
  remarkLinkifyRuleReferences,
} from "@/lib/rules-markdown";
import { cn } from "@/lib/utils";
import { useRulesSearchStore } from "@/stores/rules-search-store";

// Re-exported from @openrift/shared: the Discord bot's /rule command uses these too.
export { buildTermAnchors, formatRuleNumber } from "@openrift/shared/rules";

export async function copyRuleLink(ruleNumber: string): Promise<void> {
  const url = `${globalThis.location.origin}${globalThis.location.pathname}#rule-${ruleNumber}`;
  try {
    await copyTextToClipboard(url);
    toast.success(`Link to rule ${formatRuleNumber(ruleNumber)} copied`);
  } catch {
    toast.error("Could not copy link");
  }
}

const TERM_TRAILING_PUNCT_REGEX = /[.,:;]+$/u;
// Strip a possessive 's (straight or curly apostrophe) so "*Card's*" resolves
// to the "Card" anchor.
const TERM_POSSESSIVE_REGEX = /['‘’]s$/u;

interface TermLinkContext {
  anchors: ReadonlyMap<string, string>;
  currentRuleNumber?: string;
}

function visitEmphasisForTerms(node: MdNode, context: TermLinkContext): void {
  if (!node.children) {
    return;
  }
  for (const [index, child] of node.children.entries()) {
    if (child.type === "link") {
      continue;
    }
    if (child.type === "emphasis" && child.children?.length === 1) {
      const inner = child.children[0];
      if (inner?.type === "text" && typeof inner.value === "string") {
        const stripped = inner.value
          .trim()
          .replace(TERM_TRAILING_PUNCT_REGEX, "")
          .replace(TERM_POSSESSIVE_REGEX, "");
        const target = context.anchors.get(stripped.toLowerCase());
        if (target && target !== context.currentRuleNumber) {
          node.children[index] = {
            type: "link",
            url: `#rule-${target}`,
            children: [child],
          };
          continue;
        }
      }
    }
    visitEmphasisForTerms(child, context);
  }
}

function makeRemarkLinkifyTerms(context: TermLinkContext) {
  return () => (tree: MdNode) => {
    if (context.anchors.size === 0) {
      return;
    }
    visitEmphasisForTerms(tree, context);
  };
}

// Stable empty-map reference for callers that don't supply term anchors.
export const EMPTY_TERM_ANCHORS: ReadonlyMap<string, string> = new Map();

// Tournament penalty labels — matched as literal `[Label]` strings inside rule
// bodies and styled with the IPG-derived color codes.
const PENALTY_STYLES: Record<string, string> = {
  Warning: "bg-[#ffe599] text-black",
  Warnings: "bg-[#ffe599] text-black",
  "Game Loss": "bg-[#f9cb9c] text-black",
  "No Penalty": "bg-[#cccccc] text-black",
  "Match Loss": "bg-[#ea9999] text-black",
  Disqualification: "bg-[#990000] text-white",
};

function handleSamePageAnchorClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.defaultPrevented || event.button !== 0) {
    return;
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const targetId = href.slice(1);
  if (!targetId) {
    return;
  }
  // Rule IDs contain dots (e.g. `rule-540.4.b`); escape so CSS doesn't read
  // them as class separators.
  const targetSelector = `#${CSS.escape(targetId)}`;
  if (document.querySelector(targetSelector)) {
    return;
  }
  // The rule is filtered out by an active search: reset it, then scroll and
  // pushState (not replaceState) so browser back returns to where we were.
  event.preventDefault();
  flushSync(() => {
    useRulesSearchStore.getState().reset();
  });
  const target = document.querySelector(targetSelector);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start" });
    history.pushState(null, "", href);
  }
}

function RuleMarkdownAnchor({ href, children }: { href?: string; children?: ReactNode }) {
  if (typeof href === "string" && href.startsWith("#")) {
    return (
      <a
        href={href}
        className="text-primary hover:underline"
        onClick={(event) => handleSamePageAnchorClick(event, href)}
      >
        {children}
      </a>
    );
  }
  if (typeof href === "string" && href.startsWith("/rules/core#")) {
    const hash = href.slice("/rules/core#".length);
    return (
      <Link
        to="/rules/$kind"
        params={{ kind: "core" }}
        hash={hash}
        className="text-primary hover:underline"
      >
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}

function RuleMarkdownSpan({
  penalty,
  diff,
  children,
}: {
  penalty?: string;
  diff?: string;
  children?: ReactNode;
}) {
  if (penalty && PENALTY_STYLES[penalty]) {
    return (
      <span
        className={cn("rounded-md px-1.5 py-0.5 text-sm font-semibold", PENALTY_STYLES[penalty])}
      >
        {children}
      </span>
    );
  }
  if (diff === "added") {
    return <mark className="bg-success-soft text-success rounded-xs px-0.5">{children}</mark>;
  }
  if (diff === "removed") {
    return (
      <span className="bg-destructive/10 text-destructive rounded-xs px-0.5 line-through decoration-from-font">
        {children}
      </span>
    );
  }
  return <span>{children}</span>;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => <RuleMarkdownAnchor href={href}>{children}</RuleMarkdownAnchor>,
  span: ({ children, ...props }) => (
    <RuleMarkdownSpan
      penalty={(props as { "data-penalty"?: string })["data-penalty"]}
      diff={(props as { "data-diff"?: string })["data-diff"]}
    >
      {children}
    </RuleMarkdownSpan>
  ),
};

const ALLOWED_MARKDOWN_ELEMENTS = ["em", "strong", "code", "a", "br", "span"];

// Stable references — re-creating these arrays each render busts ReactMarkdown's
// memoization, forcing a full remark/rehype reparse for every rule on every keystroke.
const REMARK_PLUGINS = [remarkLinkifyRuleReferences];
const REHYPE_PLUGINS = [rehypeHighlightPenalties];

// Renders a rule's body as a constrained markdown subset, with rule-number
// references and (given `termAnchors`) italicized game terms auto-linked.
export function RuleContent({
  content,
  termAnchors,
  ruleNumber,
}: {
  content: string;
  termAnchors?: ReadonlyMap<string, string>;
  ruleNumber?: string;
}) {
  const processed = preprocessRuleMarkdown(content);
  // termAnchors non-empty: append the term linkifier so it can skip self-links.
  // The compiler memoizes this array, keeping ReactMarkdown's parse cache warm.
  const remarkPlugins =
    termAnchors && termAnchors.size > 0
      ? [
          remarkLinkifyRuleReferences,
          makeRemarkLinkifyTerms({ anchors: termAnchors, currentRuleNumber: ruleNumber }),
        ]
      : REMARK_PLUGINS;
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
      allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      skipHtml
    >
      {processed}
    </ReactMarkdown>
  );
}

const VERSION_COMMENT_MARKDOWN_ELEMENTS = [
  "p",
  "em",
  "strong",
  "code",
  "a",
  "br",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "hr",
];

const VERSION_COMMENT_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 ml-6 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-6 list-decimal">{children}</ol>,
  h2: ({ children }) => <h2 className="font-heading mt-3 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 font-semibold">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3">
      {children}
    </blockquote>
  ),
};

export function VersionComments({ markdown }: { markdown: string }) {
  return (
    <div className="bg-muted/30 mb-4 rounded-md border p-3">
      <ReactMarkdown
        components={VERSION_COMMENT_COMPONENTS}
        allowedElements={VERSION_COMMENT_MARKDOWN_ELEMENTS}
        unwrapDisallowed
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

// Renders one node of the merged diff tree produced by `diffRuleMarkdown`.
function renderDiffNode(node: HastNode, key: number): ReactNode {
  if (node.type === "text") {
    return node.value ?? "";
  }
  const children = (node.children ?? []).map((child, index) => renderDiffNode(child, index));
  switch (node.tagName) {
    case "br": {
      return <br key={key} />;
    }
    case "em": {
      return <em key={key}>{children}</em>;
    }
    case "strong": {
      return <strong key={key}>{children}</strong>;
    }
    case "code": {
      return <code key={key}>{children}</code>;
    }
    case "a": {
      const href = node.properties?.href;
      return (
        <RuleMarkdownAnchor key={key} href={typeof href === "string" ? href : undefined}>
          {children}
        </RuleMarkdownAnchor>
      );
    }
    default: {
      const penalty = node.properties?.["data-penalty"];
      const diff = node.properties?.["data-diff"];
      return (
        <RuleMarkdownSpan
          key={key}
          penalty={typeof penalty === "string" ? penalty : undefined}
          diff={typeof diff === "string" ? diff : undefined}
        >
          {children}
        </RuleMarkdownSpan>
      );
    }
  }
}

// Both texts are parsed through the full markdown pipeline and diffed
// structurally, so emphasis, links and penalty badges survive the diff.
export function InlineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const nodes = diffRuleMarkdown(oldText, newText);
  return <>{nodes.map((node, index) => renderDiffNode(node, index))}</>;
}
