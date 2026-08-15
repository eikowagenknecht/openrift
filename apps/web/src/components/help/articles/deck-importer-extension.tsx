import { InfoIcon, LinkIcon, ListIcon, ScanTextIcon, TableIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { FeatureCard, StepRow } from "@/components/help/article-cards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SOCIAL_LINKS } from "@/lib/social-links";

export default function DeckImporterExtensionArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        The deck importer is a small Firefox add-on. You&apos;re on another site looking at a
        decklist, you click the OpenRift icon in the toolbar, and the deck lands on OpenRift&apos;s
        import page with its name and source link filled in. No copying, no export step, and it
        works whether or not you&apos;re signed in.
      </p>

      {/* Install */}
      <section>
        <Heading className="mb-2">Install it</Heading>
        <p className="text-muted-foreground">
          Mozilla signs the add-on, but I host it myself instead of listing it on
          addons.mozilla.org, so installing takes one extra confirmation.
        </p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Download the add-on"
            description="Open the link below in Firefox. It hands you the add-on file directly."
          />
          <StepRow
            step={2}
            title="Confirm the install"
            description="Firefox asks whether to add it and lists what it may access. Adding it puts an OpenRift icon in the toolbar."
          />
          <StepRow
            step={3}
            title="Pin the icon"
            description="Optional, but worth it: open the puzzle-piece menu and pin OpenRift so importing is a single click."
          />
        </div>
        <p className="mt-3">
          <a
            href={SOCIAL_LINKS.extensionDownload}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium hover:underline"
          >
            Download the deck importer for Firefox
          </a>
        </p>
        <p className="text-muted-foreground mt-3">
          Updates take care of themselves. Firefox checks for a newer signed build roughly once a
          day, so you only ever do this once.
        </p>
      </section>

      {/* Use */}
      <section>
        <Heading className="mb-2">Import a deck</Heading>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Open the decklist"
            description="Any page on another site showing the deck you want, on the tab you're reading."
          />
          <StepRow
            step={2}
            title="Click the OpenRift icon"
            description="It reads the deck from that page, once, and opens OpenRift's import page in a new tab."
          />
          <StepRow
            step={3}
            title="Review and save"
            description="The deck name comes from the page heading, and the page's own address is offered as a deck link you can keep or drop. Check the cards it matched, then save."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Signed out, the deck is saved in your browser and moves to your account the next time you
          sign in.
        </p>
      </section>

      {/* What it reads */}
      <section>
        <Heading className="mb-2">What it can read</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<TableIcon className="size-4" />}
            title="Decklist tables"
            description="A table of card names and quantities, with zones kept apart. The common shape on deck sites."
          />
          <FeatureCard
            icon={<ListIcon className="size-4" />}
            title="Card lists with headings"
            description="A plain list of names under section headings. Sideboards stay separate; card-type groupings fold into the main deck."
          />
          <FeatureCard
            icon={<ScanTextIcon className="size-4" />}
            title="Deck codes on the page"
            description="A deck code in the address, in the text, or behind a link. It's decoded to check it really is one before anything happens."
          />
          <FeatureCard
            icon={<LinkIcon className="size-4" />}
            title="Nothing it recognizes"
            description="A brief '?' shows on the icon and it stops there. Copy the list by hand into the import page instead."
          />
        </div>
      </section>

      {/* Access */}
      <section>
        <Heading className="mb-2">What it can access</Heading>
        <p className="text-muted-foreground">
          Only the tab you&apos;re on, only in the moment you click. It asks for no list of sites,
          so it can&apos;t run in the background, and it never sees your browsing history. Reading
          happens inside the page, and the only thing that leaves is the deck itself, as part of the
          import link that opens.
        </p>
      </section>

      {/* Limitation */}
      <section>
        <Alert>
          <InfoIcon className="text-primary" />
          <AlertDescription>
            Firefox only for now. A Chrome version is built and works, but Chrome allows no way to
            install one outside its Web Store, and I haven&apos;t taken it through that yet.
          </AlertDescription>
        </Alert>
      </section>
    </div>
  );
}
