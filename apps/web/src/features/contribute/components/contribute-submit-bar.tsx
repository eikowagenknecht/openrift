import { CheckCircle2Icon, PlusIcon, SendIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { Textarea } from "@/components/ui/textarea";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { FieldRow } from "@/features/contribute/components/form-fields";
import type { ContributeFormApi } from "@/features/contribute/hooks/use-contribute-form";
import {
  errorField,
  errorLabel,
  errorPrintingIndex,
} from "@/features/contribute/lib/contribute-preview-fields";

interface ContributeSubmitBarProps extends Pick<
  ContributeFormApi,
  "errors" | "submitted" | "note" | "setNote" | "startAnother" | "submit"
> {
  lockedSlug?: string;
  submitLabel?: string;
  onJumpToError?: (field: PlaceholderField) => void;
  setActivePrinting?: (index: number | null) => void;
}

export function ContributeSubmitBar({
  errors,
  submitted,
  note,
  setNote,
  startAnother,
  submit,
  lockedSlug,
  submitLabel,
  onJumpToError,
  setActivePrinting,
}: ContributeSubmitBarProps) {
  return (
    <>
      {submitted && errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Fix the following before submitting:</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {errors.map((e) => {
                const field = errorField(e.path);
                const label = errorLabel(e.path);
                return (
                  <li key={e.path}>
                    {field && onJumpToError ? (
                      <Pressable
                        className="underline underline-offset-2"
                        onClick={() => {
                          const index = errorPrintingIndex(e.path);
                          if (index !== null) {
                            setActivePrinting?.(index);
                          }
                          onJumpToError(field);
                        }}
                      >
                        {label}
                      </Pressable>
                    ) : (
                      <span className="font-medium">{label}</span>
                    )}
                    : {e.message}
                  </li>
                );
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {submit.isSuccess && (
        <Alert>
          <CheckCircle2Icon className="size-4" />
          <AlertTitle>Thanks! Your submission is in the review queue.</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>I check every submission before it goes live.</span>
            {!lockedSlug && (
              <Button type="button" variant="outline" size="sm" onClick={startAnother}>
                <PlusIcon className="size-4" />
                Start another card
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <FieldRow label="Note">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Spotted in the OGN set list, art variant unconfirmed."
          />
        </FieldRow>

        {submit.isError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t submit</AlertTitle>
            <AlertDescription>{submitErrorMessage(submit.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            className="self-start"
            disabled={submit.isPending || submit.isSuccess}
          >
            <SendIcon className="size-4" />
            {submit.isPending ? "Submitting…" : (submitLabel ?? "Submit your contribution")}
          </Button>
          <p className="text-muted-foreground text-sm">
            Your submission goes straight into the review queue. I check every one before it goes
            live.
          </p>
        </div>
      </div>
    </>
  );
}

function submitErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message || "Something went wrong. Please try again in a moment.";
}
