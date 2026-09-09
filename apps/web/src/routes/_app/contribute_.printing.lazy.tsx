import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { CardSlugPicker } from "@/features/contribute/components/card-slug-picker";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/contribute_/printing")({
  component: ContributePrintingPickerPage,
});

function ContributePrintingPickerPage() {
  const navigate = useNavigate();

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
        <Heading level={1}>Add a printing</Heading>
        <p className="text-muted-foreground">
          Find the card first, then describe the version you have in hand.
        </p>
      </header>
      <CardSlugPicker
        onPick={(cardSlug) =>
          void navigate({ to: "/contribute/card/$cardSlug/printing", params: { cardSlug } })
        }
      />
    </div>
  );
}
