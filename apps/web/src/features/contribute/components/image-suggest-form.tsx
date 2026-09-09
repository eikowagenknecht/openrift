import type { Card, Printing } from "@openrift/shared/types/catalog";
import { CheckCircle2Icon, ImageUpIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MissingImagesList } from "@/features/contribute/components/missing-images-list";
import { useSubmitCard } from "@/features/contribute/hooks/use-card-submission";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";
import { useUploadSubmissionImage } from "@/features/contribute/hooks/use-upload-submission-image";
import type { ValidationError } from "@/features/contribute/lib/contribute-json";
import {
  buildImagePatchState,
  buildSubmissionPayload,
  validateContribution,
} from "@/features/contribute/lib/contribute-json";
import { otherMissingImages } from "@/features/contribute/lib/missing-images";

interface ImageSuggestFormProps {
  card: Card;
  printing: Printing;
  setSlug: string;
  setName: string;
}

export function ImageSuggestForm({ card, printing, setSlug, setName }: ImageSuggestFormProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const upload = useUploadSubmissionImage();
  const submit = useSubmitCard();

  const chosenUrl = uploadedUrl ?? imageUrl.trim();
  const urlError = submitted
    ? chosenUrl === ""
      ? "Add a photo or paste a link to an image."
      : errors.find((e) => e.path === "printings[0].imageUrl")?.message
    : undefined;

  function handleFiles(files: File[]) {
    const file = files[0];
    if (file === undefined) {
      return;
    }
    upload.mutate(file, {
      onSuccess: (url) => {
        setUploadedUrl(url);
        setImageUrl("");
      },
    });
  }

  function handleUrlChange(value: string) {
    setImageUrl(value);
    if (value.trim() !== "") {
      setUploadedUrl(null);
    }
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (chosenUrl === "") {
      return;
    }
    const state = buildImagePatchState({
      cardName: card.name,
      cardSlug: card.slug,
      printing,
      setSlug,
      setName,
      imageUrl: chosenUrl,
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
      <div className="flex flex-col gap-6">
        <Alert>
          <CheckCircle2Icon className="size-4" />
          <AlertTitle>Thanks! Your image suggestion is in the review queue.</AlertTitle>
          <AlertDescription>I check every submission before it goes live.</AlertDescription>
        </Alert>
        <MoreMissingImages currentPrintingId={printing.id} />
      </div>
    );
  }

  const dropzoneLabel = upload.isPending
    ? "Uploading your photo…"
    : uploadedUrl === null
      ? "Take a photo or choose one"
      : "Choose a different photo";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {uploadedUrl === null ? null : (
          <img
            src={uploadedUrl}
            alt={card.name}
            className="ring-border max-h-80 w-fit rounded-lg object-contain ring-1"
          />
        )}
        <Dropzone
          accept="image/*"
          disabled={upload.isPending}
          icon={<ImageUpIcon className="text-muted-foreground size-5" />}
          label={dropzoneLabel}
          hint="JPG or PNG, up to 20 MB. Lay the card flat and fill the frame."
          onFiles={handleFiles}
        />
        {upload.isError && <p className="text-destructive text-sm">{errorMessage(upload.error)}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="image-url">Or paste a link to an image</Label>
        <Input
          id="image-url"
          type="url"
          value={imageUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://..."
        />
        {urlError ? (
          <p className="text-destructive text-sm">{urlError}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Any image format works (.png, .jpg, .webp, .avif, ...).
          </p>
        )}
      </div>

      {submit.isError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t submit</AlertTitle>
          <AlertDescription>{errorMessage(submit.error)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          className="self-start"
          disabled={submit.isPending || upload.isPending}
        >
          <SendIcon className="size-4" />
          {submit.isPending ? "Submitting…" : "Submit image suggestion"}
        </Button>
      </div>
    </form>
  );
}

function MoreMissingImages({ currentPrintingId }: { currentPrintingId: string }) {
  const { data } = useMyMissingImages();
  if (data === undefined) {
    return null;
  }
  const remaining = otherMissingImages(data.items, currentPrintingId);
  if (remaining.length === 0) {
    return <p className="text-muted-foreground">All your cards have images now. Thanks!</p>;
  }
  return (
    <section className="flex flex-col gap-3">
      <Heading level={2}>Pick the next card</Heading>
      <MissingImagesList items={remaining} />
    </section>
  );
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message || "Something went wrong. Please try again in a moment.";
}
