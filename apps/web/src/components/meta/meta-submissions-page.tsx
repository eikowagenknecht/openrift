import type { MetaSubmission } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ScrollTextIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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
import { useMetaSubmissions } from "@/hooks/use-meta-submissions";
import {
  metaSubmissionExplanation,
  metaSubmissionKindLabels,
  metaSubmissionStatusBadgeVariant,
  metaSubmissionStatusHints,
  metaSubmissionStatusLabels,
} from "@/lib/meta-submission-copy";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function SubmissionRow({
  submission,
  shareToken,
}: {
  submission: MetaSubmission;
  shareToken: string | null;
}) {
  const explanation = metaSubmissionExplanation(
    submission.resolutionReason,
    submission.resolutionNote,
  );
  const hint = metaSubmissionStatusHints[submission.status];

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{submission.eventName}</span>
          {submission.playerName !== null && (
            <span className="text-muted-foreground text-sm">{submission.playerName}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted">{metaSubmissionKindLabels[submission.kind]}</Badge>
          <Badge variant={metaSubmissionStatusBadgeVariant[submission.status]}>
            {metaSubmissionStatusLabels[submission.status]}
          </Badge>
        </div>
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

      {shareToken ? (
        <Link
          to="/meta/decks/$token"
          params={{ token: shareToken }}
          className="text-sm underline underline-offset-4"
        >
          See the deck on the archive
        </Link>
      ) : null}
    </Card>
  );
}

export function MetaSubmissionsPage() {
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useMetaSubmissions();
  const submissions = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" />
          <PageTopBarTitle>Your contributions</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton render={<Link to="/meta/submit" />}>
              Send a decklist
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-4 px-4 pt-3 pb-12")}>
        <PageDescription>
          Everything you&apos;ve sent to the archive, and what happened to each one.
        </PageDescription>

        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : null}

        {!isPending && submissions.length === 0 ? (
          <EmptyState
            icon={ScrollTextIcon}
            title="Nothing sent in yet"
            description="Watched a tournament and know what people played? Help us fill in the gaps."
          >
            <Button render={<Link to="/meta/submit" />}>Send a decklist</Button>
          </EmptyState>
        ) : null}

        {submissions.map((submission) => (
          <SubmissionRow
            key={submission.id}
            submission={submission}
            shareToken={submission.acceptedDeckToken}
          />
        ))}

        {hasNextPage ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Show older contributions"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
