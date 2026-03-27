import { Link } from "@tanstack/react-router";
import {
  Check,
  CircleDot,
  Hammer,
  Layers,
  Library,
  Printer,
  Rocket,
  Scale,
  ScrollText,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    title: "Deck Building",
    description: "Build, save, and share decks with validation and price breakdown.",
    icon: <Layers className="size-4" />,
    done: false,
  },
  {
    title: "Rules & Errata",
    description:
      "Searchable comprehensive rules reference with card errata alongside official text.",
    icon: <ScrollText className="size-4" />,
    done: false,
  },
  {
    title: "Proxy Printing",
    description: "Print proxy cards for playtesting.",
    icon: <Printer className="size-4" />,
    done: false,
  },
  {
    title: "Tournament Decks",
    description: "Browse tournament-winning decklists.",
    icon: <Trophy className="size-4" />,
    done: false,
  },
  {
    title: "Trade Coordination",
    description: "Coordinate trades within your playgroup.",
    icon: <Users className="size-4" />,
    done: false,
  },
  {
    title: "Collections",
    description: "Track and manage owned cards across multiple collections.",
    icon: <Library className="size-4" />,
    done: false,
    date: "Mar 2026",
  },
  // Done
  {
    title: "Price History",
    description: "Charts showing how card prices change over time.",
    icon: <Wallet className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "Dual Marketplace",
    description: "Cardmarket prices alongside TCGplayer, refreshed daily.",
    icon: <Scale className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "User Accounts",
    description:
      "Sign up with email or social login (Google, Discord), email verification, and profiles.",
    icon: <Users className="size-4" />,
    done: true,
    date: "Mar 2026",
  },
  {
    title: "PWA",
    description: "Works offline and installs to your home screen.",
    icon: <Hammer className="size-4" />,
    done: true,
    date: "Feb 2026",
  },
  {
    title: "Pricing",
    description: "Daily TCGplayer prices on every card.",
    icon: <Wallet className="size-4" />,
    done: true,
    date: "Feb 2026",
  },
  {
    title: "Launch",
    description: "Card browser with filters, search, and smooth virtual scrolling.",
    icon: <Rocket className="size-4" />,
    done: true,
    date: "Feb 2026",
  },
];

export function RoadmapPage() {
  return (
    <div className="mx-auto mt-6 w-full max-w-2xl">
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
                  {item.done ? <Check className="size-3.5" /> : <CircleDot className="size-3" />}
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
