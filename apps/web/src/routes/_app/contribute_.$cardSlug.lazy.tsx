import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ContributeForm } from "@/components/contribute/contribute-form";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { prefillFromCard } from "@/lib/contribute-json";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/$cardSlug")({
  component: ContributeCorrectionPage,
});

function ContributeCorrectionPage() {
  const { cardSlug } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const setSlugById = new Map(data.sets.map((s) => [s.id, s.slug]));
  const setNameById = new Map(data.sets.map((s) => [s.id, s.name]));
  const initial = prefillFromCard(data.card, data.printings, setSlugById, setNameById);

  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-3xl flex-col gap-6`}>
      <Link
        to="/cards/$cardSlug"
        params={{ cardSlug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back to card
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Suggest a correction</h1>
        <p className="text-muted-foreground">
          Adjust any field on <span className="font-medium">{data.card.name}</span> and submit.
        </p>
      </header>
      <ContributeForm initial={initial} lockedSlug={cardSlug} />
    </div>
  );
}
