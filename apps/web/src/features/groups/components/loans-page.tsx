import { enumLabel } from "@openrift/shared/enum-label";
import type { LoanResponse } from "@openrift/shared/types/api/loan";
import { getOrientation } from "@openrift/shared/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, EllipsisVerticalIcon, HandHeartIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { CardArtThumb } from "@/features/cards/components/card-art-thumb";
import { useCards } from "@/features/cards/hooks/use-cards";
import { frontImageId } from "@/features/cards/lib/card-meta";
import { ReturnLoanDialog } from "@/features/groups/components/return-loan-dialog";
import { CardMetaLine } from "@/features/groups/components/trade-row-parts";
import { WriteOffLoanDialog } from "@/features/groups/components/write-off-loan-dialog";
import {
  useAcknowledgeLoan,
  useDeleteLoan,
  useLoans,
  useRejectLoan,
  useReturnLoanCopies,
  useWriteOffLoan,
} from "@/features/groups/hooks/use-loans";
import {
  loanCounterpartyLabel,
  loanSection,
  loanStatusLabel,
  outstandingQuantity,
} from "@/features/groups/lib/loan-derivation";
import { useEnumOrders } from "@/hooks/use-enums";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function LoanRow({ loan }: { loan: LoanResponse }) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();

  const acknowledge = useAcknowledgeLoan();
  const reject = useRejectLoan();
  const returnCopies = useReturnLoanCopies();
  const writeOff = useWriteOffLoan();
  const deleteLoan = useDeleteLoan();

  const [returnOpen, setReturnOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const card = cardsById[loan.cardId];
  const printing = printingsById[loan.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = frontImageId(printing);

  const lending = loan.role === "lender";
  const outstanding = outstandingQuantity(loan);
  const acting =
    acknowledge.isPending ||
    reject.isPending ||
    returnCopies.isPending ||
    writeOff.isPending ||
    deleteLoan.isPending;

  const counterpartyName = loanCounterpartyLabel(loan);
  const quantityLabel =
    loan.status === "active" && loan.returnedQuantity > 0
      ? `${outstanding} of ${loan.quantity}× ${cardName} still out`
      : `${loan.quantity}× ${cardName}`;

  return (
    <Card className="gap-2 p-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <CardArtThumb
          shape="strip"
          imageId={imageId}
          alt={cardName}
          landscape={card ? getOrientation(card.types) === "landscape" : false}
          rarity={printing?.rarity}
          domains={card?.domains}
          className="h-10"
          loading="lazy"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{quantityLabel}</span>
          {printing ? (
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={enumLabel(labels.rarities, printing.rarity)}
              finish={printing.finish}
              finishLabel={enumLabel(labels.finishes, printing.finish)}
            />
          ) : null}
        </div>

        <span className="flex shrink-0 items-center gap-1.5 px-1.5 py-1" title={counterpartyName}>
          {loan.counterparty ? (
            <UserAvatar
              image={loan.counterparty.image}
              name={loan.counterparty.name}
              gravatarHash={loan.counterparty.gravatarHash}
              size="sm"
            />
          ) : null}
          <span className="text-sm">
            {lending ? `to ${counterpartyName}` : `from ${counterpartyName}`}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 sm:contents">
        <LoanStatusBadge loan={loan} />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          {loan.actionNeeded === "acknowledge" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => reject.mutate({ loanId: loan.id })}
              >
                I don&apos;t have this
              </Button>
              <Button
                size="sm"
                disabled={acting}
                onClick={() => acknowledge.mutate({ loanId: loan.id })}
              >
                Got it
              </Button>
            </>
          ) : null}

          {lending && loan.status === "active" ? (
            <Button
              size="sm"
              disabled={acting}
              onClick={() =>
                outstanding === 1
                  ? returnCopies.mutate({ loanId: loan.id, quantity: 1 })
                  : setReturnOpen(true)
              }
            >
              Mark returned
            </Button>
          ) : null}

          {lending ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}
              >
                <EllipsisVerticalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {loan.status === "active" ? (
                  <DropdownMenuItem onClick={() => setWriteOffOpen(true)}>
                    Not coming back…
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    deleteLoan.mutate(
                      { loanId: loan.id },
                      { onSuccess: () => toast.success("Loan deleted") },
                    )
                  }
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {returnOpen ? (
        <ReturnLoanDialog
          open={returnOpen}
          onOpenChange={setReturnOpen}
          outstanding={outstanding}
          pending={returnCopies.isPending}
          onConfirm={(quantity) =>
            returnCopies.mutate(
              { loanId: loan.id, quantity },
              { onSuccess: () => setReturnOpen(false) },
            )
          }
        />
      ) : null}

      {writeOffOpen ? (
        <WriteOffLoanDialog
          open={writeOffOpen}
          onOpenChange={setWriteOffOpen}
          cardName={cardName}
          outstanding={outstanding}
          pending={writeOff.isPending}
          onConfirm={(removeCopies) =>
            writeOff.mutate(
              { loanId: loan.id, removeCopies },
              { onSuccess: () => setWriteOffOpen(false) },
            )
          }
        />
      ) : null}
    </Card>
  );
}

function LoanStatusBadge({ loan }: { loan: LoanResponse }) {
  if (loan.status !== "active") {
    return (
      <Badge variant="secondary" className="shrink-0">
        {loanStatusLabel(loan.status)}
      </Badge>
    );
  }
  if (loan.role === "lender" && loan.rejectedAt !== null) {
    return (
      <Badge
        variant="warning"
        className="shrink-0"
        title="They say they don't have this card — check with them, then fix or delete the loan"
      >
        They don&apos;t have it?
      </Badge>
    );
  }
  if (loan.role === "lender" && loan.counterparty !== null && loan.acknowledgedAt === null) {
    return (
      <Badge variant="secondary" className="shrink-0">
        Unconfirmed
      </Badge>
    );
  }
  if (loan.role === "borrower" && loan.actionNeeded === "acknowledge") {
    return (
      <Badge variant="warning" className="shrink-0">
        New
      </Badge>
    );
  }
  return null;
}

function LoanGroup({ heading, loans }: { heading: string; loans: LoanResponse[] }) {
  if (loans.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <SectionHeading>{heading}</SectionHeading>
      <div className="space-y-2">
        {loans.map((loan) => (
          <LoanRow key={loan.id} loan={loan} />
        ))}
      </div>
    </section>
  );
}

export function LoansPage() {
  const { data } = useLoans();

  const loans = data?.items ?? [];
  const attention: LoanResponse[] = [];
  const lent: LoanResponse[] = [];
  const borrowed: LoanResponse[] = [];
  const history: LoanResponse[] = [];
  for (const loan of loans) {
    const section = loanSection(loan);
    if (section === "attention") {
      attention.push(loan);
    } else if (section === "lent") {
      lent.push(loan);
    } else if (section === "borrowed") {
      borrowed.push(loan);
    } else if (section === "history") {
      history.push(loan);
    }
  }
  lent.sort((a, b) => loanCounterpartyLabel(a).localeCompare(loanCounterpartyLabel(b)));

  const empty = data !== undefined && loans.length === 0;

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Lending</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-6 px-4 pt-3 pb-12")}>
        <PageDescription>
          Cards you&apos;ve lent to friends and cards you&apos;re borrowing.
        </PageDescription>

        {empty ? (
          <EmptyState
            className="py-12"
            icon={HandHeartIcon}
            title="Nothing lent out right now"
            description="Lend a card to a friend and OpenRift remembers who has it. The copy stays in your collection but stops counting for decks and trades until you mark it returned. To lend one, right-click it in a collection and choose “Lend to a friend”."
          >
            <Link to="/collections" className={buttonVariants({ variant: "default" })}>
              Open your collections
            </Link>
          </EmptyState>
        ) : null}

        <LoanGroup heading="Needs your attention" loans={attention} />
        <LoanGroup heading="Lent out" loans={lent} />
        <LoanGroup heading="Borrowed" loans={borrowed} />

        {history.length > 0 ? (
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center gap-1.5">
              <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
              <SectionHeading as="span" count={history.length}>
                History
              </SectionHeading>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              {history.map((loan) => (
                <LoanRow key={loan.id} loan={loan} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </>
  );
}
