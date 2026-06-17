import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import changelogMd from "@/CHANGELOG.md?raw";
import { Heading } from "@/components/heading";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ChangelogEntry } from "@/lib/changelog";
import { parseChangelog } from "@/lib/changelog";
import { formatRelativeDate } from "@/lib/format-relative-date";
import { cn, PAGE_PADDING } from "@/lib/utils";

const changelogGroups = parseChangelog(changelogMd);

function SkewedBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="relative ml-1 inline-flex w-10 shrink-0 justify-center py-0.5">
      <span className={`absolute inset-0 -skew-x-[15deg] ${color}`} />
      <span className="relative -ml-0.5 text-sm leading-none font-semibold tracking-tight text-white uppercase italic">
        {text}
      </span>
    </span>
  );
}

function EntryItem({ entry }: { entry: ChangelogEntry }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <SkewedBadge
        text={entry.type}
        color={entry.type === "feat" ? "bg-[#24705f]" : "bg-[#cd346f]"}
      />
      <span>
        {entry.area && (
          <span className="bg-muted text-muted-foreground text-2xs mr-1.5 rounded px-1.5 py-0.5 font-medium tracking-wide whitespace-nowrap uppercase">
            {entry.area}
          </span>
        )}
        {entry.title ? (
          <>
            <span className="font-semibold">{entry.title}</span>
            <span className="text-muted-foreground"> — {entry.message}</span>
          </>
        ) : (
          entry.message
        )}
      </span>
    </li>
  );
}

export function ChangelogPage() {
  return (
    <div className={`mx-auto max-w-2xl ${PAGE_PADDING}`}>
      <div className="mb-6 flex items-baseline justify-between">
        <Heading level={1}>What&apos;s new</Heading>
        <Link to="/roadmap" className="text-muted-foreground hover:text-foreground text-sm">
          Roadmap &rarr;
        </Link>
      </div>
      <div className="flex flex-col gap-6">
        {changelogGroups.map((group) => (
          <div key={group.date}>
            <div className="border-border bg-background sticky top-14 z-10 flex items-baseline justify-between border-b py-2 pb-2">
              <span className="text-foreground text-sm font-semibold">
                {formatRelativeDate(group.date)}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">{group.date}</span>
            </div>
            {group.highlights.length > 0 && (
              <ul className="space-y-2 pt-2">
                {group.highlights.map((entry, i) => (
                  <EntryItem key={i} entry={entry} />
                ))}
              </ul>
            )}
            {group.other.length > 0 && (
              <Collapsible
                defaultOpen={group.highlights.length === 0}
                className={cn(group.highlights.length > 0 && "pt-2")}
              >
                {group.highlights.length > 0 && (
                  <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-sm">
                    <ChevronRightIcon className="size-3.5 transition-transform data-[panel-open]:rotate-90" />
                    {group.other.length} more {group.other.length === 1 ? "change" : "changes"}
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  <ul className="space-y-2 pt-2">
                    {group.other.map((entry, i) => (
                      <EntryItem key={i} entry={entry} />
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
