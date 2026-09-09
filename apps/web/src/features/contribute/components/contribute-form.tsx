import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { LivePreview } from "@/features/contribute/components/contribute-card-preview";
import { ContributeCardSection } from "@/features/contribute/components/contribute-card-section";
import { ContributeCardSummary } from "@/features/contribute/components/contribute-card-summary";
import {
  FieldFocusProvider,
  focusFormFieldSoon,
  useFieldFocusState,
} from "@/features/contribute/components/contribute-field-focus";
import { ContributePrintingsSection } from "@/features/contribute/components/contribute-printings-section";
import { ContributeSubmitBar } from "@/features/contribute/components/contribute-submit-bar";
import { useContributeForm } from "@/features/contribute/hooks/use-contribute-form";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
import { SOCIAL_LINKS } from "@/lib/social-links";

export type ContributeFormScope = "card" | "printing";

interface ContributeFormProps {
  initial: ContributeFormState;
  /** Locks the slug input: it must round-trip to `contributions/<slug>.json`. */
  lockedSlug?: string;
  scope?: ContributeFormScope;
  intro?: ReactNode;
  submitLabel?: string;
}

export function ContributeForm({
  initial,
  lockedSlug,
  scope = "card",
  intro,
  submitLabel,
}: ContributeFormProps) {
  const contribute = useContributeForm({ initial, lockedSlug });
  const { form, activePrinting } = contribute;
  const focus = useFieldFocusState();
  const [reveal, setReveal] = useState<PlaceholderField | null>(null);

  useEffect(() => {
    if (reveal === null) {
      return;
    }
    const cancel = focusFormFieldSoon(reveal);
    return () => {
      cancel();
    };
  }, [reveal]);

  const revealField = (field: PlaceholderField) => {
    if (field.startsWith("printing.") && activePrinting === null) {
      contribute.setActivePrinting(0);
    }
    setReveal(null);
    setReveal(field);
  };

  return (
    <FieldFocusProvider value={focus}>
      <form onSubmit={contribute.handleSubmit} className="flex flex-col gap-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {scope === "printing" ? (
              <ContributeCardSummary card={form.card} cardSlug={lockedSlug} />
            ) : (
              <ContributeCardSection
                form={form}
                errorAt={contribute.errorAt}
                setCardField={contribute.setCardField}
                prefillFromExisting={contribute.prefillFromExisting}
                lockedSlug={lockedSlug}
                reveal={reveal}
              />
            )}

            <ContributePrintingsSection
              form={form}
              activePrinting={activePrinting}
              printingsWithErrors={contribute.printingsWithErrors}
              errorAt={contribute.errorAt}
              setActivePrinting={contribute.setActivePrinting}
              setPrintingField={contribute.setPrintingField}
              addPrinting={contribute.addPrinting}
              duplicatePrinting={contribute.duplicatePrinting}
              removePrinting={contribute.removePrinting}
              scope={scope}
              reveal={reveal}
            />
          </div>
          <div className="flex flex-col gap-8 xl:sticky xl:top-20 xl:w-80 xl:shrink-0">
            {intro ?? <IntroBlock lockedSlug={lockedSlug} scope={scope} />}

            <LivePreview
              form={form}
              activePrinting={activePrinting}
              activeField={focus.active}
              onFieldHover={(field) => focus.setActive(field)}
              onFieldSelect={revealField}
            />
          </div>
        </div>

        <ContributeSubmitBar
          errors={contribute.errors}
          submitted={contribute.submitted}
          note={contribute.note}
          setNote={contribute.setNote}
          startAnother={contribute.startAnother}
          submit={contribute.submit}
          lockedSlug={lockedSlug}
          submitLabel={submitLabel}
          onJumpToError={revealField}
          setActivePrinting={contribute.setActivePrinting}
        />
      </form>
    </FieldFocusProvider>
  );
}

function IntroBlock({ lockedSlug, scope }: { lockedSlug?: string; scope: ContributeFormScope }) {
  if (scope === "printing") {
    return (
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Only this printing</AlertTitle>
        <AlertDescription>
          The card&apos;s own details stay as they are. Fill in what you can see on this version.
        </AlertDescription>
      </Alert>
    );
  }
  if (lockedSlug) {
    return (
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Change only what&apos;s wrong</AlertTitle>
        <AlertDescription>Edit the fields that are off and leave the rest alone.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>It&apos;s okay to not fill in everything</AlertTitle>
      <AlertDescription>
        <p>
          Only the name and code are mandatory. For a new version of a known card, select it first
          and copy a printing. Need help? Visit the{" "}
          <a href={SOCIAL_LINKS.discordInvite} target="_blank" rel="noreferrer">
            Discord
          </a>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
