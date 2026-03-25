import { Link } from "@tanstack/react-router";
import { Map, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import changelogMd from "@/CHANGELOG.md?raw";
import { useSpinnerButton } from "@/hooks/use-spinner-button";
import { useSWUpdate } from "@/hooks/use-sw-update";
import { parseChangelog } from "@/lib/changelog";
import { COMMIT_HASH } from "@/lib/env";
import { formatRelativeDate } from "@/lib/format-relative-date";

const changelogGroups = parseChangelog(changelogMd);

export function ChangelogPage() {
  const { checkForUpdate } = useSWUpdate();
  const {
    spinning,
    trigger: handleCheckUpdate,
    onAnimationIteration,
  } = useSpinnerButton(async () => {
    await checkForUpdate();
    toast("You're on the latest version");
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">What&apos;s new</h1>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="text-xs tabular-nums">{COMMIT_HASH}</span>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 text-xs hover:text-foreground"
            onClick={handleCheckUpdate}
          >
            <RefreshCw
              className={`size-3 ${spinning ? "animate-spin" : ""}`}
              onAnimationIteration={onAnimationIteration}
            />
            Check for updates
          </button>
        </div>
      </div>
      <Link
        to="/roadmap"
        className="mb-6 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Map className="size-4" />
        View the roadmap
      </Link>
      {changelogGroups.map((group) => (
        <div key={group.date} className="mb-6">
          <div className="sticky top-14 z-10 -mx-4 flex items-baseline gap-3 border-b border-border bg-background px-4 pb-2 pt-3 shadow-[0_2px_4px_-2px_var(--color-border)]">
            <span className="text-sm font-semibold text-foreground">
              {formatRelativeDate(group.date)}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{group.date}</span>
          </div>
          <ul className="space-y-2 pt-2">
            {group.entries.map((entry, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="relative mt-1 inline-flex w-8 shrink-0 items-center justify-center px-1">
                  <span
                    className={`absolute inset-0 -skew-x-[15deg] ${
                      entry.type === "feat" ? "bg-[#24705f]" : "bg-[#cd346f]"
                    }`}
                  />
                  <span className="relative text-[10px] font-semibold uppercase italic leading-none tracking-tight text-white">
                    {entry.type}
                  </span>
                </span>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
