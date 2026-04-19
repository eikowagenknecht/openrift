import { WellKnown } from "@openrift/shared";
import { GemIcon, SparkleIcon, TrophyIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementType } from "react";

import { cn } from "@/lib/utils";

interface FinishVisual {
  Icon: ElementType;
  colorClass: string;
}

function getFinishVisual(finish: string): FinishVisual | null {
  switch (finish) {
    case WellKnown.finish.FOIL: {
      return { Icon: SparkleIcon, colorClass: "fill-amber-400 text-amber-400" };
    }
    case WellKnown.finish.METAL: {
      return { Icon: GemIcon, colorClass: "fill-slate-400 text-slate-400" };
    }
    case WellKnown.finish.METAL_DELUXE: {
      return { Icon: TrophyIcon, colorClass: "fill-yellow-500 text-yellow-500" };
    }
    default: {
      return null;
    }
  }
}

interface FinishIconProps extends Omit<ComponentPropsWithoutRef<"span">, "children" | "title"> {
  finish: string;
  title?: string;
  iconClassName?: string;
}

export function FinishIcon({ finish, title, className, iconClassName, ...rest }: FinishIconProps) {
  const visual = getFinishVisual(finish);
  if (!visual) {
    return null;
  }
  const { Icon, colorClass } = visual;
  return (
    <span title={title} className={cn("inline-flex", className)} {...rest}>
      <Icon className={cn("size-3.5", colorClass, iconClassName)} />
    </span>
  );
}

export function hasFinishIcon(finish: string): boolean {
  return getFinishVisual(finish) !== null;
}
