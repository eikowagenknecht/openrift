import type { Card, Printing } from "@openrift/shared";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Card</dt>
        <dd className="font-medium">{card.name}</dd>
        <dt className="text-muted-foreground">Set</dt>
        <dd>{setName}</dd>
        <dt className="text-muted-foreground">Code</dt>
        <dd className="font-mono">{printing.publicCode || "(none)"}</dd>
        <dt className="text-muted-foreground">Finish</dt>
        <dd>{printing.finish}</dd>
        <dt className="text-muted-foreground">Language</dt>
        <dd>{printing.language || "EN"}</dd>
      </dl>

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
          <p className="text-red-600 dark:text-red-400">{urlError}</p>
        ) : (
          <p className="text-muted-foreground">
            A direct link to the image file is preferred (the URL should end in .png, .jpg, or
            similar). If you only have a photo or scan, leave this empty and attach it to the GitHub
            pull request after submitting.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="self-start">
          <ExternalLinkIcon className="size-4" />
          Submit image suggestion
        </Button>
        <p className="text-muted-foreground text-sm">
          A new tab opens on GitHub with everything filled in. If you don&apos;t already have a fork
          of the data repo, GitHub will offer to create one in a single click. Then click
          &ldquo;Propose changes&rdquo; at the bottom of the editor, and &ldquo;Create pull
          request&rdquo; on the next page to confirm. I&apos;ll review your submission before it
          goes live.
        </p>
      </div>
    </form>
  );
}
