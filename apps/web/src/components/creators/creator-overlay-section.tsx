import { Link } from "@tanstack/react-router";

import { CreatorSection } from "@/components/creators/creator-section";
import { Button } from "@/components/ui/button";

/** The OBS setup, in the order it gets done. */
const STEPS: { title: string; detail: string }[] = [
  {
    title: "Open the overlay page and copy the browser source URL",
    detail:
      "You need to be signed in. The link is made for you on your first visit, and you can swap it for a fresh one at any time.",
  },
  {
    title: "Add a Browser source in OBS and paste the link",
    detail:
      "Set its width and height to your canvas size, usually 1920 by 1080. The overlay is transparent, so it sits over your scene with no background of its own.",
  },
  {
    title: "Pick the corner and the card size",
    detail:
      "Both are on the overlay page, with a live preview of exactly what your audience sees. You can also turn on a name and stats plate, or a QR code pointing at a deck.",
  },
  {
    title: "Keep the page open on your phone during the stream",
    detail:
      "Search a card and push it. It slides in on the overlay a moment later, and Clear takes it away again.",
  },
];

/**
 * The OBS overlay: what it is, and the four steps to get it on screen.
 *
 * @returns The overlay section.
 */
export function CreatorOverlaySection() {
  return (
    <CreatorSection id="overlay" title="Stream overlay">
      <p>
        A transparent browser source that shows whatever card you push to it, controlled from a
        second screen or your phone. Useful when you want the card your chat is arguing about on
        screen without cutting away from the game.
      </p>
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
      <div>
        <Button variant="outline" render={<Link to="/overlay" />}>
          Open the overlay page
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Anyone who has the browser source link can see what you push, so keep it out of shot and off
        screen shares. If it does get out, replacing it takes one click and the old link stops
        working straight away.
      </p>
    </CreatorSection>
  );
}
