import type { Card, Printing } from "@openrift/shared/types/catalog";
import { CheckCircle2Icon, ChevronRightIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubmitCard } from "@/hooks/use-card-submission";
import type { ValidationError } from "@/lib/contribute-json";
import {
  buildImagePatchState,
  buildSubmissionPayload,
  validateContribution,
} from "@/lib/contribute-json";

interface ImageSuggestFormProps {
  card: Card;
  printing: Printing;
  setSlug: string;
  setName: string;
}

export function ImageSuggestForm({ card, printing, setSlug, setName }: ImageSuggestFormProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const submit = useSubmitCard();

  const trimmedUrl = imageUrl.trim();
  const urlError = submitted
    ? errors.find((e) => e.path === "printings[0].imageUrl")?.message
    : undefined;

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const state = buildImagePatchState({
      cardName: card.name,
      cardSlug: card.slug,
      printing,
      setSlug,
      setName,
      imageUrl: trimmedUrl,
    });
    const result = validateContribution(state);
    setErrors(result.errors);
    if (!result.ok) {
      return;
    }
    submit.mutate(buildSubmissionPayload(state, null));
  }

  if (submit.isSuccess) {
    return (
      <Alert>
        <CheckCircle2Icon className="size-4" />
        <AlertTitle>Thanks! Your image suggestion is in the review queue.</AlertTitle>
        <AlertDescription>I check every submission before it goes live.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-url">Image URL</Label>
        <Input
          id="image-url"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://..."
        />
        {urlError ? (
          <p className="text-destructive text-sm">{urlError}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Any image format works (.png, .jpg, .webp, .avif, ...).
          </p>
        )}
        <Collapsible className="text-muted-foreground text-sm">
          <CollapsibleTrigger className="group hover:text-foreground inline-flex cursor-pointer items-center gap-1 select-none">
            Only have a photo or scan?
            <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="mt-1.5">
              Host it somewhere with a direct link (any image host works) and paste that link here.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {submit.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t submit</AlertTitle>
          <AlertDescription>{submitErrorMessage(submit.error)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start" disabled={submit.isPending}>
          <SendIcon className="size-4" />
          {submit.isPending ? "Submitting…" : "Submit image suggestion"}
        </Button>
        <p className="text-muted-foreground text-sm">
          Goes straight into the review queue. I&apos;ll review before it goes live.
        </p>
      </div>
    </form>
  );
}

function submitErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message || "Something went wrong. Please try again in a moment.";
}
