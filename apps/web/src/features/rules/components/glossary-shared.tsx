import { Link } from "@tanstack/react-router";

import { Heading } from "@/components/heading";
import type { PageTocItem } from "@/components/layout/page-toc";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Section } from "@/features/rules/lib/glossary-content";
import { GROUPS } from "@/features/rules/lib/glossary-content";
import { cn } from "@/lib/utils";

export function RuleRef({ ruleNumber, className }: { ruleNumber: string; className?: string }) {
  return (
    <Link
      to="/rules/$kind"
      params={{ kind: "core" }}
      hash={`rule-${ruleNumber}`}
      className={cn("text-primary text-xs hover:underline", className)}
    >
      Rule {ruleNumber} →
    </Link>
  );
}

export function GroupHeading({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-20">
      <SectionHeading className="border-b pb-2">{title}</SectionHeading>
    </div>
  );
}

export function GlossarySectionHeading({ id, title }: Section) {
  return (
    <Heading level={2} as="h3" id={id} className="mt-8 scroll-mt-20">
      {title}
    </Heading>
  );
}

export const TOC_ITEMS: PageTocItem[] = GROUPS.flatMap((group) => [
  { id: group.id, label: group.title },
  ...group.sections.map((section) => ({
    id: section.id,
    label: section.title,
    level: 1 as const,
  })),
]);
