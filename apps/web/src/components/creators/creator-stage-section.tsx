import { Link } from "@tanstack/react-router";

import { CreatorSection } from "@/components/creators/creator-section";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/** The OBS setup, in the order it gets done. */
const STEPS: { title: string; detail: string }[] = [
  {
    title: "Open the Stage, switch the output to OBS, and copy the browser source URL",
    detail:
      "You need to be signed in for this half. The link is made for you on your first visit, and you can swap it for a fresh one at any time.",
  },
  {
    title: "Add a Browser source in OBS and paste the link",
    detail:
      "Set its width and height to your canvas size, usually 1920 by 1080. The source is transparent, so it sits over your scene with no background of its own.",
  },
  {
    title: "Pick the corner and the card size",
    detail:
      "Both are in the OBS tab, with a live preview of exactly what your audience sees. You can also turn on a name and stats plate, or a QR code pointing at a deck.",
  },
  {
    title: "Keep the Stage open on your phone during the stream",
    detail:
      "Step through your queue with the arrows beside the preview, put a ranking up and reveal it card by card, and clear the screen when the segment is over.",
  },
];

/** The keys the show responds to, grouped the way they get used. */
const KEYS: { keys: string[]; does: string }[] = [
  { keys: ["→", "↓", "Space"], does: "Next card" },
  { keys: ["←", "↑"], does: "Previous card" },
  { keys: ["Home", "End"], does: "First or last card" },
  { keys: ["T"], does: "Show or hide the card text" },
  { keys: ["F"], does: "Show or hide the thumbnail strip" },
  { keys: ["P"], does: "Push this card to the OBS overlay" },
  { keys: ["?"], does: "Show the key list on screen" },
  { keys: ["Esc"], does: "Leave the show" },
];

/**
 * The Stage: one page, two ways of getting cards on screen, and the setup each
 * of them needs.
 *
 * @returns The stage section.
 */
export function CreatorStageSection() {
  return (
    <CreatorSection id="stage" title="Stage">
      <p>
        One page for putting Riftbound cards in front of an audience, with two ways out of it. On
        this screen it runs a full-screen show you drive from the keyboard, with nothing of the site
        around it, and it can put a tier list up as a board you rank live on camera. To OBS it sends
        single cards, or a ranking that fills in as you talk through it, over a transparent browser
        source. Save a setup as a preset to bring it back next week, and pick what the card sits on
        while you are there: black, or a green or magenta ground to key out if you cut your video in
        an editor rather than live.
      </p>
      <p>
        Build the queue on the Stage itself, or start one from somewhere else: a deck&apos;s menu
        has <strong>Present</strong> to walk its zones in order, and a tier list can go straight up
        as a board. The queue lives in the URL, so a set you use every week is a bookmark.
      </p>
      <div>
        <Button variant="outline" render={<Link to="/stage" />}>
          Open the Stage
        </Button>
      </div>

      <h3 className="font-medium">Setting up the OBS source</h3>
      <ol className="flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums">
              {index + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{step.title}</p>
              <p className="text-muted-foreground text-sm">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-sm">
        Anyone who has the browser source link can see what you push, so keep it out of shot and off
        screen shares. If it does get out, replacing it takes one click and the old link stops
        working straight away.
      </p>

      <h3 className="font-medium">Keys in the full-screen show</h3>
      <dl className="divide-border grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 divide-y">
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
      <p className="text-muted-foreground text-sm">
        Modifier presses are left alone, so your browser and window shortcuts keep working while the
        show is up.
      </p>
    </CreatorSection>
  );
}
