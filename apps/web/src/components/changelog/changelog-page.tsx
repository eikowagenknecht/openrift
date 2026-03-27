import { Link } from "@tanstack/react-router";

import changelogMd from "@/CHANGELOG.md?raw";
import { parseChangelog } from "@/lib/changelog";
import { formatRelativeDate } from "@/lib/format-relative-date";

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

export function ChangelogPage() {
  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">What&apos;s new</h1>
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
