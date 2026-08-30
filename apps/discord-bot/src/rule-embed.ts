import type { RuleKind } from "@openrift/shared";
import { RULE_REFERENCE_REGEX, truncateWithEllipsis } from "@openrift/shared";
import type { APIEmbed } from "discord.js";

import { EMBED_COLOR } from "./card-embed.js";
import type { IndexedRule, RuleIndex } from "./rule-search.js";

const KIND_LABEL: Record<RuleKind, string> = { core: "Core Rules", tournament: "Tournament Rules" };

// Discord's embed description cap is 4096; leave headroom so the assembled
// parts (breadcrumb + body + sub-rule lines) never need a mid-link cut.
// Only ever cut whole sub-rules, never mid-sentence — the one exception is a
// single pathological rule body longer than BODY_LIMIT on its own.
const BODY_LIMIT = 3200;
const DESCRIPTION_LIMIT = 4000;

/**
 * The site link for a rule: the kind-level rules page (which redirects to the
 * latest version) with the rule's anchor, so links stay valid across imports.
 *
 * @returns The absolute URL.
 */
function ruleUrl(siteUrl: string, entry: IndexedRule): string {
  return `${siteUrl}/rules/${entry.kind}#rule-${entry.rule.ruleNumber}`;
}

/**
 * Wraps rule references (`rule 540`, `603.7`, `CR 116`) in markdown links to
 * their OpenRift anchors — the same matching the site uses, but with absolute
 * URLs since Discord has no same-page anchors. `CR` always targets the core
 * rules; other forms stay within the quoted rule's own kind.
 *
 * @returns The content with references linkified.
 */
export function linkifyRuleReferences(content: string, kind: RuleKind, siteUrl: string): string {
  // Fresh regex instance: the shared one is global/stateful across callers.
  const regex = new RegExp(RULE_REFERENCE_REGEX.source, "gu");
  return content.replace(
    regex,
    (match, keyword: string | undefined, dotted: string | undefined, bare: string | undefined) => {
      const number = dotted ?? bare;
      const targetKind = keyword === "CR" ? "core" : kind;
      return `[${match}](${siteUrl}/rules/${targetKind}#rule-${number})`;
    },
  );
}

/**
 * The context line above a rule body: the section heading directly above the
 * rule's block (in full — headings are short), then the bare numbers of the
 * existing numeric ancestors, e.g. `Game Objects › 120 › 120.1`. Never any
 * truncated prose: orientation comes from the heading and the numbers alone.
 * Without a heading the line is omitted entirely — ancestor numbers on their
 * own only repeat what the title citation already says.
 *
 * @returns The breadcrumb line, or undefined when no section heading sits
 * directly above the rule's block.
 */
export function ruleBreadcrumb(index: RuleIndex, entry: IndexedRule): string | undefined {
  // Section headings are sparse and don't nest reliably, so only a subtitle
  // sitting directly above the rule's own block counts as its heading — a
  // heading half the document away would be misleading context. (A subtitle
  // entry itself gets no heading part: the preceding subtitle is a sibling.)
  if (entry.rule.ruleType !== "text") {
    return undefined;
  }
  const ancestors: IndexedRule[] = [];
  const segments = entry.number.split(".");
  for (let depth = 1; depth < segments.length; depth++) {
    const ancestorNumber = segments.slice(0, depth).join(".");
    const ancestor = index.byKey.get(`${entry.prefix.toLowerCase()} ${ancestorNumber}`);
    if (ancestor) {
      ancestors.push(ancestor);
    }
  }
  const blockStart = ancestors[0] ?? entry;
  const previous = index.entries[index.entries.indexOf(blockStart) - 1];
  if (!previous || previous.kind !== entry.kind || previous.rule.ruleType !== "subtitle") {
    return undefined;
  }
  return [previous.plain, ...ancestors.map((ancestor) => ancestor.number)].join(" › ");
}

// All descendants of a rule (any depth), in document order.
function descendants(index: RuleIndex, entry: IndexedRule): IndexedRule[] {
  return index.entries.filter(
    (candidate) =>
      candidate.kind === entry.kind && candidate.numberLower.startsWith(`${entry.numberLower}.`),
  );
}

// A core-rules subtitle has no numeric children — its section is the run of
// rules that follow it, up to the next subtitle. (Tournament subtitles DO
// nest their section under their own number; `descendants` covers those.)
function sectionRules(index: RuleIndex, entry: IndexedRule): IndexedRule[] {
  const position = index.entries.indexOf(entry);
  const section: IndexedRule[] = [];
  for (let i = position + 1; i < index.entries.length; i++) {
    const candidate = index.entries[i];
    if (candidate.kind !== entry.kind || candidate.rule.ruleType === "subtitle") {
      break;
    }
    section.push(candidate);
  }
  return section;
}

// Adds full-text sub-rule list items while they fit the description budget.
// Rules are only ever dropped whole (with a closing "…and N more" line),
// never cut mid-sentence. Each rule becomes a markdown bullet indented by its
// depth below `base`, so the numbering hierarchy reads as a nested list;
// newlines inside a rule (example blocks) are indented along, keeping them
// attached to their bullet.
function subRuleLines(
  rules: IndexedRule[],
  base: IndexedRule,
  siteUrl: string,
  budget: number,
): string[] {
  const basePrefix = `${base.numberLower}.`;
  const baseSegments = base.number.split(".").length;
  const lines: string[] = [];
  let used = 0;
  for (const rule of rules) {
    const segments = rule.number.split(".").length;
    // Numeric descendants indent relative to the selected rule; a core-style
    // section (whose rules don't share the heading's number) indents by each
    // rule's own depth.
    const depth = rule.numberLower.startsWith(basePrefix)
      ? segments - baseSegments - 1
      : segments - 1;
    const indent = "  ".repeat(Math.max(0, depth));
    const content = linkifyRuleReferences(rule.rule.content, rule.kind, siteUrl).replaceAll(
      "\n",
      `\n${indent}  `,
    );
    const line = `${indent}- **${rule.number}** ${content}`;
    if (used + line.length + 1 > budget - 40) {
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  const remaining = rules.length - lines.length;
  if (remaining > 0) {
    lines.push(`*…and ${remaining} more on OpenRift*`);
  }
  return lines;
}

export interface RuleEmbedInput {
  entry: IndexedRule;
  index: RuleIndex;
  siteUrl: string;
}

/**
 * Builds the reply embed for a rule: the `CR 103.2`-style citation linking to
 * the rule's anchor on OpenRift, a heading-and-numbers breadcrumb, then the
 * whole block in full — the rule text plus every descendant (or, for a
 * section heading, the section's rules), references linkified, sub-rules only
 * ever dropped whole when the embed budget runs out — and the ruleset version
 * in the footer.
 *
 * @returns A plain APIEmbed ready to send.
 */
export function buildRuleEmbed(input: RuleEmbedInput): APIEmbed {
  const { entry, index, siteUrl } = input;
  const isHeading = entry.rule.ruleType !== "text";

  const parts: string[] = [];
  const breadcrumb = ruleBreadcrumb(index, entry);
  if (breadcrumb) {
    parts.push(`*${breadcrumb}*`);
  }
  if (!isHeading) {
    parts.push(
      truncateWithEllipsis(
        linkifyRuleReferences(entry.rule.content, entry.kind, siteUrl),
        BODY_LIMIT,
      ),
    );
  }
  const children = descendants(index, entry);
  const related = isHeading && children.length === 0 ? sectionRules(index, entry) : children;
  if (related.length > 0) {
    const budget = DESCRIPTION_LIMIT - parts.join("\n\n").length - 2;
    const lines = subRuleLines(related, entry, siteUrl, budget);
    if (lines.length > 0) {
      parts.push(lines.join("\n"));
    }
  }

  const citation = `${entry.prefix} ${entry.number}`;
  return {
    title: truncateWithEllipsis(isHeading ? `${citation} — ${entry.plain}` : citation, 256),
    url: ruleUrl(siteUrl, entry),
    description: parts.join("\n\n"),
    color: EMBED_COLOR,
    footer: { text: `${KIND_LABEL[entry.kind]} · ${index.versions[entry.kind]}` },
  };
}
