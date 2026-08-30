import { formatDay } from "@openrift/shared";
import type { CardSubmissionStatusResponse } from "@openrift/shared/contracts/card-submissions";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardSubmissions } from "@/hooks/use-card-submissions";
import {
  submissionExplanation,
  submissionKindLabels,
  submissionStatusBadgeVariant,
  submissionStatusHints,
  submissionStatusLabels,
} from "@/lib/card-submission-copy";
import { cn, PAGE_WIDTH } from "@/lib/utils";

/**
 * One submission: what was sent, where it ended up, and anything the reviewer
 * wrote back.
 * @param props.submission The submission to render.
 * @returns The submission card element.
 */
function SubmissionRow({ submission }: { submission: CardSubmissionStatusResponse }) {
  const explanation = submissionExplanation(submission.reason, submission.resolutionNote);
  const hint = submissionStatusHints[submission.status];
  // Only link out once the card is really there. A correction always has a
  // target; a new card only gets a slug once it has been added.
  const cardLink = submission.cardSlug;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {cardLink ? (
            <Link
              to="/cards/$cardSlug"
              params={{ cardSlug: cardLink }}
              className="font-medium hover:underline"
            >
              {submission.cardName}
            </Link>
          ) : (
            <span className="font-medium">{submission.cardName}</span>
          )}
          <span className="text-muted-foreground text-sm">
            {submissionKindLabels[submission.kind]}
          </span>
        </div>
        <Badge variant={submissionStatusBadgeVariant[submission.status]}>
          {submissionStatusLabels[submission.status]}
        </Badge>
      </div>

      <p className="text-muted-foreground text-sm">
        Sent {formatDay(submission.createdAt)}
        {submission.resolvedAt ? ` · Reviewed ${formatDay(submission.resolvedAt)}` : ""}
      </p>

      {explanation ? <p>{explanation}</p> : null}
      {!explanation && hint ? <p className="text-muted-foreground">{hint}</p> : null}

      {submission.note ? (
        <p className="text-muted-foreground border-border border-l-2 pl-3 text-sm italic">
          {submission.note}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The contributor's own submission history (ADR-036). Every card sent through
 * /contribute, with what review did about it.
 * @returns The page element.
 */
export function MySubmissionsPage() {
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useCardSubmissions();
  const submissions = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/contribute" />
          <PageTopBarTitle>My submissions</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton render={<Link to="/contribute" />}>
              Submit a card
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-4 px-4 pt-3 pb-12")}>
        <PageDescription>Every card and correction you&apos;ve sent in.</PageDescription>

        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : null}

        {!isPending && submissions.length === 0 ? (
          <Card className="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center">
            <FileTextIcon className="text-muted-foreground/60 size-8" />
            <p className="text-foreground font-medium">Nothing sent in yet</p>
            <p>
              Spotted a card we&apos;re missing, or something that looks wrong? Help us fill in the
              gaps.
            </p>
            <Button render={<Link to="/contribute" />} className="mt-2">
              Submit a card
            </Button>
          </Card>
        ) : null}

        {submissions.map((submission) => (
          <SubmissionRow key={submission.id} submission={submission} />
        ))}

        {hasNextPage ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Show older submissions"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
