import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ImageSuggestForm } from "@/components/contribute/image-suggest-form";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/$cardSlug_/image/$printingId")({
  component: ImageSuggestPage,
});

function ImageSuggestPage() {
  const { cardSlug, printingId } = Route.useParams();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const printing = data.printings.find((p) => p.id === printingId);
  if (!printing) {
    throw notFound();
  }
  const set = data.sets.find((s) => s.id === printing.setId);
  const setSlug = set?.slug ?? "";
  const setName = set?.name ?? "";

  return (
    <div className={`${PAGE_PADDING} mx-auto flex max-w-2xl flex-col gap-6`}>
      <Link
        to="/cards/$cardSlug"
        params={{ cardSlug }}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back to card
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Suggest an image</h1>
        <p className="text-muted-foreground">
          Spotted the official image for this printing somewhere? Paste a direct link to the image
          file and submit. I&apos;ll review it before it goes live.
        </p>
      </header>
      <ImageSuggestForm card={data.card} printing={printing} setSlug={setSlug} setName={setName} />
    </div>
  );
}
