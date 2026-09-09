import { enumLabel } from "@openrift/shared/enum-label";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Heading } from "@/components/heading";
import { CardList } from "@/components/ui/card-list";
import { Skeleton } from "@/components/ui/skeleton";
import { cardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { CardSlugPicker } from "@/features/contribute/components/card-slug-picker";
import { MyMissingImagesSection } from "@/features/contribute/components/my-missing-images-section";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/image")({
  component: ContributeImagePickerPage,
});

function ContributeImagePickerPage() {
  const [cardSlug, setCardSlug] = useState<string | null>(null);

  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING, "flex flex-col gap-6")}>
      <Link
        to="/contribute"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5"
      >
        <ArrowLeftIcon className="size-4" />
        Back
      </Link>
      <header className="flex flex-col gap-1">
        <Heading level={1}>Add a missing image</Heading>
        <p className="text-muted-foreground">
          A phone photo of the card in hand is enough, we handle the rest.
        </p>
      </header>

      <MyMissingImagesSection />

      <section className="flex flex-col gap-3">
        <Heading level={2}>Any other card</Heading>
        <CardSlugPicker onPick={setCardSlug} />
        {cardSlug === null ? null : (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <PrintingChoices key={cardSlug} cardSlug={cardSlug} />
          </Suspense>
        )}
      </section>
    </div>
  );
}

function PrintingChoices({ cardSlug }: { cardSlug: string }) {
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const setNameById = new Map(data.sets.map((s) => [s.id, s.name]));

  return (
    <CardList>
      {data.printings.map((printing) => (
        <li key={printing.id}>
          <Link
            to="/contribute/card/$cardSlug/printing/$printingId/image"
            params={{ cardSlug, printingId: printing.id }}
            className="hover:bg-muted flex items-center justify-between gap-3 rounded-md px-3 py-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{printing.printedName ?? data.card.name}</span>
              <span className="text-muted-foreground truncate text-sm">
                {setNameById.get(printing.setId) ?? ""} · {printing.publicCode} ·{" "}
                {enumLabel(labels.finishes, printing.finish)} ·{" "}
                {enumLabel(languageLabels, printing.language)}
              </span>
            </span>
            {printing.images.length > 0 && (
              <span className="text-muted-foreground shrink-0 text-sm">Image on file</span>
            )}
          </Link>
        </li>
      ))}
    </CardList>
  );
}
