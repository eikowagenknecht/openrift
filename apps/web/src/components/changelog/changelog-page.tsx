import type { ChangelogEntry } from "@openrift/shared";
import { formatRelativeDay, parseChangelog } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import changelogMd from "@/CHANGELOG.md?raw";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

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
          <span className="bg-muted text-muted-foreground text-2xs mr-1.5 rounded-md px-1.5 py-0.5 font-medium tracking-wide whitespace-nowrap uppercase">
            {entry.area}
          </span>
        )}
        {entry.title ? (
          <>
            <span className="font-semibold">{entry.title}:</span>
            <span className="text-muted-foreground"> {entry.message}</span>
          </>
        ) : (
          entry.message
        )}
      </span>
    </li>
  );
}

export function ChangelogPage() {
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  // The date headers stick below the page top bar, not below the global header
  // alone, so their offset is the bar's measured height added to the header's.
  const barHeight = useMeasuredHeight(barEl);
  const dateHeaderTop = `calc(var(--header-height) - 1px + ${barHeight}px)`;

  return (
    <>
      <PageTopBarSticky ref={setBarEl} width="capped">
        <PageTopBar>
          <PageTopBarTitle>What&apos;s new</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/roadmap" />}>Roadmap</PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "pt-3", PAGE_PADDING_NO_TOP)}>
        <div className="flex flex-col gap-6">
          {changelogGroups.map((group) => (
            <div key={group.date}>
              <div
                className="bg-background/80 sticky z-10 flex items-baseline justify-between py-2 pb-2 backdrop-blur-lg"
                style={{ top: dateHeaderTop }}
              >
                {/* One date per heading: the relative label falls back to the
                    plain day, which is what the second column used to show.
                    A <time> rather than a <span> so the ISO day stays readable
                    to machines — assistive tech, feed readers, and the e2e test
                    that asserts the newest entry rendered — while the visible
                    text is the relative wording. */}
                <time
                  dateTime={group.date}
                  className="text-foreground text-sm font-semibold tabular-nums"
                >
                  {formatRelativeDay(group.date)}
                </time>
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
                    <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-sm">
                      <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
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
    </>
  );
}
