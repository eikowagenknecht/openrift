import {
  BookOpenIcon,
  CrownIcon,
  FolderIcon,
  HandshakeIcon,
  HeartIcon,
  KeyIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { FeatureCard, StepRow } from "@/components/help/article-cards";
import { DefinitionList, DefinitionRow } from "@/components/help/definition-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Callout } from "@/components/ui/callout";

export default function GroupsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A group is a small, closed circle of OpenRift users, like a regular playgroup, your locals,
        or a Discord trade channel. Inside a group, members share wishlists and tradelists with each
        other, pool cards into group collections, share their personal binders for others to peek
        at, and see matches when one member&apos;s wants overlap with another&apos;s haves.
      </p>

      <Callout>
        <p className="text-muted-foreground mb-3 text-center text-xs font-medium tracking-wide uppercase">
          A group page at a glance
        </p>
        <div className="bg-background flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">Tuesday Night Crew</span>
            <span className="bg-secondary text-secondary-foreground text-2xs rounded-full px-2 py-0.5 font-medium">
              Admin
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SectionChip icon={<HandshakeIcon className="size-3.5" />} label="Matches" />
            <SectionChip icon={<FolderIcon className="size-3.5" />} label="Group collections" />
            <SectionChip
              icon={<BookOpenIcon className="size-3.5" />}
              label="Personal collections"
            />
            <SectionChip icon={<UsersIcon className="size-3.5" />} label="Members" />
            <SectionChip icon={<KeyIcon className="size-3.5" />} label="Settings" />
          </div>
        </div>
      </Callout>

      <Alert>
        <ShieldIcon className="text-primary" />
        <AlertTitle>Closed by default, opt-in sharing</AlertTitle>
        <AlertDescription>
          <p>
            Joining a group always requires an admin to approve. Nobody can see your lists by
            joining anonymously.
          </p>
          <p>
            Sharing a list with a group is per-list and per-group. Sharing your wishlist with
            &quot;Tuesday Crew&quot; doesn&apos;t share it with &quot;Cube Night&quot;, and
            unsharing later only affects that one group. The list itself never leaves your account,
            only the contents become visible to the members of that one group.
          </p>
        </AlertDescription>
      </Alert>

      <section>
        <Heading className="mb-2">Roles and permissions</Heading>
        <p className="text-muted-foreground">
          Every member has one of three roles. Each group has exactly one owner.
        </p>
        <DefinitionList className="mt-3">
          <DefinitionRow icon={<CrownIcon className="size-3.5" />} label="Owner">
            Everything an admin can do, plus delete the group and transfer ownership. The role stays
            with the person who created the group until they hand it off.
          </DefinitionRow>
          <DefinitionRow icon={<ShieldIcon className="size-3.5" />} label="Admin">
            Approve or deny join requests, rotate or turn off the invite link, edit the group&apos;s
            name and description, promote members, and remove members.
          </DefinitionRow>
          <DefinitionRow icon={<UserIcon className="size-3.5" />} label="Member">
            Share their own lists, create shared collections, choose which contact methods to share,
            and leave the group at any time.
          </DefinitionRow>
        </DefinitionList>
      </section>

      <section>
        <Heading className="mb-2">Starting a group</Heading>
        <p className="text-muted-foreground">
          Open <strong className="text-foreground">Groups</strong> from the top navigation and click{" "}
          <strong className="text-foreground">New group</strong>.
        </p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Name it after the playgroup, not the cards"
            description="The name shows up to every member. Pick something they'll recognize like 'Tuesday Night Crew' or 'Hamburg locals'."
          />
          <StepRow
            step={2}
            title="Pick a URL slug"
            description="Used in the URL: /groups/<slug>. Lowercase letters, digits, and dashes. You can rename it later, but old bookmarks will break."
          />
          <StepRow
            step={3}
            title="Decide on an invite link"
            description="Leave invites on to get a link and QR code you can hand out. Turn them off to close the group to newcomers. You can rotate or turn off the link later either way."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">Joining a group</Heading>
        <p className="text-muted-foreground">
          You join someone else&apos;s group through their invite link, and an admin has to let you
          in.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<KeyIcon className="size-4" />}
            title="Invite link"
            description="Open the link an admin sent you, or scan their QR code. The page previews the group before you commit, and sends a join request to its admins."
          />
          <FeatureCard
            icon={<ShieldIcon className="size-4" />}
            title="Approval"
            description="Your request waits under 'Awaiting approval' on the Groups page. You're a member once an admin approves it, and you can cancel it before then."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">Sharing your lists</Heading>
        <p className="text-muted-foreground">
          Open the group, scroll to{" "}
          <strong className="text-foreground">Settings &rarr; Share your lists</strong>, and tick
          the lists you want to share. Untick to stop sharing. Wishlists and tradelists feed the
          matches section. Organize lists are visible to members but don&apos;t generate matches.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FeatureCard
            icon={<HeartIcon className="size-4" />}
            title="Wishlist"
            description="What you're looking for. Shows up under 'Members have what you want' when a tradelist matches."
          />
          <FeatureCard
            icon={<HandshakeIcon className="size-4" />}
            title="Tradelist"
            description="What you're offering. Shows up under 'Members want what you have' when a wishlist matches."
          />
          <FeatureCard
            icon={<FolderIcon className="size-4" />}
            title="Organize list"
            description="Reference lists you want members to see. Informational only, doesn't generate matches."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">Matches</Heading>
        <p className="text-muted-foreground">
          The Matches section at the top of the group page shows two views:
        </p>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Members have what you want</strong>: a member is
            offering a card on a tradelist they&apos;ve shared with the group, and the card is on a
            wishlist you&apos;ve shared with the group.
          </li>
          <li>
            <strong className="text-foreground">Members want what you have</strong>: the reverse.
          </li>
        </ul>
        <p className="text-muted-foreground mt-2">
          Click a member name on any match row to jump to their profile inside the group, which
          shows every match you have with that specific person. If a section is empty, it&apos;s
          either because nobody&apos;s shared the relevant kind of list yet, or because nothing
          actually overlaps right now. See{" "}
          <a href="/help/cards-printings-copies" className="text-primary hover:underline">
            Cards, Printings &amp; Copies
          </a>{" "}
          for how matches handle different printings of the same card.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Group collections</Heading>
        <p className="text-muted-foreground">
          A group collection is a pooled inventory that any member of the group can add to or remove
          from. It&apos;s useful for a club cube, a draft pool, or a binder you run together with
          friends.
        </p>
        <p className="text-muted-foreground mt-2">
          Group collections appear in your own collection sidebar alongside your private
          collections, with a group badge so you can tell them apart. They behave the same way as
          any other collection: cards can be moved in and out, filtered, searched, and printed as
          proxies. See{" "}
          <a href="/help/collections" className="text-primary hover:underline">
            Managing Your Collection
          </a>{" "}
          for the details.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Personal collections</Heading>
        <p className="text-muted-foreground">
          You can also let group members peek at one of your own personal binders without giving up
          control. Open a collection&apos;s share dialog and tick the groups you want to share it
          with under <strong className="text-foreground">Share with friend groups</strong>. Members
          see a read-only view of the cards, just like an anonymous share link, but only while
          they&apos;re signed in and a member of the group.
        </p>
        <p className="text-muted-foreground mt-2">
          On the group page, every shared personal binder is listed under{" "}
          <strong className="text-foreground">Personal collections</strong>, subgrouped by owner.
          Click one to open its read-only browser. Leaving the group, or unticking the group in the
          share dialog, immediately revokes access.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Members and contacts</Heading>
        <p className="text-muted-foreground">
          The Members section lists everyone in the group with their role. Click a member to open
          their profile inside this group, which shows their shared lists and your matches with them
          specifically.
        </p>
        <p className="text-muted-foreground mt-2">
          Add your <strong className="text-foreground">contact methods</strong> once in your profile
          (Discord, Signal, phone, email, or wherever people reach you), then open a group&apos;s
          settings to choose which of them to share with that group. Shared contacts appear next to
          your name on the Members and Trades pages, visible only to that group&apos;s members, so
          the people you&apos;re trading with know how to reach you.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Leaving, deleting, transferring</Heading>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
          <li>
            <strong className="text-foreground">Leave:</strong> members and admins can leave at any
            time from the group&apos;s Settings panel. Your shared lists detach automatically. The
            lists themselves stay on your account.
          </li>
          <li>
            <strong className="text-foreground">Transfer ownership:</strong> owners can hand the
            role to any other member from the member action menu. Once transferred, you become a
            regular admin and can then leave like anyone else.
          </li>
          <li>
            <strong className="text-foreground">Delete:</strong> only the owner can delete a group.
            Members, invites, list-shares, and the shared-collection metadata are all removed.
            Members&apos; private lists and their copies inside shared collections are unaffected.
          </li>
        </ul>
      </section>
    </div>
  );
}

function SectionChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-muted text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}
