import {
  CopyIcon,
  HandshakeIcon,
  HeartIcon,
  ListPlusIcon,
  PencilIcon,
  SquareIcon,
  SquareStackIcon,
  TagIcon,
  UploadIcon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { FeatureCard, StepRow } from "@/components/help/article-cards";
import { DefinitionList, DefinitionRow } from "@/components/help/definition-list";

export default function ListsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A <strong className="text-foreground">wishlist</strong> is what you&apos;re looking for. A{" "}
        <strong className="text-foreground">tradelist</strong> is what you&apos;d give up. Share
        either one with a{" "}
        <a href="/help/groups" className="text-primary hover:underline">
          group
        </a>{" "}
        and OpenRift matches your wants against other members&apos; haves.
      </p>

      {/* Wishlist vs tradelist at a glance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FeatureCard
          icon={<HeartIcon className="size-4" />}
          title="Wishlist"
          description="Cards you want. Entries drop off as you add copies to your collection."
        />
        <FeatureCard
          icon={<HandshakeIcon className="size-4" />}
          title="Tradelist"
          description="Specific copies you'd part with. Entries drop off as those copies leave your collection."
        />
      </div>

      {/* Kinds */}
      <section>
        <Heading className="mb-2">What lists can be made of</Heading>
        <p className="text-muted-foreground">
          Every list has a <strong className="text-foreground">kind</strong>, picked when you create
          it. The kind decides what goes on the list. See{" "}
          <a href="/help/cards-printings-copies" className="text-primary hover:underline">
            Cards, Printings &amp; Copies
          </a>{" "}
          for what these mean.
        </p>
        <DefinitionList className="mt-3">
          <DefinitionRow icon={<SquareIcon className="size-3.5" />} label="Cards">
            Any printing satisfies the entry. &quot;I need three Fury Runes, art doesn&apos;t
            matter.&quot; Available for wishlists and organize lists.
          </DefinitionRow>
          <DefinitionRow icon={<CopyIcon className="size-3.5" />} label="Printings">
            A specific version: set, art, finish. For when you want one particular printing, like a
            foil alt-art from one specific set. Available for wishlists and organize lists.
          </DefinitionRow>
          <DefinitionRow icon={<SquareStackIcon className="size-3.5" />} label="Copies">
            Specific physical copies from your collections. Tradelists are always copy-kind.
          </DefinitionRow>
        </DefinitionList>
      </section>

      {/* Creating a wishlist */}
      <section>
        <Heading className="mb-2">Creating a wishlist</Heading>
        <p className="text-muted-foreground">
          Open the <strong className="text-foreground">Collections</strong> sidebar and click{" "}
          <strong className="text-foreground">+ New wishlist</strong>.
        </p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Pick a name"
            description="'For my Yasuo deck', 'Missing rares', whatever you'll recognize."
          />
          <StepRow
            step={2}
            title="Choose a kind"
            description="Cards or printings. Pick cards unless you want one specific printing."
          />
          <StepRow
            step={3}
            title="Set the trade defaults (or skip for now)"
            description="A price reference, currency, and accepts value. You can fill these in later from List → Edit."
          />
        </div>
      </section>

      {/* Filling a wishlist */}
      <section>
        <Heading className="mb-2">Filling a wishlist</Heading>
        <p className="text-muted-foreground">
          A fresh wishlist opens with a <strong className="text-foreground">Browse catalog</strong>{" "}
          button. Clicking it puts the catalog into add-mode (a small pulsing dot in the toolbar
          marks the mode); from there, the <strong className="text-foreground">+</strong> on any
          card adds it to the list.
        </p>
        <p className="text-muted-foreground mt-2">Other paths in:</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<ListPlusIcon className="size-4" />}
            title="From the catalog"
            description="Any card cell's overflow menu has an Add to list action."
          />
          <FeatureCard
            icon={<UploadIcon className="size-4" />}
            title="Bulk import"
            description={
              <>
                Paste a text list of card names and quantities. Card-kind lists only. See{" "}
                <a href="/help/import-export" className="text-primary hover:underline">
                  Importing &amp; Exporting
                </a>{" "}
                for the format.
              </>
            }
          />
          <FeatureCard
            icon={<PencilIcon className="size-4" />}
            title="From a deck"
            description="The deck builder's missing-cards view can spin up a wishlist pre-filled with the cards in the deck you don't own yet."
          />
          <FeatureCard
            icon={<TagIcon className="size-4" />}
            title="Drag"
            description="Drag any card from the catalog grid onto the wishlist in the sidebar."
          />
        </div>
      </section>

      {/* Creating a tradelist */}
      <section>
        <Heading className="mb-2">Creating a tradelist</Heading>
        <p className="text-muted-foreground">
          Open the <strong className="text-foreground">Collections</strong> sidebar and click{" "}
          <strong className="text-foreground">+ New tradelist</strong>.
        </p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Pick a name"
            description="'Spare foils', 'For Tuesday Night Crew', 'Sell pile'."
          />
          <StepRow
            step={2}
            title="Kind is fixed to copies"
            description="No choice. Tradelists track real cards from your collection."
          />
          <StepRow
            step={3}
            title="Set the trade defaults"
            description="A price reference, currency, and accepts value. Setting these is what other members see before they reach out."
          />
        </div>
      </section>

      {/* Filling a tradelist */}
      <section>
        <Heading className="mb-2">Filling a tradelist</Heading>
        <p className="text-muted-foreground">
          Tradelists hold individual copies, so you fill them from the{" "}
          <a href="/help/collections" className="text-primary hover:underline">
            collection
          </a>{" "}
          side, not the catalog side. Two paths:
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<ListPlusIcon className="size-4" />}
            title="From a collection"
            description="Open the collection, select copies (Ctrl-click or the bulk-select toggle in the toolbar), and use Add to list in the floating action bar."
          />
          <FeatureCard
            icon={<TagIcon className="size-4" />}
            title="Drag"
            description="Drag a copy from the grid onto the tradelist in the sidebar."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Adding a copy to a tradelist doesn&apos;t move it out of its collection. The copy stays
          where it physically is; the tradelist just flags it as available. When you trade it away,
          dispose or move it like any other copy and it drops off the tradelist.
        </p>
      </section>

      {/* Trade preferences */}
      <section>
        <Heading className="mb-2">Setting prices and trade preferences</Heading>
        <p className="text-muted-foreground">
          Trade preferences live in two layers: a default that applies to the whole list, and
          optional per-card overrides. When the list is shared into a group, these are what show up
          as the <strong className="text-foreground">They:</strong> and{" "}
          <strong className="text-foreground">You:</strong> lines on match rows.
        </p>

        <h3 className="mt-4 font-semibold">List defaults</h3>
        <p className="text-muted-foreground mt-1">
          Set in the create dialog, or later from <strong className="text-foreground">Edit</strong>{" "}
          on the list page. Three fields:
        </p>
        <DefinitionList className="mt-3">
          <DefinitionRow label="Price reference">
            A <strong className="text-foreground">marketplace price</strong> (Cardmarket, TCGplayer,
            or CardTrader), a <strong className="text-foreground">fixed</strong> amount you type in,
            or blank to say &quot;let&apos;s negotiate&quot;.
          </DefinitionRow>
          <DefinitionRow label="Currency">EUR or USD. Used for fixed amounts.</DefinitionRow>
          <DefinitionRow label="Accepts">
            <strong className="text-foreground">Cards</strong>,{" "}
            <strong className="text-foreground">Money</strong>, or{" "}
            <strong className="text-foreground">Both</strong>.
          </DefinitionRow>
        </DefinitionList>

        <h3 className="mt-4 font-semibold">Per-card overrides</h3>
        <p className="text-muted-foreground mt-1">
          Each entry has a pill showing its current preference (inherited from the list, or
          overridden). Click it to set a different price or accepts value for that one card. An
          override only replaces the fields you change; the others still fall through to the list
          default.
        </p>
      </section>

      {/* Adjusting quantities and removing entries */}
      <section>
        <Heading className="mb-2">Adjusting quantities and removing entries</Heading>
        <p className="text-muted-foreground">
          Wishlists have <strong className="text-foreground">−</strong> /{" "}
          <strong className="text-foreground">+</strong> next to the quantity. Tradelists show a
          count of copies (one per physical card). Right-click an entry or use the row actions menu
          to remove it.
        </p>
      </section>

      {/* Importing and exporting */}
      <section>
        <Heading className="mb-2">Importing and exporting</Heading>
        <p className="text-muted-foreground">
          Card-kind lists can be imported from and exported to plain text (one card per line with
          quantities). Printing-kind and copy-kind lists can&apos;t be imported that way, since
          pasted text can&apos;t identify a specific printing or copy, but they export as a CSV file
          in the same formats as a collection (OpenRift, Piltover Archive, RiftMana, RiftCore). See{" "}
          <a href="/help/import-export" className="text-primary hover:underline">
            Importing &amp; Exporting
          </a>{" "}
          for the formats.
        </p>
      </section>

      {/* Sharing with a group */}
      <section>
        <Heading className="mb-2">Sharing a list with a group</Heading>
        <p className="text-muted-foreground">
          Lists are private by default. To share one with a{" "}
          <a href="/help/groups" className="text-primary hover:underline">
            group
          </a>
          , open the group page, scroll to{" "}
          <strong className="text-foreground">Settings &rarr; Share your lists</strong>, and tick
          the list. Each list is shared per-group, so sharing a wishlist with one group doesn&apos;t
          share it with any other group you&apos;re also in. Untick at any time to stop sharing.
        </p>
      </section>

      {/* Organize lists */}
      <section>
        <Heading className="mb-2">A note on organize lists</Heading>
        <p className="text-muted-foreground">
          Alongside wishlists and tradelists there&apos;s an{" "}
          <strong className="text-foreground">organize list</strong> for grouping cards that
          aren&apos;t about trading: a brew pool, a custom-format pile, favorite alt-arts. Organize
          lists support all three kinds. They can be shared into a group and members can see them,
          but they don&apos;t feed into matches.
        </p>
      </section>
    </div>
  );
}
