import { Link } from "@tanstack/react-router";

import changelogMd from "@/CHANGELOG.md?raw";
import { parseChangelog } from "@/lib/changelog";
import { formatRelativeDate } from "@/lib/format-relative-date";

const changelogGroups = parseChangelog(changelogMd);

function SkewedBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className="ml-1 relative inline-flex w-10 shrink-0 justify-center py-0.5">
      <span className={`absolute inset-0 -skew-x-[15deg] ${color}`} />
      <span className="relative -ml-0.5 text-sm font-semibold uppercase italic leading-none tracking-tight text-white">
        {text}
      </span>
    </span>
  );
}

export function ChangelogPage() {
  return (
    <div className="mt-6 mx-auto max-w-2xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">What&apos;s new</h1>
        <Link to="/roadmap" className="text-sm text-muted-foreground hover:text-foreground">
          Roadmap &rarr;
        </Link>
      </div>
      <div className="flex flex-col gap-6">
        {changelogGroups.map((group) => (
          <div key={group.date}>
            <div className="py-2 sticky top-14 z-10 flex items-baseline justify-between border-b border-border bg-background pb-2">
              <span className="text-sm font-semibold text-foreground">
                {formatRelativeDate(group.date)}
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">{group.date}</span>
            </div>
            <ul className="space-y-2 pt-2">
              {group.entries.map((entry, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <SkewedBadge
                    text={entry.type}
                    color={entry.type === "feat" ? "bg-[#24705f]" : "bg-[#cd346f]"}
                  />
                  <span>{entry.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
