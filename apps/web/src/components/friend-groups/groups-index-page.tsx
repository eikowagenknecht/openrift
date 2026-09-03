import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { EmptyState } from "@/components/empty-state";
import { Heading } from "@/components/heading";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useTradeActionCounts, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import {
  useCreateFriendGroup,
  useDeclineFriendGroupInvite,
  useFriendGroupMatchPanels,
  useFriendGroups,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { frontImageId } from "@/lib/card-meta";
import { tradeVolumeLabel } from "@/lib/friend-group-activity";
import { deriveGroupSlug, groupSlugError } from "@/lib/group-slug";
import { markdownTeaser } from "@/lib/markdown-teaser";
import type { GroupSuggestionStrip } from "@/lib/trade-derivation";
import { groupSuggestionStripsBySlug } from "@/lib/trade-derivation";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

import { ShareListsWithGroupDialog } from "./share-lists-with-group-dialog";

/** How many thumbs a strip shows before the rest collapse into the "+N" pill. */
const MAX_THUMBS = 5;

/**
 * One direction's possible trades on a group card: the cards themselves, then
 * how many there are. Renders nothing until that group's matcher has answered,
 * and nothing when the direction is empty, so a card only carries the strips it
 * has something to say about.
 *
 * The count is the distinct-suggestion count the group's own Trades band leads
 * with; the strip's "+N" is its art overflow, which differs whenever several
 * members offer the same printing.
 * @returns The strip, or null.
 */
function SuggestionStrip({
  strip,
  label,
  printingsById,
}: {
  strip: GroupSuggestionStrip | undefined;
  label: string;
  printingsById: ReturnType<typeof useCards>["printingsById"];
}) {
  if (strip === undefined || strip.count === 0) {
    return null;
  }
  const items = strip.printingIds.map((printingId) => ({
    key: printingId,
    imageId: frontImageId(printingsById[printingId]),
  }));
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CardArtThumbStack items={items} max={MAX_THUMBS} thumbClassName="w-8" />
      <span className="text-muted-foreground min-w-0 truncate text-sm">
        <span className="text-success font-medium">{strip.count}</span> {label}
      </span>
    </div>
  );
}

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (group: { slug: string; name: string }) => void;
}) {
  const createGroup = useCreateFriendGroup();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [generateCode, setGenerateCode] = useState(true);
  // The address follows the name until someone types their own; clearing the
  // field hands it back to the name.
  const effectiveSlug = slugEdited ? slug : deriveGroupSlug(name);
  const slugError = groupSlugError(effectiveSlug);

  async function handleCreate() {
    if (!name.trim() || !effectiveSlug || slugError) {
      return;
    }
    const trimmedName = name.trim();
    const payload = {
      name: trimmedName,
      slug: effectiveSlug,
      description: description.trim() || null,
      generateCode,
    };
    try {
      const group = await createGroup.mutateAsync(payload);
      onOpenChange(false);
      // Hand off to the parent, which prompts the creator to share lists with
      // their new group and then navigates into it.
      onCreated({ slug: group.slug, name: trimmedName });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleCreate()}>
          <DialogHeader>
            <DialogTitle>Create group</DialogTitle>
            <DialogDescription>
              Closed by default. Members opt in their own lists per group.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-name">Name</Label>
              <Input
                id="fg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Tuesday Night Crew"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-slug">Web address</Label>
              <Input
                id="fg-slug"
                value={effectiveSlug}
                onChange={(e) => {
                  const next = e.target.value.toLowerCase();
                  setSlugEdited(next.length > 0);
                  setSlug(next);
                }}
                maxLength={30}
                placeholder="tuesday-crew"
              />
              {slugError ? (
                <span className="text-destructive text-xs">{slugError}</span>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Used in the URL: /groups/{effectiveSlug || "your-group"}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fg-desc">Description (optional)</Label>
              <Textarea
                id="fg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <span className="text-muted-foreground text-xs">
                Markdown works here: bold, links, and lists.
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="fg-invite">Invite link</Label>
                <span className="text-muted-foreground text-xs">
                  Admins get a link and QR code to invite people.
                </span>
              </div>
              <Switch id="fg-invite" checked={generateCode} onCheckedChange={setGenerateCode} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                !name.trim() || !effectiveSlug || Boolean(slugError) || createGroup.isPending
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsIndexPage() {
  const { data } = useFriendGroups();
  const { data: actionCounts } = useTradeActionCounts();
  const actionCountByGroup = new Map(
    (actionCounts?.byGroup ?? []).map((entry) => [entry.groupId, entry]),
  );
  // The matcher's suggestions per group, split the same way each group's own
  // Trades band splits them. Read here rather than served with the group list
  // because matching is the app's most expensive read: the cards paint from the
  // list and each strip arrives when its group answers.
  const { data: allTradesData } = useUserTrades();
  const matchPanels = useFriendGroupMatchPanels(data.items.map((row) => row.slug));
  const stripsBySlug = groupSuggestionStripsBySlug(matchPanels, allTradesData?.items ?? []);
  const { printingsById } = useCards();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  // Set right after a member joins a group (accepts an invite) or creates one,
  // so we can prompt them to share their lists with it. `navigateOnClose` lands
  // the creator inside their new group once the prompt is dismissed.
  const [shareWithGroup, setShareWithGroup] = useState<{
    slug: string;
    name: string;
    navigateOnClose: boolean;
  } | null>(null);
  const declineInvite = useDeclineFriendGroupInvite();
  const viewerId = useRequiredUserId();

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Groups</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarPrimaryButton onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              New group
            </PageTopBarPrimaryButton>
            <CreateGroupDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={(group) =>
                setShareWithGroup({ slug: group.slug, name: group.name, navigateOnClose: true })
              }
            />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        {data.outgoingRequests.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Awaiting approval</SectionHeading>
            <div className="flex flex-col gap-2">
              {data.outgoingRequests.map((request) => (
                <Card key={request.id} className="flex-row items-center justify-between gap-3 p-3">
                  <Link
                    to="/groups/$slug"
                    params={{ slug: request.groupSlug }}
                    className="flex min-w-0 flex-col"
                  >
                    <span className="truncate font-medium hover:underline">
                      {request.groupName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {request.memberCount} {request.memberCount === 1 ? "member" : "members"}
                    </span>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      declineInvite.mutate({ slug: request.groupSlug, userId: viewerId })
                    }
                    disabled={declineInvite.isPending}
                  >
                    <XIcon className="size-4" />
                    Cancel request
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data.items.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={UsersIcon}
            title="You're not in any groups yet."
            description={
              <>
                Create one above, or paste an invite code to join.{" "}
                <Link
                  to="/help/$slug"
                  params={{ slug: "groups" }}
                  className="text-primary hover:underline"
                >
                  Learn how groups work.
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((row) => {
              const actions = actionCountByGroup.get(row.id);
              // The two kinds of trade action are what the viewer does next, not
              // one undifferentiated pile: answering a request is a decision
              // someone else is blocked on, confirming your own half of a swap
              // is yours to do whenever it happens. Each gets its own badge so a
              // group with 40 unconfirmed swaps doesn't read as 40 decisions.
              const respondCount = actions?.respondCount ?? 0;
              const settleCount = actions?.settleCount ?? 0;
              // Anything that asks the viewer to act (trade actions, join
              // requests to review) gets the StatTile accent ring so the
              // group that needs you stands out from across the grid.
              const needsViewer = (actions?.count ?? 0) > 0 || row.pendingRequestCount > 0;
              // Absent until this group's matcher answers, which is why a strip
              // is dropped rather than shown as zero.
              const strips = stripsBySlug.get(row.slug);
              const teaser = markdownTeaser(row.description);
              return (
                <CardLink
                  key={row.id}
                  render={<Link to="/groups/$slug" params={{ slug: row.slug }} />}
                  className={cn(
                    "flex-col gap-2.5 p-5",
                    needsViewer && "ring-primary/40 hover:ring-primary/50",
                  )}
                >
                  {/* The roster sits beside the name rather than in a cover band:
                      every card wore the same wash, so it never told a busy group
                      from a dormant one. The card art below does that job. */}
                  <div className="flex min-w-0 items-center gap-2">
                    <Heading className="min-w-0 flex-1 truncate">{row.name}</Heading>
                    <UserAvatarStack
                      members={row.memberPreviews}
                      totalCount={row.memberCount}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>
                  {/* Their own row, so a long group name never squeezes them and
                      they never wrap into the middle of the title line. A
                      decision the viewer owes someone else outranks their own
                      housekeeping, so the request badge keeps the filled primary
                      and the swap one steps down to the tint. */}
                  {respondCount > 0 || settleCount > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {respondCount > 0 ? (
                        <Badge className="whitespace-nowrap">
                          {respondCount} trade request{respondCount === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                      {settleCount > 0 ? (
                        <Badge variant="subtle" className="whitespace-nowrap">
                          {settleCount} swap{settleCount === 1 ? "" : "s"} to confirm
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                  {row.pendingRequestCount > 0 ? (
                    <span className="text-primary text-sm font-medium">
                      {row.pendingRequestCount} request
                      {row.pendingRequestCount === 1 ? "" : "s"} to review
                    </span>
                  ) : null}
                  <SuggestionStrip
                    strip={strips?.incoming}
                    label="you could get"
                    printingsById={printingsById}
                  />
                  <SuggestionStrip
                    strip={strips?.outgoing}
                    label="they'd want"
                    printingsById={printingsById}
                  />
                  {teaser ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">{teaser}</p>
                  ) : null}
                  <p className="text-muted-foreground mt-auto flex items-center gap-1.5 pt-1.5 text-sm">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        row.recentTradedCardCount > 0 ? "bg-success" : "bg-muted-foreground/50",
                      )}
                    />
                    {tradeVolumeLabel(row.recentTradedCardCount, row.tradedCardCount)}
                  </p>
                </CardLink>
              );
            })}
          </div>
        )}
      </div>
      {shareWithGroup && (
        <ShareListsWithGroupDialog
          slug={shareWithGroup.slug}
          groupName={shareWithGroup.name}
          open
          onOpenChange={(open) => {
            if (!open) {
              if (shareWithGroup.navigateOnClose) {
                void navigate({ to: "/groups/$slug", params: { slug: shareWithGroup.slug } });
              }
              setShareWithGroup(null);
            }
          }}
        />
      )}
    </>
  );
}
