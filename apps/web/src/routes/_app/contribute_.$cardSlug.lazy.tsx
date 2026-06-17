import { legendDisplayName } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ContributeForm } from "@/components/contribute/contribute-form";
import { Heading } from "@/components/heading";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { prefillFromCard } from "@/lib/contribute-json";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/$cardSlug")({
  component: ContributeCorrectionPage,
});

function ContributeCorrectionPage() {
  const { cardSlug } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const setSlugById = new Map(data.sets.map((s) => [s.id, s.slug]));
  const setNameById = new Map(data.sets.map((s) => [s.id, s.name]));
  const initial = prefillFromCard(data.card, data.printings, setSlugById, setNameById);

  const handleBack = () => {
    if (canGoBack) {
      router.history.back();
    } else {
      navigate({ to: "/cards/$cardSlug", params: { cardSlug } });
    }
  };

  return (
    <div className={`${PAGE_PADDING} mx-auto flex w-full max-w-3xl flex-col gap-6`}>
      <button
        type="button"
        onClick={handleBack}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </button>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Suggest a correction</Heading>
        <p className="text-muted-foreground">
          Spotted something off on{" "}
          <span className="font-medium">{legendDisplayName(data.card)}</span>? Edit any field that
          needs fixing and we&apos;ll review the change.
        </p>
      </header>
      <ContributeForm initial={initial} lockedSlug={cardSlug} />
    </div>
  );
}
