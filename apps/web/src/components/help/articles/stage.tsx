import { Link } from "@tanstack/react-router";
import { EyeOffIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { StepRow } from "@/components/help/article-cards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

const KEYS: { keys: string[]; does: string }[] = [
  { keys: ["→", "↓", "Space"], does: "Next card" },
  { keys: ["←", "↑"], does: "Previous card" },
  { keys: ["Home", "End"], does: "First or last card" },
  { keys: ["T"], does: "Show or hide the card text" },
  { keys: ["F"], does: "Show or hide the thumbnail strip" },
  { keys: ["P"], does: "Push this card to the OBS overlay" },
  { keys: ["O"], does: "Show the tier board on the OBS overlay" },
  { keys: ["?"], does: "Show the key list on screen" },
  { keys: ["Esc"], does: "Leave the show" },
];

const OBS_STEPS: { title: string; description: string }[] = [
  {
    title: "Open the Stage, switch the output to OBS, and copy the browser source URL",
    description: "You need to be signed in for this.",
  },
  {
    title: "Add a Browser source in OBS and paste the link",
    description: "Set its width and height to your canvas size, usually 1920 by 1080.",
  },
  {
    title: "Pick the corner and the card size",
    description: "Both are in the OBS tab, with a live preview of exactly what your audience sees.",
  },
  {
    title: "Keep the Stage open on your phone during the stream",
    description:
      "Step through your queue with the arrows beside the preview, and clear the screen when the segment is over.",
  },
];

export default function StageArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        The Stage puts Riftbound cards in front of an audience. It has two outputs: a full-screen
        show you run on this screen and capture as a window, and a transparent overlay you paste
        into OBS as a browser source. Both are driven from the same card queue, so you can pick a
        card once and decide later where it appears.
      </p>
      <p>
        <Link to="/stage" className="text-primary font-medium hover:underline">
          Open the Stage
        </Link>
      </p>

      <section>
        <Heading className="mb-2">The full-screen show</Heading>
        <p className="text-muted-foreground">
          The show fills the screen with nothing but the cards, driven from the keyboard:
        </p>
        <dl className="divide-border mt-3 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 divide-y">
          {KEYS.map((row) => (
            <div key={row.does} className="col-span-2 grid grid-cols-subgrid items-center py-1.5">
              <dt>
                <KbdGroup>
                  {row.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dt>
              <dd className="text-muted-foreground text-sm">{row.does}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <Heading className="mb-2">The OBS overlay</Heading>
        <p className="text-muted-foreground">
          The overlay sends single cards, or a ranking that fills in as you talk through it, to a
          transparent browser source in OBS. Setting it up takes a few minutes:
        </p>
        <div className="mt-3 space-y-2">
          {OBS_STEPS.map((step, index) => (
            <StepRow
              key={step.title}
              step={index + 1}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>
      </section>

      <Alert>
        <EyeOffIcon className="size-4" />
        <AlertDescription>
          The browser source link is unique to you, so keep it off screen and out of screen shares.
        </AlertDescription>
      </Alert>
    </div>
  );
}
