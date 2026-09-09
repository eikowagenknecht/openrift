import { enumLabel } from "@openrift/shared/enum-label";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createLazyFileRoute,
  notFound,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Pressable } from "@/components/ui/pressable";
import { cardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { ContributeForm } from "@/features/contribute/components/contribute-form";
import { prefillFromCard } from "@/features/contribute/lib/contribute-json";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute(
  "/_app/contribute_/card_/$cardSlug_/printing_/$printingId",
)({
  component: ContributePrintingCorrectionPage,
});

function ContributePrintingCorrectionPage() {
  const { cardSlug, printingId } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const printing = data.printings.find((p) => p.id === printingId);
  if (!printing) {
    throw notFound();
  }
  const setSlugById = new Map(data.sets.map((s) => [s.id, s.slug]));
  const setNameById = new Map(data.sets.map((s) => [s.id, s.name]));
  const initial = prefillFromCard(data.card, [printing], setSlugById, setNameById);

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
        <Heading level={1}>Fix this printing</Heading>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">
            {printing.printedName ?? data.card.name}
          </span>{" "}
          · {setNameById.get(printing.setId) ?? ""} · {printing.publicCode} ·{" "}
          {enumLabel(labels.finishes, printing.finish)} ·{" "}
          {enumLabel(languageLabels, printing.language)}
        </p>
      </header>
      <ContributeForm initial={initial} lockedSlug={cardSlug} scope="printing" />
    </div>
  );
}
