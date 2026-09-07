import { RULE_REFERENCE_REGEX } from "@openrift/shared/rules";
import type { RuleKind } from "@openrift/shared/types/api/rules";
import { truncateWithEllipsis } from "@openrift/shared/utils";
import type { APIEmbed } from "discord.js";

import { EMBED_COLOR } from "./card-embed.js";
import type { IndexedRule, RuleIndex } from "./rule-search.js";

const KIND_LABEL: Record<RuleKind, string> = { core: "Core Rules", tournament: "Tournament Rules" };

// Discord's embed description cap is 4096; leave headroom so assembled parts
// never need a mid-link cut.
const BODY_LIMIT = 3200;
const DESCRIPTION_LIMIT = 4000;

function ruleUrl(siteUrl: string, entry: IndexedRule): string {
  return `${siteUrl}/rules/${entry.kind}#rule-${entry.rule.ruleNumber}`;
}

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

export function ruleBreadcrumb(index: RuleIndex, entry: IndexedRule): string | undefined {
  // Only a subtitle directly above the rule's block counts as its heading;
  // one further away would be misleading context.
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

function descendants(index: RuleIndex, entry: IndexedRule): IndexedRule[] {
  return index.entries.filter(
    (candidate) =>
      candidate.kind === entry.kind && candidate.numberLower.startsWith(`${entry.numberLower}.`),
  );
}

// A core-rules subtitle has no numeric children; its section is the run of
// rules up to the next subtitle (tournament subtitles nest instead, via `descendants`).
function sectionRules(index: RuleIndex, entry: IndexedRule): IndexedRule[] {
  const position = index.entries.indexOf(entry);
  const section: IndexedRule[] = [];
  for (let i = position + 1; i < index.entries.length; i++) {
    const candidate = index.entries[i];
    if (
      candidate === undefined ||
      candidate.kind !== entry.kind ||
      candidate.rule.ruleType === "subtitle"
    ) {
      break;
    }
    section.push(candidate);
  }
  return section;
}

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
    // Numeric descendants indent relative to `base`; a core-style section
    // indents by each rule's own depth instead.
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
