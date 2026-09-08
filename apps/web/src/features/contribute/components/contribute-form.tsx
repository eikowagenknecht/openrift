import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CardLayoutHelp,
  LivePreview,
} from "@/features/contribute/components/contribute-card-preview";
import { ContributeCardSection } from "@/features/contribute/components/contribute-card-section";
import { ContributePrintingsSection } from "@/features/contribute/components/contribute-printings-section";
import { ContributeSubmitBar } from "@/features/contribute/components/contribute-submit-bar";
import { useContributeForm } from "@/features/contribute/hooks/use-contribute-form";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
import { SOCIAL_LINKS } from "@/lib/social-links";

interface ContributeFormProps {
  initial: ContributeFormState;
  /** Locks the slug input: it must round-trip to `contributions/<slug>.json`. */
  lockedSlug?: string;
}

export function ContributeForm({ initial, lockedSlug }: ContributeFormProps) {
  const contribute = useContributeForm({ initial, lockedSlug });
  const { form, activePrinting } = contribute;

  return (
    <form onSubmit={contribute.handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <IntroBlock lockedSlug={lockedSlug} />

          <CardLayoutHelp form={form} activePrinting={activePrinting} />

          <ContributeCardSection
            form={form}
            errorAt={contribute.errorAt}
            setCardField={contribute.setCardField}
            prefillFromExisting={contribute.prefillFromExisting}
            lockedSlug={lockedSlug}
          />

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
          />
        </div>
        <div className="xl:sticky xl:top-20 xl:w-80 xl:shrink-0">
          <LivePreview form={form} activePrinting={activePrinting} />
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
      />
    </form>
  );
}

function IntroBlock({ lockedSlug }: { lockedSlug?: string }) {
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
