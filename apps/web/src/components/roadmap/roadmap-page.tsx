import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleDotIcon,
  LayersIcon,
  LibraryIcon,
  PrinterIcon,
  RocketIcon,
  ScaleIcon,
  ScrollTextIcon,
  TrophyIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, PAGE_PADDING } from "@/lib/utils";

interface RoadmapItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  done: boolean;
  date?: string;
}

const roadmapItems: RoadmapItem[] = [
  // Upcoming
  {
    title: "Rules & Errata",
    description:
      "Searchable comprehensive rules reference with card errata alongside official text.",
    icon: <ScrollTextIcon className="size-4" />,
    done: false,
  },
  {
    title: "Proxy Printing",
    description: "Print proxy cards for playtesting.",
    icon: <PrinterIcon className="size-4" />,
    done: true,
    date: "Apr 2026",
  },
  {
    title: "Tournament Decks",
    description: "Browse tournament-winning decklists.",
    icon: <TrophyIcon className="size-4" />,
    done: false,
  },
  {
    title: "Trade Coordination",
    description: "Coordinate trades within your playgroup.",
    icon: <UsersIcon className="size-4" />,
    done: false,
  },
  // Done
  {
    title: "Deck Building",
    description:
      "Build, validate, and share decks with stats, deck codes, and collection availability.",
    icon: <LayersIcon className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "Collections",
    description:
      "Multiple collections with CSV import, activity timeline, market values, and sharing.",
    icon: <LibraryIcon className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "Price History",
    description: "Charts showing how card prices change over time.",
    icon: <WalletIcon className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "Dual Marketplace",
    description: "Cardmarket prices alongside TCGplayer, refreshed daily.",
    icon: <ScaleIcon className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "User Accounts",
    description:
      "Sign up with email or social login (Google, Discord), email verification, and profiles.",
    icon: <UsersIcon className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "Pricing",
    description: "Daily TCGplayer prices on every card.",
    icon: <WalletIcon className="size-4" />,
    done: true,
    date: "Feb 2026",
  },
  {
    title: "Launch",
    description: "Card browser with filters, search, and smooth virtual scrolling.",
    icon: <RocketIcon className="size-4" />,
    done: true,
    date: "Feb 2026",
  },
];

export function RoadmapPage() {
  return (
    <div className={`mx-auto w-full max-w-2xl ${PAGE_PADDING}`}>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Roadmap</h1>
        <Link to="/changelog" className="text-muted-foreground hover:text-foreground text-sm">
          What&apos;s new &rarr;
        </Link>
      </div>

      <ol className="relative">
        {roadmapItems.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === roadmapItems.length - 1;
          const firstDoneIndex = roadmapItems.findIndex((r) => r.done);
          const isFirstDone = i === firstDoneIndex;

          return (
            <li key={item.title} className="flex gap-4">
              {/* Timeline column */}
              <div className="flex w-20 shrink-0 flex-col items-center md:w-28">
                {/* Date label */}
                <span
                  className={cn(
                    "mb-2 hidden text-xs md:block",
                    item.done ? "text-muted-foreground" : "text-muted-foreground/60 italic",
                  )}
                >
                  {item.done ? item.date : "Soon™"}
                </span>

                {/* Dot */}
                <div
                  className={cn(
                    "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                    item.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background text-muted-foreground/50",
                  )}
                >
                  {item.done ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CircleDotIcon className="size-3" />
                  )}
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      "w-0.5 flex-1",
                      // Line between done items
                      item.done && roadmapItems[i + 1]?.done
                        ? "bg-primary/30"
                        : "bg-muted-foreground/15",
                    )}
                  />
                )}
              </div>

              {/* Card */}
              <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
                {isFirstDone && (
                  <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                    Shipped
                  </p>
                )}
                {isFirst && !item.done && (
                  <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                    Planned
                  </p>
                )}
                <Card
                  size="sm"
                  className={cn(!item.done && "ring-muted-foreground/10 border-dashed")}
                >
                  <CardHeader>
                    <CardTitle
                      className={cn(
                        "flex items-center gap-2",
                        item.done ? "text-foreground" : "text-muted-foreground italic",
                      )}
                    >
                      <span className={item.done ? "text-primary" : "text-muted-foreground/50"}>
                        {item.icon}
                      </span>
                      {item.title}
                    </CardTitle>
                    <CardDescription className={cn(!item.done && "italic")}>
                      {item.description}
                    </CardDescription>
                  </CardHeader>

                  {/* Mobile date */}
                  <p
                    className={cn(
                      "px-3 pb-3 text-xs md:hidden",
                      item.done ? "text-muted-foreground" : "text-muted-foreground/60 italic",
                    )}
                  >
                    {item.done ? item.date : "Soon™"}
                  </p>
                </Card>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
