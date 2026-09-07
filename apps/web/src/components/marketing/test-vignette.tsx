import { RotateCcwIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const DEAL_DELAYS = [0, 130, 260, 390];

const HAND_CARD_CLASS = "aspect-card h-24 object-cover shadow-sm sm:h-28";

const ODDS_ROWS = [
  { copies: 3, name: "Soul Sword", hand: "28%", early: "46%" },
  { copies: 3, name: "Guards!", hand: "28%", early: "46%" },
  { copies: 2, name: "Hidden Blade", hand: "20%", early: "33%" },
];

function HandCard({
  art,
  delay,
  selected,
  swap,
}: {
  art?: string;
  delay: number;
  selected?: boolean;
  swap?: string;
}) {
  return (
    <span
      className="motion-safe:animate-test-deal relative inline-block"
      style={{ animationDelay: `${delay}ms`, borderRadius: CARD_BORDER_RADIUS }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          loading="lazy"
          draggable={false}
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className={cn(HAND_CARD_CLASS, swap && "motion-safe:animate-test-before")}
        />
      ) : (
        <span
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className="border-muted-foreground/25 aspect-card block h-24 border border-dashed sm:h-28"
        />
      )}
      {swap && (
        <img
          src={swap}
          alt=""
          loading="lazy"
          draggable={false}
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className={cn(
            HAND_CARD_CLASS,
            "motion-safe:animate-test-after absolute inset-0 opacity-0",
          )}
        />
      )}
      {selected && (
        <span
          aria-hidden="true"
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className="ring-primary ring-offset-background motion-safe:animate-test-select absolute inset-0 opacity-0 ring-2 ring-offset-2"
        />
      )}
    </span>
  );
}

export function TestVignette({ thumbnailUrls = [] }: { thumbnailUrls?: string[] }) {
  return (
    <ClipFrame className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }))}>
          <RotateCcwIcon className="size-4" />
          Draw a hand
          <Kbd className="max-sm:hidden">N</Kbd>
        </span>
        <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }))}>
          Mulligan
          <Kbd className="max-sm:hidden">M</Kbd>
        </span>
        <span aria-hidden="true" className={cn(buttonVariants({ variant: "outline" }))}>
          Draw a card
          <Kbd className="max-sm:hidden">D</Kbd>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">35 left in deck</span>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {DEAL_DELAYS.map((delay, index) => (
          <HandCard
            key={delay}
            art={thumbnailUrls[index]}
            delay={delay}
            selected={index === 1}
            swap={index === 1 ? thumbnailUrls[4] : undefined}
          />
        ))}
      </div>

      <div>
        <div className="text-muted-foreground text-2xs mb-1.5 font-semibold tracking-wide uppercase">
          Draw odds
        </div>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="px-2 py-1.5 text-left font-medium">Card</th>
                <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">Hand</th>
                <th className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap">
                  First 7
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/50 border-t">
                <td className="max-w-0 truncate px-2 py-1">
                  Turn-1 unit going first (≤2 energy){" "}
                  <span className="text-muted-foreground tabular-nums">· 9</span>
                </td>
                <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">67%</td>
                <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">87%</td>
              </tr>
              {ODDS_ROWS.map((row) => (
                <tr key={row.name} className="border-t">
                  <td className="max-w-0 truncate px-2 py-1">
                    <span className="text-muted-foreground tabular-nums">{row.copies}×</span>{" "}
                    {row.name}
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {row.hand}
                  </td>
                  <td className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums">
                    {row.early}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-2xs mt-1.5">
          Chance of at least one copy in your opening hand, and anywhere in your first 7 cards.
        </p>
      </div>
    </ClipFrame>
  );
}
