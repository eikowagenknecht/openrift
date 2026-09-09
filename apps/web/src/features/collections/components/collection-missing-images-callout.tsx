import { WellKnown } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/features/account/stores/onboarding-store";
import { CardPlaceholderImage } from "@/features/cards/components/card-placeholder-image";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";

export function CollectionMissingImagesCallout() {
  const dismissed = useOnboardingStore((state) => state.missingImagesNudgeDismissed);
  const dismiss = useOnboardingStore((state) => state.dismissMissingImagesNudge);
  const { data } = useMyMissingImages();

  const count = data?.items.length ?? 0;
  if (dismissed || count === 0) {
    return null;
  }

  const single = count === 1;
  const title = single
    ? "1 card you own has no photo yet"
    : `${count} cards you own have no photo yet`;

  return (
    <Alert variant="info" className="mb-3 flex items-start gap-3">
      <div aria-hidden="true" className="w-16 shrink-0 sm:w-20">
        <CardPlaceholderImage name="" domain={[WellKnown.domain.COLORLESS]} energy={null} />
      </div>
      <div className="flex flex-col gap-0.5">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            You have {single ? "it" : "them"} in hand, so you&rsquo;re the one who can fix that. A
            phone photo is enough, we handle the rest.
          </span>
          <Button size="sm" render={<Link to="/contribute" />}>
            {single ? "Add a photo" : "Add photos"}
          </Button>
        </AlertDescription>
      </div>
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
