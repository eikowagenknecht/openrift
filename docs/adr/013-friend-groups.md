---
status: accepted
date: 2026-05-19
---

# ADR-013: Friend Groups for Trading Discovery

## Context and Problem Statement

OpenRift's collection model (ADR-005) already supports wishlists, tradelists, and per-list share tokens. But share tokens are coarse: one link per list, anyone with the URL has access. Real-world trading happens inside fixed circles — an LGS playgroup, a Nexus Night crew, a Discord cell of 5–15 people — where members repeatedly wish/trade among themselves. Today a user has to hand each friend a separate share link per list, with no way to ask "which of my friends has the cards I'm looking for?"

We want first-class **friend groups** where members can opt-in their existing wishlists/tradelists per group, and the app surfaces matches across the group.

**Trade execution is intentionally _not_ in the system.** The actual exchange happens out-of-band — in person at Nexus Night, in a Discord DM, by post — and OpenRift never models proposals, counter-offers, or a two-sided ledger. The app's job is discovery; the humans handle the trade and each user updates their own collection independently afterwards. This is a deliberate, permanent choice, not a deferral. ADR-005's deferred "trade sessions" item is superseded by this stance.

## Decision Drivers

- Small, persistent friend groups (~2–20 members typical) — closed by default, no public discovery
- Privacy-preserving: nothing about a user's collection or lists is visible to a group until they opt in
- Joining must be spam-resistant — leaked codes and unsolicited invites are the two failure modes
- Existing primitives (`lists`, `list_entries`, copies) cover the data; we only need group membership + a sharing scope
- Trade negotiation happens externally (Discord, in person) — no in-app messaging in this ADR
- Matches must be live: when a member adds a card to their tradelist, their groups see it without re-sharing

## Considered Options

- **Per-list ACLs** — extend `lists` with per-user grant rows ("share list X with user Y"). No group concept.
- **Friend groups with opt-in sharing** — new `friend_groups` + `friend_group_members` + `friend_group_list_shares` tables; lists join groups, not users.
- **Re-purpose share tokens** — generate a token, post it in a private chat, members enter it manually. No first-class group.

## Decision Outcome

Chosen option: **Friend groups with opt-in sharing**, because per-list ACLs scale poorly (N users × M lists → membership churn on every roster change) and share-token re-use gives us no matchmaking surface. A group entity captures the social unit explicitly, which is exactly what the match view needs as its scope.

### Consequences

- Good — matchmaking is a single SQL query: intersect my wishes with co-members' shared trades, scoped to one group.
- Good — sharing a list with a group is one row; revoking is one row; no ACL fan-out across users.
- Good — leaving or being kicked cleanly auto-revokes via FK cascade, with no separate cleanup logic.
- Bad — three new tables and a small surface of new endpoints. Mitigated by the model being narrow and read-mostly.
- Bad — slugs introduce a global namespace and a squatting risk. Mitigated by a length floor and a reserved-slug list.

## Design Decisions

### Group entity

`friend_groups` carries: `id` (uuidv7), `slug` (unique, `[a-z0-9-]`, 3–30 chars, used in URLs, mutable), `name` (1–60 chars), `description` (markdown, 500 char max), `code` (nullable text, 12-char base62 produced by the existing `generateShareToken()` helper in `apps/api/src/utils/share-token.ts` — same format as collection/deck/list share tokens, ~71 bits entropy), `code_rotated_at`, `created_at`, `updated_at`. No avatar in this ADR (out of scope; nickname covers in-group identity).

The join code is **nullable**. `code IS NULL` disables the code-based join flow entirely for that group — direct invites by username/email are then the only entry path. Owner/admin toggles this from group settings. `code` is uniquely indexed where not null, so `/groups/join?code=X` resolves unambiguously.

**Slugs are mutable, with no redirect.** Owner/admin can rename. The old slug is freed immediately and any URLs pointing at it 404. We accept the broken-bookmark cost because friend-group memberships are small and members find each other through the index, not by guessing URLs. A small reserved-slug list (`new`, `join`, `create`, `settings`, `admin`) prevents collisions with app-level routes and obvious squat targets.

No hard cap on group size or on how many groups a user owns or joins. The use case is small playgroups; abuse is hypothetical and we revisit if it shows up.

### Membership and roles

`friend_group_members(group_id, user_id, role, nickname, joined_at)` with composite PK `(group_id, user_id)`. `role ∈ {owner, admin, member}`. A partial unique index `WHERE role = 'owner'` enforces "exactly one owner per group" at the schema level.

`nickname` is the per-group contact note (e.g. `"Sebastian — Discord: seb#1234"`), 0–80 chars, visible only to other members of this group. It is the user's intended channel for trade negotiation, since the app has no DMs.

Role capabilities:

- **member**: view membership, see shared lists and match views, share/unshare their own lists, leave, edit own nickname.
- **admin**: everything members can do, plus approve/deny pending join requests, send direct invites, kick non-admin members, rotate the join code, edit group metadata (name, description, slug), promote/demote other admins. Admins **cannot** demote the owner or delete the group.
- **owner**: everything admins can do, plus delete the group and transfer ownership. The owner **cannot leave** without first transferring ownership to another member.

Ownership transfer is a single endpoint that atomically demotes the outgoing owner to `admin` and promotes the target to `owner`.

### Joining: two flows, one table

Both flows route through `friend_group_invites(id, group_id, user_id, direction, created_at)` where `direction ∈ {invite, request}`:

- **Invite (group → user).** An admin or owner creates a row with `direction='invite'` targeting a specific user by username/email. The invitee sees a pending invite they accept (creates the membership row, deletes the invite row) or decline (deletes the row).
- **Request (user → group).** A user enters the group code at `/groups/join` and a row with `direction='request'` is created. Admins/owner see it as a pending request to approve (creates the membership row, deletes the request) or deny (deletes the request).

`UNIQUE (group_id, user_id)` enforces "at most one pending invite or request per (group, user)" — both deduplicates clicks and prevents duplicate-row spam.

### Anti-spam

Two layers, no rate limits in this ADR:

1. **Code + approval is mandatory.** The join code is not sufficient on its own — entering it puts the user in the request queue. The owner or an admin must approve before the user becomes a member. A leaked code therefore generates noise (pending requests) but never a breach.
2. **Rotatable code.** Admins or the owner can rotate the join code at any time. The old code stops working immediately for new requests. Already-pending requests are preserved — they have been seen and are queued. Rotation is the response to a leak.

Direct invites bypass the code entirely; they are sent by admins to specific users, so there is no attack surface there.

We deliberately do **not** add per-user invite rate limits, a global "don't invite me" opt-out, or a block list on kick. The friend-group scope is small and the social cost of misuse is high; if abuse appears in practice we revisit. Kicked users can be re-invited or re-request immediately.

### Opt-in list sharing

> **Amended 2026-06-12, reverted 2026-06-16.** Sharing was briefly made **opt-out** — share rows were created automatically when a wish/trade list was created (into all of the owner's groups) and when a membership was created (group creation and invite/request acceptance shared the new member's existing wish/trade lists). This was reverted because auto-sharing surprised users: lists they thought were private became visible the moment they joined a group, with no clear point of consent. Sharing is **opt-in** for every `intent`: a new list is private, and the owner picks which groups can see it from the create dialog or the manage page. No share rows are ever inserted automatically. To keep sharing discoverable (the original reason for the opt-out experiment) without a silent default, two deliberate prompts replace it: creating a group or accepting an invite to one opens a one-time "share these lists?" dialog (pre-selected for one-click confirm, but nothing is shared until the user confirms), and the Trades view shows an inline share nudge whenever the viewer has no list shared with that group. The one-time opt-out backfill (migration 150) is left in place as historical data — existing shares are not removed; users manage them from the manage page.

`friend_group_list_shares(group_id, list_id, user_id, shared_at)` with PK `(group_id, list_id)`. The `user_id` column is denormalised so that the FK back to `friend_group_members(group_id, user_id)` can cascade-delete this user's shares when they leave the group.

- Sharing is **per group, all members, live.** Any subsequent edit to the list propagates immediately — there is no snapshotting.
- The same list can be shared with **multiple groups** simultaneously. Unsharing affects only the selected group.
- No list is shared by default (see amendment above); every list, regardless of `intent`, is shared only when the owner toggles it on for a group from the list's visibility control, the create dialog, or the group page.
- **All three `intent` values can be shared.** `wish` and `trade` lists drive the match view. `organize` lists are shareable too but **do not participate in matches** — they surface on the member detail page as informational context ("Alice is organizing _Spiritforged Vault_"), useful for "what's this person collecting / curating" without implying a wish/trade signal.
- Leaving or being kicked deletes the membership row, which cascades to delete all of that user's `friend_group_list_shares` rows for that group. Re-joining starts fresh — share records are not retained, and the user re-shares whatever they want to be visible again.
- The `lists.id` FK uses `ON DELETE CASCADE` so deleting a list cleans up its shares.

### Match view

Computed live at query time, never materialised. **Only `wish` ↔ `trade` shares participate** — deck-derived demand (the virtual shortfall from `is_wanted=true` decks in ADR-005) and `organize` lists are explicitly excluded. Users who want their deck wishes visible to a group must mirror them into an explicitly-shared wishlist. This keeps the model "what you opted in is what's visible" with no implicit coupling between decks and groups.

For viewer U in group G, two virtual sets:

- **Members have what you want.** Inner-join U's `intent='wish'` list entries against the `intent='trade'` list entries of every other member whose tradelist is in `friend_group_list_shares` for G.
  - A wish entry with `kind='card'` matches any copy of that card.
  - A wish entry with `kind='printing'` matches only copies of that exact printing.
  - Result rows are at copy granularity (each `list_entries` row of `kind='copy'` is one offer), so once per-copy condition / notes land (deferred per ADR-005), they surface here automatically.
- **Members want what you have.** Mirror query: their wish entries against U's shared trade entries.

The view groups matches by counterparty (display name, avatar, per-group nickname). Each counterparty heading is a link to that member's page within the group (see _User experience surfaces_ below) where the viewer can see all their matched cards and all of their shared lists in one place. Last-active and any other presence indicator are out of scope for this ADR; the nickname is where members put their external contact info, and there is no DM surface.

### Group lifecycle

- **Create.** Any authenticated user can create a group; they become its owner.
- **Edit metadata.** Owner or any admin can change name, description, slug. Slug must remain unique and not collide with the reserved list. Renames take effect immediately, old slug stops resolving.
- **Rotate code.** Owner or admin. Old code dies, pending requests survive (already-in-the-queue requests have been seen and admins decide on them; rotation just stops _new_ ones).
- **Toggle code.** Owner or admin can null out `code` to disable code-based joining entirely; reissuing generates a fresh token.
- **Delete.** Owner only. Cascades to members, invites, and list-shares.
- **Owner leaving.** Forbidden until they transfer ownership. The transfer endpoint and the leave endpoint are separate. **Transfer target must already be a member of the group** (owner cannot transfer to a non-member or to themselves).
- **Owner account deletion.** When a user account is deleted, the `users → friend_group_members` cascade fires. A trigger on `friend_group_members` watches for the owner row disappearing and auto-promotes a successor: oldest admin by `joined_at`, else oldest plain member, else the group is deleted. This preserves the "exactly one owner per group" invariant without requiring the user-deletion service to know anything about friend groups.
- **No activity feed.** Membership and shares are state, not a stream. A member list plus a "shared lists" list is enough.

## User experience surfaces

The architectural decisions above land in these routes and affordances. Pixel-level design is the implementing PR's concern; what's listed here is what the data model and API need to support.

### Routes

- **`/groups`** — index of groups the viewer is a member of, plus their pending personal invites pinned at the top. Each group row shows name, member count, avatars, and a small badge counting pending join requests **if the viewer is admin/owner of that group**. "Create group" and "Join with code" CTAs.
- **`/groups/join?code=…`** — code-paste flow and the canonical shareable invite URL. `https://openrift.app/groups/join?code=XYZ` is what an admin sends in Discord; pasting just the code into the join field on `/groups/join` works equally. Looks up the group by code, shows a preview (name, member count, owner display name), and submits a `direction='request'` invite row. Lands the user in the _Pending approval_ empty state. If the group has `code IS NULL`, the page renders "This group is invite-only — ask an admin to invite you directly."
- **`/groups/$slug`** — group page. Three stacked sections (no tabs):
  - **Matches** (top, default focus). Two stacked panels: "Members have what you want", then "Members want what you have". Each panel groups by counterparty, with cards rendered via the existing `<CardCell>` slot pattern (per `docs/contributing.md` card-browser conventions).
  - **Members**. Roster with role badges, display name, avatar, per-group nickname. Admin row actions inline: kick, promote, demote. Owner-only actions: transfer ownership.
  - **Settings** (admin+ only). Name, description, slug (with rename warning), join code with rotate button, **list-share management** (which of the viewer's own lists are shared with this group — checkboxes, one row per list), and delete (owner-only, with destructive confirm). Plain members see a subset of this section: just the list-share toggles for their own lists.
- **`/groups/$slug/members/$user_id`** — single-member view inside a group. Shows the member's matched cards (filtered to this counterparty), all of their lists shared with this group grouped by intent (wish / trade / organize — `organize` lives here as informational, not in the match view), their nickname, and contact-info-as-typed. This is the "drill into one trade partner" page.

### Sharing affordance

List-share toggles live on the **group page** _and_ on the list's share dialog. From `/lists/$id`, a passive read-only badge says "shared with N groups" and links to a popover that lists the group names; the share dialog (opened from the list's overflow menu) exposes the same per-group checkboxes alongside the public link controls. Both surfaces write to the same `friend_group_list_shares` rows and invalidate each other's caches.

> **2026-05-28 update:** Originally this ADR placed toggles only on the group page, to keep the list page free of group concepts. When shared collections shipped (a sibling feature with the same per-group shape), the collection share dialog combined link sharing and group toggles in one place, which read as more discoverable. Lists now follow the same shape for parity. The per-list × per-group fan-out concern didn't materialise — the same mutation hooks drive both surfaces, so there is no duplicated write path.

### Cross-surface integration

The match query has one explicit cross-surface consumer: the **shopping list**. When a card has an unmet demand (from a wishlist or wanted deck) and a co-member's shared tradelist contains a matching copy, the shopping-list row shows "available from $member · $group" inline, linking to the corresponding `/groups/$slug/members/$user_id`.

The card browser (`/cards`), collection (`/collections`), and deck builder (`/decks/$id`) stay group-agnostic — no badges, no per-cell group queries. This contains the perf surface to the shopping list, which is already a heavy aggregate query.

### Notification surfaces

Two badges, separated by audience:

- **Avatar-menu badge** — personal: counts pending invites _addressed to the viewer_ (i.e. `direction='invite'` rows with `user_id = me`). Clicking opens the avatar menu, which has an "Invites (N)" item linking to `/groups`.
- **Per-group-row badge** — admin: each group row in `/groups` shows a count of pending requests _for that group_ (`direction='request'` rows where the viewer is admin/owner of the group). Plain members in that group see no badge.

No global notifications, no email, no toasts — just the two persistent badges.

### Empty states (all designed explicitly)

- **No one is sharing.** Shown when no other member of this group has a single `friend_group_list_shares` row. Copy: "No members are sharing lists with this group yet. Ask them to share a wishlist or tradelist to start seeing matches."
- **You haven't shared.** Shown when the viewer has no shares with this group. Copy: "Share at least one wishlist or tradelist with this group to see what members can offer or want."
- **No overlaps found.** Shown when shares exist on both sides but the intersection is empty. Copy: "No matches right now. You'll see opportunities here when someone's wants overlap with someone's haves."
- **Pending approval.** Shown to a user who has submitted a request and is awaiting an admin's decision. The whole group page renders as a stub (group name + "Waiting for an admin to approve your request" + a cancel-request button). No member list, no matches.

## Schema sketch

```sql
CREATE TABLE friend_groups (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  slug            text NOT NULL UNIQUE
                       CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description     text CHECK (description IS NULL OR length(description) <= 500),
  code            text,
  code_rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_friend_groups_code
  ON friend_groups (code) WHERE code IS NOT NULL;

CREATE TABLE friend_group_members (
  group_id   uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  nickname   text CHECK (nickname IS NULL OR length(nickname) <= 80),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  UNIQUE      (user_id, group_id)  -- composite-FK target for shares
);
CREATE UNIQUE INDEX uq_friend_group_one_owner
  ON friend_group_members (group_id) WHERE role = 'owner';

CREATE TABLE friend_group_invites (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  group_id   uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  direction  text NOT NULL CHECK (direction IN ('invite', 'request')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE friend_group_list_shares (
  group_id   uuid NOT NULL,
  list_id    uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id    text NOT NULL,
  shared_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, list_id),
  FOREIGN KEY (user_id, group_id)
    REFERENCES friend_group_members(user_id, group_id) ON DELETE CASCADE
);
```

The composite FK on `friend_group_list_shares.(user_id, group_id) → friend_group_members(user_id, group_id)` is what makes auto-revoke on leave/kick free: drop the membership row, the shares go with it.

```sql
-- Auto-promote a successor when an owner row disappears (typically because
-- the underlying user account was deleted). Preserves the "exactly one owner
-- per group" invariant without requiring the user-deletion service to know
-- about friend groups.
CREATE FUNCTION rebalance_friend_group_owner() RETURNS trigger AS $$
DECLARE
  successor RECORD;
BEGIN
  IF OLD.role <> 'owner' THEN
    RETURN OLD;
  END IF;

  SELECT user_id INTO successor
  FROM friend_group_members
  WHERE group_id = OLD.group_id
  ORDER BY (role = 'admin') DESC, joined_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE friend_group_members
       SET role = 'owner'
     WHERE group_id = OLD.group_id AND user_id = successor.user_id;
  ELSE
    DELETE FROM friend_groups WHERE id = OLD.group_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rebalance_friend_group_owner
AFTER DELETE ON friend_group_members
FOR EACH ROW EXECUTE FUNCTION rebalance_friend_group_owner();
```

The trigger only fires on `AFTER DELETE`, so the API layer is still responsible for blocking "owner clicks leave" — the trigger has no way to distinguish "owner left without transferring" from "owner's account was deleted", and we want the API layer to refuse the first case at the call site rather than silently auto-promoting.

## Will Not Be Built

- **Trade execution.** No proposals, counter-offers, accept/reject flows, or two-sided ledger linking. The "trade sessions" item deferred in ADR-005 is superseded — we will not build it. Trades happen out-of-band; each user updates their own collection events afterwards, the app does not coordinate or verify the exchange.

## Deferred / Out of Scope

- **In-app messaging / DMs.** Members use the nickname field and external channels.
- **Notifications** when a new match appears. The match view is pull-only.
- **Public / discoverable groups.** No listing, no global search, no request-to-join from a directory.
- **Block list on kick.**
- **Per-group avatars / images.**
- **Rate limits, invite opt-out, hard caps on group size or count.** Add only if abuse is observed.
- **Per-user cap on pending requests.** A user could in principle queue up requests against many groups; we accept that risk for now.
- **TTL on pending invites/requests.** Pending rows live until explicitly resolved (accept/decline/approve/deny). No auto-expiry.
- **Activity feed** (joins, leaves, code rotations, share toggles).
- **Remember-prior-shares-on-rejoin.** Shares are wiped on leave today; a user re-picks lists on re-join.
- **Last-active / presence indicators.** Skipped from v1; add later only if "I can't tell if my message will be seen" becomes a real complaint.
- **Slug redirects.** Renamed slugs simply 404; no `slug_history` table.
- **Group-aware UI on the catalog, collection, and deck builder.** Cross-surface integration is limited to the shopping list.

## Confirmation

Schema-level invariants exercised by integration tests:

- Exactly one owner per group at all times (partial unique index + auto-promote trigger).
- Deleting the owner's user account auto-promotes the oldest admin; if no admins, the oldest member; if no other members, the group itself is deleted.
- Leaving a group deletes that user's invites, membership row, and list-shares for that group (cascade).
- A list cannot be shared with a group the user is not a member of (composite FK on `friend_group_list_shares`).
- `friend_groups.code` is unique among non-null values (partial unique index); a nulled `code` disables the code join path and `/groups/join?code=X` returns "invite-only".
- Code rotation invalidates the prior code for new requests but preserves pending ones.
- Owner transfer rejects targets who are not currently members of the group, and rejects self-transfer.

Match-view behaviour exercised by a vitest test covering:

- Wish entry at `kind='card'` matches any printing of that card in a co-member's shared tradelist.
- Wish entry at `kind='printing'` matches only copies of that exact printing.
- Lists not in `friend_group_list_shares` for the viewing group do not surface, even if shared with a different group.
- `intent='organize'` lists shared with a group never appear in either match panel, but do appear on the member detail page.
- Deck-derived demand (from `is_wanted` decks) never appears in the match view — only entries in explicitly-shared wishlists do.
- The viewer's own lists never appear on either side of their own match view.
- After a kick, the kicked user's previously-shared trade entries stop appearing for remaining members.
