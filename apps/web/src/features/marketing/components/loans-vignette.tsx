import { ChevronRightIcon, EllipsisVerticalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { FinishIcon } from "@/features/cards/components/finish-icon";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

interface LoanCard {
  quantityLabel: string;
  shortCode: string;
  rarity: string;
  finish: string;
  domains: string[];
  counterparty: string;
}

function MetaLine({
  shortCode,
  rarity,
  finish,
}: {
  shortCode: string;
  rarity: string;
  finish: string;
}) {
  const rarityIcon = getFilterIconPath("rarities", rarity);
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="font-medium">{shortCode}</span>
      {rarityIcon && <img src={rarityIcon} alt="" className="size-3.5" />}
      <FinishIcon finish={finish} />
    </span>
  );
}

function LoanRow({ loan, trailing }: { loan: LoanCard; trailing: ReactNode }) {
  return (
    <Card className="gap-2 p-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <CardArtThumb
          shape="strip"
          rarity={loan.rarity}
          domains={loan.domains}
          className="h-10"
          loading="lazy"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{loan.quantityLabel}</span>
          <MetaLine shortCode={loan.shortCode} rarity={loan.rarity} finish={loan.finish} />
        </div>
        <span className="flex shrink-0 items-center gap-1.5 px-1.5 py-1">
          <UserAvatar name={loan.counterparty} size="sm" />
          <span className="text-sm">to {loan.counterparty}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 sm:contents">
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">{trailing}</div>
      </div>
    </Card>
  );
}

function MarkReturned({ pressing }: { pressing?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          buttonVariants({ size: "sm" }),
          pressing && "motion-safe:animate-loans-press",
        )}
      >
        Mark returned
      </span>
      <span
        aria-hidden="true"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
      >
        <EllipsisVerticalIcon />
      </span>
    </>
  );
}

const YASUO: LoanCard = {
  quantityLabel: "2× Yasuo, Windrider",
  shortCode: "OGN-205",
  rarity: "epic",
  finish: "foil",
  domains: ["calm"],
  counterparty: "Mira",
};

const HIDDEN_BLADE: LoanCard = {
  quantityLabel: "1× Hidden Blade",
  shortCode: "OGN-213",
  rarity: "common",
  finish: "normal",
  domains: ["order"],
  counterparty: "Jax",
};

const GUARDS: LoanCard = {
  quantityLabel: "3× Guards!",
  shortCode: "SFD-154",
  rarity: "common",
  finish: "normal",
  domains: ["order"],
  counterparty: "Mira",
};

export function LoansVignette() {
  return (
    <ClipFrame className="flex flex-col gap-5 p-5">
      <section className="flex flex-col gap-2">
        <SectionHeading>Lent out</SectionHeading>
        <div className="motion-safe:animate-loans-out grid grid-rows-[1fr]">
          <div className="overflow-hidden">
            <div className="pb-2">
              <LoanRow loan={YASUO} trailing={<MarkReturned pressing />} />
            </div>
          </div>
        </div>
        <LoanRow loan={HIDDEN_BLADE} trailing={<MarkReturned />} />
      </section>

      <section className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5">
          <ChevronRightIcon className="text-muted-foreground size-4 rotate-90" aria-hidden="true" />
          <SectionHeading as="span">
            History
            <span className="text-muted-foreground/60 relative ml-1.5 inline-block tabular-nums">
              <span className="motion-safe:animate-loans-out">1</span>
              <span className="motion-safe:animate-loans-in absolute inset-0 opacity-0">2</span>
            </span>
          </SectionHeading>
        </span>
        <div className="motion-safe:animate-loans-in grid grid-rows-[0fr] opacity-0">
          <div className="overflow-hidden">
            <div className="pb-2">
              <LoanRow loan={YASUO} trailing={<Badge variant="secondary">Returned</Badge>} />
            </div>
          </div>
        </div>
        <LoanRow loan={GUARDS} trailing={<Badge variant="secondary">Returned</Badge>} />
      </section>
    </ClipFrame>
  );
}
