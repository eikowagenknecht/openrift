import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createLazyFileRoute,
  notFound,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ImageSuggestForm } from "@/components/contribute/image-suggest-form";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { useEnumOrders } from "@/hooks/use-enums";
import { PAGE_PADDING } from "@/lib/utils";

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
      navigate({ to: "/cards/$cardSlug", params: { cardSlug } });
    }
  };

  return (
    <div className={`${PAGE_PADDING} mx-auto flex w-full max-w-2xl flex-col gap-6`}>
      <button
        type="button"
        onClick={handleBack}
        className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </button>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Suggest an image</h1>
        <p className="text-muted-foreground">
          For{" "}
          <span className="text-foreground font-medium">
            {printing.printedName ?? data.card.name}
          </span>{" "}
          · {setName} · {labels.finishes[printing.finish]} · {printing.language || "EN"}
        </p>
      </header>
      <ImageSuggestForm card={data.card} printing={printing} setSlug={setSlug} setName={setName} />
    </div>
  );
}
