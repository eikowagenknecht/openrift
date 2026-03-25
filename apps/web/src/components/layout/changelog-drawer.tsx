import { Link } from "@tanstack/react-router";
import { Map } from "lucide-react";

import changelogMd from "@/CHANGELOG.md?raw";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { parseChangelog } from "@/lib/changelog";
import { COMMIT_HASH } from "@/lib/env";
import { formatRelativeDate } from "@/lib/format-relative-date";

const changelogGroups = parseChangelog(changelogMd);

interface ChangelogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangelogDrawer({ open, onOpenChange }: ChangelogDrawerProps) {
  return (
    <Drawer swipeDirection="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex flex-col gap-0 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <DrawerHeader className="px-0 pb-4 pt-2">
            <DrawerTitle>What&apos;s new</DrawerTitle>
            <DrawerDescription>
              Recent changes and improvements.{" "}
              <span className="text-[10px] tabular-nums">{COMMIT_HASH}</span>
            </DrawerDescription>
          </DrawerHeader>
          <Link
            to="/roadmap"
            onClick={() => onOpenChange(false)}
            className="mb-4 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Map className="size-4" />
            View the roadmap
          </Link>
          {changelogGroups.map((group) => (
            <div key={group.date} className="mb-4">
              <div className="sticky top-0 z-10 -mx-4 flex items-baseline gap-3 border-b border-border bg-background px-4 pb-2 pt-3 shadow-[0_2px_4px_-2px_var(--color-border)]">
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
      </DrawerContent>
    </Drawer>
  );
}
