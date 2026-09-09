import { Link } from "@tanstack/react-router";
import { ImageOffIcon, XIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";

export function CollectionMissingImagesCallout() {
  const dismissed = useOnboardingStore((state) => state.missingImagesNudgeDismissed);
  const dismiss = useOnboardingStore((state) => state.dismissMissingImagesNudge);
  const { data } = useMyMissingImages();

  const items = data?.items ?? [];
  const first = items[0];
  if (dismissed || first === undefined) {
    return null;
  }

  const count = items.length;
  const single = count === 1;
  const title = single
    ? "1 card you own has no photo yet"
    : `${count} cards you own have no photo yet`;

  return (
    <Alert variant="info" className="mb-3">
      <ImageOffIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          You have {single ? "it" : "them"} in hand, so you&rsquo;re the one who can fix that. A
          phone photo is enough, we handle the rest.
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            render={
              <Link
                to="/contribute/$cardSlug/image/$printingId"
                params={{ cardSlug: first.cardSlug, printingId: first.printingId }}
              />
            }
          >
            Add a photo
          </Button>
          <Link to="/contribute">See all {count}</Link>
        </span>
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={dismiss}
          aria-label="Dismiss the missing photos nudge"
        >
          <XIcon className="size-4" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
