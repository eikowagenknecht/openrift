import { ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const QUERY = "deck";

const INDENT = {
  0: "",
  1: "pl-3 sm:pl-6",
  2: "pl-6 sm:pl-12",
} as const;

/** An italicised game term, which the rules page renders as a jump link. */
function Term({ children }: { children: ReactNode }) {
  return <em className="text-primary">{children}</em>;
}

/** A cross-reference: the whole matched phrase is the link, not just the number. */
function RuleRef({ children }: { children: ReactNode }) {
  return <span className="text-primary">{children}</span>;
}

function RuleRow({
  number,
  depth,
  children,
  toggle,
}: {
  number: string;
  depth: 0 | 1 | 2;
  children: ReactNode;
  toggle?: boolean;
}) {
  return (
    <div className="border-border/50 flex items-baseline border-b py-1.5 text-sm">
      <span className="text-muted-foreground mr-3 shrink-0 font-mono text-xs">{number}</span>
      <span className={cn("min-w-0 flex-1", INDENT[depth])}>
        {toggle && (
          <span className="motion-safe:animate-rules-before float-right ml-3 flex size-4 shrink-0 items-start">
            <ChevronRightIcon className="text-muted-foreground size-4 rotate-90" />
          </span>
        )}
        {children}
      </span>
    </div>
  );
}

/** A row the search filters away: it collapses out of the list, it does not fade in place. */
function FilteredRow({ children }: { children: ReactNode }) {
  return (
    <div className="motion-safe:animate-rules-collapse grid grid-rows-[1fr]">
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * The rules reference: every numbered paragraph on one page, with italic game
 * terms and cross-references as jump links. The animation types a query and
 * filters the list to the rules that match, the way the real search does — no
 * highlighting, just fewer rows and a new count.
 */
export function RulesVignette() {
  return (
    <ClipFrame className="flex flex-col gap-4 p-5">
      <div className="border-input flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border px-2 text-sm">
        <SearchIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="relative min-w-0 flex-1">
          <span className="text-muted-foreground motion-safe:animate-rules-placeholder">
            Search rules...
          </span>
          <span
            className="motion-safe:animate-rules-type absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
            style={{ clipPath: "inset(0 100% 0 0)" }}
          >
            {QUERY}
          </span>
        </span>
        <span className="text-muted-foreground grid shrink-0 justify-items-end text-xs">
          <span className="motion-safe:animate-rules-before col-start-1 row-start-1">
            1443 rules
          </span>
          <span className="motion-safe:animate-rules-after col-start-1 row-start-1 opacity-0">
            2 / 1443 rules
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-muted-foreground motion-safe:animate-rules-after shrink-0 opacity-0"
        >
          <XIcon className="size-3.5" />
        </span>
      </div>

      <div className="flex flex-col">
        <FilteredRow>
          <RuleRow number="113" depth={0}>
            Each player sets aside their <Term>Battlefields.</Term>
          </RuleRow>
        </FilteredRow>
        <RuleRow number="114" depth={0} toggle>
          Each player shuffles their <Term>Main</Term> and <Term>Rune Decks</Term>, separately, then
          places them into their respective Zones.
        </RuleRow>
        <RuleRow number="114.1" depth={1}>
          The <Term>Main Deck</Term> is placed in the <Term>Main Deck Zone.</Term>
        </RuleRow>
        <FilteredRow>
          <RuleRow number="107.1.b" depth={2}>
            Each Base is a <Term>Location.</Term>{" "}
            <em className="text-muted-foreground">
              See <RuleRef>rule 197</RuleRef>. Locations for more information.
            </em>
          </RuleRow>
        </FilteredRow>
      </div>
    </ClipFrame>
  );
}
