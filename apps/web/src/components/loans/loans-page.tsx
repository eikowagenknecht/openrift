import type { LoanResponse } from "@openrift/shared";
import { ChevronRightIcon, EllipsisVerticalIcon, HandHeartIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardMetaLine } from "@/components/friend-groups/trade-row-parts";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { ReturnLoanDialog } from "@/components/loans/return-loan-dialog";
import { WriteOffLoanDialog } from "@/components/loans/write-off-loan-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import {
  useAcknowledgeLoan,
  useDeleteLoan,
  useLoans,
  useRejectLoan,
  useReturnLoanCopies,
  useWriteOffLoan,
} from "@/hooks/use-loans";
import {
  loanCounterpartyLabel,
  loanSection,
  loanStatusLabel,
  outstandingQuantity,
} from "@/lib/loan-derivation";

/**
 * One loan as a wide row with a contextual action set, oriented to the viewer.
 * @returns The loan row element.
 */
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
  const imageId = printing?.images.find((image) => image.face === "front")?.imageId ?? null;

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
        <CardArtThumb imageId={imageId} alt={cardName} className="w-10" loading="lazy" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{quantityLabel}</span>
          {printing ? (
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={labels.rarities[printing.rarity]}
              finish={printing.finish}
              finishLabel={labels.finishes[printing.finish]}
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
          cardName={cardName}
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

/**
 * Status badge oriented to the viewer: consent state while a loan is active
 * (member borrowers only), the plain status once it's closed.
 * @returns The badge element, or null when there's nothing worth flagging.
 */
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

/**
 * The personal Lending page (ADR-039): everything the viewer has lent out or
 * is borrowing, plus closed loans as collapsed history.
 * @returns The page element.
 */
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
  // Group the lent section by borrower so one friend's cards sit together.
  lent.sort((a, b) => loanCounterpartyLabel(a).localeCompare(loanCounterpartyLabel(b)));

  const empty = data !== undefined && loans.length === 0;

  return (
    <>
      <PageTopBarSticky maxWidth="4xl">
        <PageTopBar>
          <PageTopBarTitle>Lending</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 pt-3 pb-12">
        <PageDescription>
          Cards you&apos;ve lent to friends and cards you&apos;re borrowing. Lent copies stay in
          your collection but stop counting for deck building and trades until they&apos;re back.
        </PageDescription>

        {empty ? (
          <Card className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center text-sm">
            <HandHeartIcon className="text-muted-foreground/60 size-8" />
            <p className="text-foreground font-medium">Nothing lent out right now</p>
            <p>
              To lend a card, right-click it in one of your collections and choose &quot;Lend to a
              friend&quot;.
            </p>
          </Card>
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
