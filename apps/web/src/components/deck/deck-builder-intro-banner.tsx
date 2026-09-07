import type { DeckFormat } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { InfoIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

function introSteps(format: DeckFormat): readonly { title: string; description: string }[] {
  const singleBattlefield = format === WellKnown.deckFormat.CUSTOM_REGION;
  return [
    { title: "Pick a Legend", description: "Sets your deck's domains. Runes auto-fill 6/6." },
    { title: "Choose a Champion", description: "Suggested by your Legend's tag." },
    singleBattlefield
      ? { title: "Add a Battlefield", description: "One battlefield card." }
      : { title: "Add Battlefields", description: "Three unique battlefield cards." },
    { title: "Fill the Main Deck", description: "39 units, spells, and gear from your domains." },
  ];
}

const INTRO_TIPS: readonly string[] = [
  "Click + on a card to add a copy, or drag it onto a zone. Shift adds the maximum.",
  "Edits save automatically as you go.",
];

// Dismissed for good once closed; the flag lives in the onboarding store.
export function DeckBuilderIntroBanner({
  format,
  onDismiss,
}: {
  format: DeckFormat;
  onDismiss: () => void;
}) {
  const formatTip =
    format === WellKnown.deckFormat.CONSTRUCTED
      ? "The deck is checked against the rules as you build, and violations show up right away."
      : format === WellKnown.deckFormat.CUSTOM_REGION
        ? "Every card must belong to your chosen regions, one battlefield is played, there is no sideboard, and signature cards need their champion in the deck. Violations show up as you build."
        : "You can build without rule restrictions.";
  return (
    <Callout>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss this guide"
        className="text-muted-foreground absolute top-2 right-2"
      >
        <XIcon className="size-4" />
      </Button>
      <div className="mx-auto flex max-w-5xl gap-3 pr-6">
        <InfoIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">Build your deck in four steps</p>
            <p className="text-muted-foreground mt-0.5">
              The card browser auto-filters as you fill each zone, so you only see what fits.
            </p>
          </div>
          <div className="grid gap-4 @lg:grid-cols-2">
            <ol className="grid gap-2 self-start">
              {introSteps(format).map((step, index) => (
                <li
                  key={step.title}
                  className="bg-background flex items-start gap-2 rounded-md border p-2"
                >
                  <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-medium">{step.title}</span>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <p className="font-medium">Good to know</p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  Decks track{" "}
                  <Link
                    to="/help/$slug"
                    params={{ slug: "cards-printings-copies" }}
                    className="text-primary hover:underline"
                  >
                    cards, not specific printings
                  </Link>
                  , so any printing you own counts toward the deck.
                </li>
                {INTRO_TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
                <li>{formatTip}</li>
              </ul>
            </div>
          </div>
          <Link
            to="/help/$slug"
            params={{ slug: "deck-building" }}
            className="text-primary hover:underline"
          >
            Read the full guide →
          </Link>
        </div>
      </div>
    </Callout>
  );
}
