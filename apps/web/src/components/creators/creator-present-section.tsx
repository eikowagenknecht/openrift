import { Link } from "@tanstack/react-router";

import { CreatorSection } from "@/components/creators/creator-section";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

/** The keys the show responds to, grouped the way they get used. */
const KEYS: { keys: string[]; does: string }[] = [
  { keys: ["→", "↓", "Space"], does: "Next card" },
  { keys: ["←", "↑"], does: "Previous card" },
  { keys: ["Home", "End"], does: "First or last card" },
  { keys: ["T"], does: "Show or hide the card text" },
  { keys: ["F"], does: "Show or hide the thumbnail strip" },
  { keys: ["?"], does: "Show the key list on screen" },
  { keys: ["Esc"], does: "Leave the show" },
];

/**
 * Presentation mode: what it is, how to open it, and the keyboard.
 *
 * @returns The presentation section.
 */
export function CreatorPresentSection() {
  return (
    <CreatorSection id="presentation" title="Presentation mode">
      <p>
        A full-screen card on a near-black stage, with nothing else on it. Point a window capture at
        the browser and you have a card display you drive from the keyboard, without your audience
        seeing the site around it.
      </p>
      <p>
        Open a deck&apos;s menu and choose <strong>Present</strong> to walk its zones in order, or
        go straight to the presentation page and search up a queue of cards in whatever order you
        want to talk about them. The queue lives in the URL, so a set you use every week is a
        bookmark.
      </p>
      <div>
        <Button variant="outline" render={<Link to="/present" />}>
          Open presentation mode
        </Button>
      </div>
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
