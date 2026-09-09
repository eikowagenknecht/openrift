import { legendDisplayName } from "@openrift/shared/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Pressable } from "@/components/ui/pressable";
import { cardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { ContributeForm } from "@/features/contribute/components/contribute-form";
import { prefillForNewPrinting } from "@/features/contribute/lib/contribute-json";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/card_/$cardSlug_/printing")({
  component: ContributeAddPrintingPage,
});

function ContributeAddPrintingPage() {
  const { cardSlug } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const setSlugById = new Map(data.sets.map((s) => [s.id, s.slug]));
  const setNameById = new Map(data.sets.map((s) => [s.id, s.name]));
  const initial = prefillForNewPrinting(data.card, setSlugById, setNameById);

  const handleBack = () => {
    if (canGoBack) {
      router.history.back();
    } else {
      void navigate({ to: "/cards/$cardSlug/{-$printingSlug}", params: { cardSlug } });
    }
  };

  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-6")}>
      <Pressable
        onClick={handleBack}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Pressable>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Add a printing</Heading>
        <p className="text-muted-foreground">
          Describe the version of{" "}
          <span className="font-medium">{legendDisplayName(data.card)}</span> you have in hand. The
          card details stay as they are.
        </p>
      </header>
      <ContributeForm initial={initial} lockedSlug={cardSlug} scope="printing" />
    </div>
  );
}
