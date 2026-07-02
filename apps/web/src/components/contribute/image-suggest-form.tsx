import type { Card, Printing } from "@openrift/shared";
import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ValidationError } from "@/lib/contribute-json";
import {
  buildCommitMessage,
  buildContributionFilename,
  buildContributionJson,
  buildGithubNewFileUrl,
  buildImagePatchState,
  formatDateStamp,
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

  const trimmedUrl = imageUrl.trim();
  const urlError = submitted
    ? errors.find((e) => e.path === "printings[0].imageUrl")?.message
    : undefined;

  function handleSubmit(event: React.FormEvent) {
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
    const stamp = formatDateStamp(new Date());
    const json = buildContributionJson(state, stamp);
    const filename = buildContributionFilename(state.slug, stamp);
    const message = buildCommitMessage(card.name, true);
    const url = buildGithubNewFileUrl(filename, json, message);
    globalThis.open(url, "_blank", "noopener,noreferrer");
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
          <p className="text-sm text-red-600 dark:text-red-400">{urlError}</p>
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
              Leave this field empty and submit. You can attach the file on the GitHub page that
              opens.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start">
          <ExternalLinkIcon className="size-4" />
          Submit via GitHub
        </Button>
        <p className="text-muted-foreground text-sm">
          Opens in a new tab to confirm. I&apos;ll review before it goes live.
        </p>
        <Collapsible className="text-muted-foreground text-sm">
          <CollapsibleTrigger className="group hover:text-foreground inline-flex cursor-pointer items-center gap-1 select-none">
            First time on GitHub?
            <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-1.5 ml-5 list-decimal space-y-1">
              <li>GitHub will offer to fork the data repo in one click. Accept it.</li>
              <li>Scroll to the bottom of the editor and click &ldquo;Propose changes&rdquo;.</li>
              <li>On the next page, click &ldquo;Create pull request&rdquo; to confirm.</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </form>
  );
}
