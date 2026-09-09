import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CameraIcon } from "lucide-react";
import type { ReactNode } from "react";

import { OrnamentRule } from "@/components/ui/ornament";
import { HeroBackground } from "@/features/marketing/components/hero-background";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const EYEBROW_CLASS = "text-primary font-heading text-sm font-semibold tracking-wide uppercase";

export function ContributeHero({
  title,
  lead,
  action,
  back = false,
}: {
  title: string;
  lead: ReactNode;
  action?: ReactNode;
  back?: boolean;
}) {
  return (
    <HeroBackground>
      <div
        className={cn(
          PAGE_WIDTH.capped,
          "px-safe flex items-center gap-12 pt-10 pb-8 sm:pt-12 sm:pb-10",
        )}
      >
        <div className="flex flex-1 flex-col items-start gap-3">
          {back ? (
            <Link
              to="/contribute"
              className={cn(
                EYEBROW_CLASS,
                "hover:text-primary/80 inline-flex items-center gap-1.5",
              )}
            >
              <ArrowLeftIcon className="size-3.5" />
              Contribute
            </Link>
          ) : (
            <span className={EYEBROW_CLASS}>Contribute</span>
          )}
          <h1 className="font-heading text-4xl font-bold text-balance">{title}</h1>
          <OrnamentRule className="w-40" />
          <p className="text-muted-foreground max-w-lg text-pretty">{lead}</p>
          {action}
        </div>
        <HeroCardFan />
      </div>
    </HeroBackground>
  );
}

function HeroCardFan() {
  const sideCardClass =
    "aspect-card absolute bottom-0 left-1/2 w-32 origin-bottom -translate-x-1/2 rounded-md border border-dashed bg-card/60";
  return (
    <div className="relative hidden h-56 w-72 shrink-0 md:block" aria-hidden="true">
      <span className={cn(sideCardClass, "-rotate-12")} />
      <span className={cn(sideCardClass, "rotate-12")} />
      <span
        className={cn(
          sideCardClass,
          "border-muted-foreground/40 bg-card text-muted-foreground flex flex-col items-center justify-center gap-2",
        )}
      >
        <CameraIcon className="size-5" />
        <span className="text-xs">Your photo here</span>
      </span>
    </div>
  );
}
