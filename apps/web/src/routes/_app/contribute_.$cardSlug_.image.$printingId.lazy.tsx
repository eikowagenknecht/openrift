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
import { ImageSuggestForm } from "@/features/contribute/components/image-suggest-form";
import { useEnumOrders } from "@/hooks/use-enums";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/$cardSlug_/image/$printingId")({
  component: ImageSuggestPage,
});

function ImageSuggestPage() {
  const { cardSlug, printingId } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { labels } = useEnumOrders();
  const printing = data.printings.find((p) => p.id === printingId);
  if (!printing) {
    throw notFound();
  }
  const set = data.sets.find((s) => s.id === printing.setId);
  const setSlug = set?.slug ?? "";
  const setName = set?.name ?? "";

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
        <Heading level={1}>Suggest an image</Heading>
        <p className="text-muted-foreground">
          For{" "}
          <span className="text-foreground font-medium">
            {printing.printedName ?? data.card.name}
          </span>{" "}
          · {setName} · {enumLabel(labels.finishes, printing.finish)} · {printing.language || "EN"}
        </p>
      </header>
      <ImageSuggestForm
        key={printingId}
        card={data.card}
        printing={printing}
        setSlug={setSlug}
        setName={setName}
      />
    </div>
  );
}
