# Changelog

## 2026-06-17

### Highlights

- feat(Decks): **Deck Plan tab** — write out how to pilot a deck: your gameplan, what to keep in your opening hand (separate notes for going first or second), which battlefield to take, and how to sideboard each matchup. A matchup can point at a specific Legend or card, or just be named like "Aggro". Your plan also shows on the deck's shared page
- feat(Collection): **Inline tradelist removal** — each card on a tradelist now has a remove button right on the card, so you can take it off without opening the right-click menu
- feat(Tournaments): **Zone fixes after approval** — a judge can still move a card to its correct zone after a list is approved or checked, while adding and removing cards stays limited to before approval, and the card's name is locked at that point so a zone fix can't quietly swap one card for another

### Other

- feat(App): **Cleaner What's new page** — release notes now lead with a short bold summary, group the big changes as highlights with the rest tucked behind a toggle, and tag each entry with its area
- feat(Trades): **Choose where traded cards land** — adding the cards from a finished trade to your collection now asks which collection they go in, with the option to create a new one on the spot, instead of always dropping them in your inbox
- fix(Trades): **Group Trades on mobile** — each trade row now stacks on small screens: the card and the member sit on top, and the status and action buttons drop to a tidy bar below instead of running off the edge. The sync button on a finished trade now says "Remove from my collection" when you gave the card away, instead of the vague "Update my collection"
- fix(App): **iOS Home Screen safe areas** — when the app is added to the Home Screen on iPhone, the area behind the status bar and Dynamic Island no longer shows a solid band; the header's blur now carries up behind it, and in landscape the content stays clear of the island and the rounded corners
- fix(Cards): **Printing-specific link previews** — sharing a link to a specific printing now shows that printing's art in the preview instead of always falling back to the card's default printing
- fix(Tournaments): **No re-flag after a flagged issue** — a deck-check entry already submitted with an issue flagged no longer shows the "Request changes" button, which would have just re-flagged the same issue

## 2026-06-16

### Highlights

- feat(Trades): **Want button on shared tradelists** — while browsing a group member's tradelist, tap Want on a card to request it; you pick or create the wishlist it goes on, confirm before that list is shared with the group, and the request sends in one step
- feat(Trades): **Clearer group Trades page** — active trades sit at the top, completed ones collapse away, possible trades stand apart as outlined cards, and a sent trade now says who you're waiting on instead of just "Pending"
- feat(Cards): **Legends shown by champion name** — Legends now lead with their champion name (like "Azir, Emperor of the Sands") everywhere they appear, and every card search finds a Legend whether you type the champion or the card's own name
- feat(Collection): **List sharing is now opt-in** — lists start private with every group unchecked, joining a group no longer auto-shares your existing lists, and creating or joining a group asks which wishlists and tradelists to share so trades can start right away
- feat(Tournaments): **Fix mis-zoned tournament decks** — when a deck is imported with cards in the wrong zone, the checker flags them and a judge can move all of them (or just some copies) to the right zone in one step, reviewing each move so a deliberately unusual deck is left alone
- feat(Collection): **Safer collection removal** — removing cards now warns when they're also on one of your lists and names which ones, and removing a large batch asks you to type the count to confirm, so deleting in one place can't quietly strip cards from another and a stray tap can't wipe a big selection

### Other

- feat(Tournaments): **Sort deck-check cards by energy** — orders each zone by energy cost, then power, then name
- feat(Cards): **Filter-picker stays out of the way** — the button for choosing which filters to show now appears on hover over the filter panel
- feat(Collection): **Full-height collection sidebar** — your lists and folders stay in view as you scroll the cards
- fix(Tournaments): **Deck-check buttons above the card** — the edit and remove buttons now sit in a bar above each card instead of being tucked onto the image on hover, so they're easy to tap on a phone
- fix(Rules): **Duplicate rule warnings** — a card held under several printings or list lines no longer shows the same warning twice, and copy limits now count all those copies together
- fix(Collection): **Shared-list title bar** — a separator now sits between the breadcrumb and the title instead of running them together
- fix(Tournaments): **Deck-check column count** — the card grid no longer opens stuck at two columns; sections show the count you set
- fix(Groups): **Group member count** — shown as a chip in the page header next to the role, not a stray line above the tabs
- fix(Tournaments): **Deck-check progress wording** — each entry now reads "X / Y cards checked" instead of "cards found"
- fix(Tournaments): **Loading placeholders** — tournament deck and deck-check pages show a page-shaped placeholder instead of a stray "Loading…" in the corner
- fix(Decks): **"Chosen Champion" wording** — deck-building help and zone hints now use "Chosen Champion" consistently instead of "Champion"
- fix(Account): **Clean session expiry** — an expired session now sends you to the login page instead of freezing on an error
- fix(Account): **Password-reset feedback** — the page now tells you if a code couldn't be sent (too many tries, invalid email) and reminds you to check spam, instead of silently advancing
- fix(Groups): **Activity-feed icon sizes** — member avatars now line up with the other event icons
- fix(Decks): **Deleting a deck** — no longer opens the editor for the deck you just removed; it stays on the deck list

## 2026-06-12

### Highlights

- feat(Tournaments): **Tournament deck submission via OpenRift** — organizers share a per-event link where players submit a deck (pick one, paste a deck code, or paste a card list) with legality warnings shown before sending
- feat(Tournaments): **Tournament deck lifecycle** — submitted decks lock and move through clear states (approved before the event, physical check at the venue recorded separately), only change when a judge grants an unlock request, judges can't see a list you're still editing and always see what changed since they last looked, and a deck still open when submissions close is sent in as-is
- feat(Tournaments): **Per-event relaxed deck lock** — organizers can let players fix their own submission without a judge until submissions close, which suits casual leagues
- feat(Tournaments): **Claim your tournament deck** — a link in the organizer's confirmation email connects your entered deck to your account even when the organizer never shares your email, and signing in or creating an account is all it takes to claim
- feat(Tournaments): **My tournament decks menu** — decks you entered appear in the user menu with their status and any judge note, connected to your account automatically or by hand
- feat(Tournaments): **Judge deck-check controls** — judges can withdraw an entry when a player drops and restore it if they return, copy a claim link for an unlinked entry, connect an entry to a player's account and leave them a message separate from judge-only notes, while group admins can delete an entry for good
- feat(Tournaments): **Check physical cards while approved** — ticking off cards now works on an approved entry, so a judge can approve the list first and do the card check before recording the result
- feat(Tournaments): **Deck publish consent at submission** — you choose whether the organizer may publish your list after the event, and within that whether your name and Riot ID appear, with the choice shown on your deck page, visible to judges who can correct it on request, and passed along by tournament software
- feat(Account): **Riot ID on your profile** — save your Riot ID once and it fills in automatically when you submit a deck to a tournament
- feat(Tournaments): **Deck checker list view and layout controls** — switch between the card grid and a scannable row-per-copy list with tick-off checkboxes and hover images, sort by deck order, ID, name, or domain, and choose how many cards show per row
- feat(Tournaments): **Members see their own event decks** — group members who entered an event get the Events tab showing their decks, while the full entrant view stays judge-only
- feat(Collection): **List visibility per group** — each list's Share dialog lets you choose which groups can see a wishlist or trade list, so members can find trade matches with you, with the current visibility shown at the top of the list and a one-click jump to change it
- feat(App): **Shared page headers** — groups, tournaments, rules, the pack opener, the card designer, and the match tracker setup now use the same compact header that stays pinned while you scroll, with the rules version picker kept visible and a clickable trail back to your tournament list
- feat(Groups): **Tidier group overview** — one trades tile shows what needs you (or how many trades are possible when you're caught up), the shared tile leads with how much members have shared, admins get an Invite button on the Members tab that copies the invite link, and the Shared tab lists your own shares first with a Share more button
- fix(App): **Recovery after a release** — opening a page right after a new release no longer leaves the app stuck on a broken view, and old service workers left from earlier versions are cleaned up so the current version loads cleanly
- fix(Rules): **Duplicate copies counted correctly** — when a deck holds the same card under several printings or list lines, rule warnings no longer show twice and copy limits count all copies together instead of missing the overage
- fix(Tournaments): **Frozen deck-check verdicts** — once an entry is marked checked or flagged, its card list is locked (add, remove, fix-name, and tap-to-toggle are hidden) so a finished verdict isn't changed by accident, until you re-open the entry

### Other

- feat(Tournaments): **Found zones marked in green** — a deck-check zone whose cards are all found shows its count in green with a check, so fully accounted-for zones stand out
- feat(Trades): **Trades page guidance** — the group's Trades page explains why no matches show up yet, lets you share a list right there, and the member list shows who isn't sharing any lists yet
- fix(Account): **Redirect after signup** — choosing to create an account when a link sends you to sign in (like claiming a tournament deck) now lands you where you were headed instead of the home page
- fix(Rules): **Rules search box** — gained a clear button and a live match count as you type, with toolbar buttons matching the rest of the app
- fix(Tournaments): **Riot ID field on entries** — the optional player field is labelled Riot ID instead of the unclear Handle, and the organizer integration example shows which field to send it in
- fix(Groups): **Group tabs scroll on phones** — the tabs now scroll sideways instead of being cut off at the screen edge
- fix(Trades): **Trade match count** — the overview's matches number now counts possible trades the same way the Trades tab does, instead of every single copy members held
- fix(App): **Consistent 24-hour times** — times use 24-hour format everywhere, and deadlines also show the exact moment in UTC so the timezone is never in doubt

## 2026-06-11

### Highlights

- feat(Tournaments): **Add deck-check entrants by hand** — judges type a player's name and paste their decklist for when the organizer system can't send it, while entries from the organizer system carry an API badge
- feat(Groups): **Group collection tiles** — the overview splits the group's own collections from members' shared ones, shows how many of yours you've shared, and puts new-collection, share, and invite buttons on the matching tile
- feat(Decks): **Pinned deck list filter bar** — the deck list's search and filter bar stays pinned as you scroll, so you can refine without scrolling back up
- fix(App): **Faster first load after a release** — releases now refresh only the files that actually changed instead of throwing away all cached files, so the first visits after a release are no longer slow
- fix(App): **Reload notice after a release** — a new version now shows a notice with a working Reload button instead of refreshing on its own, the button always reloads, and automatic recovery works again on the next release
- fix(App): **Faster clicks on slow connections** — clicking filters or moving between pages no longer freezes (or hangs) while silently waiting for the server to confirm your theme settings
- fix(Decks): **Shared deck card details** — opening a card's details on a shared deck page no longer breaks the detail panel that used to crash on every tap

### Other

- feat(Collection): **Quick Share button on lists** — the Share button on a wishlist or trade list now sits in the top action row, so you can share in one tap
- fix(App): **Tighter top-bar spacing** — removed the doubled empty band above the toolbar, below the deck list filters, and under the expanded card filters
- fix(Collection): **Clear add/remove errors** — a failed add or remove now shows in red and stays until you dismiss it, instead of looking like a normal added message and vanishing
- fix(Collection): **Collection stats on narrow screens** — the cheapest and most expensive printing cards keep their card shape and stack into a single column so each has room
- fix(Collection): **List image download** — downloading a wish or trade list as a card image works again instead of failing with an error
- fix(Collection): **List link previews in chat** — sharing a wish or trade list link to WhatsApp or Discord shows the card preview again

## 2026-06-10

### Highlights

- fix(Cards): **New cards show immediately** — newly added cards appear in the browser right away instead of briefly showing then dropping out because the full list came from an hourly cache
- fix(Account): **Expired session redirect** — when your login expires with the app open, you're taken to the login page and brought back where you were, instead of the page crashing

### Other

- fix(Collection): **Completion ignores unreleased sets** — collection stats no longer count sets that haven't been released, so preview cards you can't own don't drag your numbers down (a preview set still counts if you already own cards from it)
- fix(Decks): **Repeated deck deletion** — confirming a deck deletion more than once (double-click, or already deleted in another tab) no longer shows a confusing Not found error

## 2026-06-09

### Highlights

- feat(Tournaments): **Pod tournaments** — run a free-for-all pod tournament from the new Tournaments link, adding players so each round splits into fair 3- and 4-player pods, tapping in finishing order to update standings with tie-breakers, and sharing a follow-along link with a QR code so players report their own pod's result
- feat(Tournaments): **Pod tournament round editing** — drag players between pods, sit someone out with a bye, switch scoring schemes, and see warnings when players would meet again, land in too many small pods, or have a wide score gap
- feat(Collection): **Filter shared collections by copies owned** — when viewing a shared or group collection, filter by how many copies you own across your collections to spot which cards you don't have a full playset of yet
- feat(Collection): **Share lists three ways** — wishlists and trade lists can be shared to chat as a card image, a copy-paste card list, or a link that shows a card preview in WhatsApp or Discord
- fix(Collection): **Accurate completion for single-copy cards** — completion and cost-to-complete now count Legends, Battlefields, and unique cards as needing one copy (matching deck rules) instead of three, which had overstated how far you were from a full set
- fix(Cards): **Battlefield card orientation** — Battlefields show in their correct landscape orientation as the page loads (not squished upright first), fanned-out stacks in Firefox no longer cut them off, and they no longer appear among the home page's floating cards

### Other

- feat(Cards): **Polished generated card art** — the type icon above the title sits in a gold-on-black pill, Gear cards show their energy cost in a diamond badge, and image-less and Card Designer cards use fonts that read more like a printed card
- fix(Cards): **Readable rune symbols on card art** — rune symbols next to a unit's power turn dark on light domain colors instead of staying white, and a dual-domain unit's runes sit on a clean half-and-half of its two colors at the same size as single-domain ones
- fix(Cards): **Proper names in card table headers** — grouping the card table by type, domain, or rarity shows the proper name (like Rare or Unit) instead of the internal code
- fix(Decks): **Matching deck zone labels** — the missing-cards and price breakdown for a deck labels its zones the same way as the rest of the app (like Chosen Champion and Main Deck)
- fix(App): **Home page tab order** — pressing Tab on the home page no longer stops on the decorative floating background cards
- fix(Groups): **Group avatar overlap** — overlapping member avatars no longer let the one behind show through when the front image has transparent areas

## 2026-06-08

### Highlights

- feat(Designer): **Card Designer** — make your own Riftbound-style card with your own background image, positioning and zooming a photo, filling in details, then downloading or copying it to share, all in your browser
- feat(Groups): **Group overview and Trades page** — each group opens to an overview with quick links and a recent-activity feed, suggested and in-progress trades share one Trades page (replacing the confusing Trading and Trades tabs), and the group's cards and lists live together on a Shared page
- feat(Collection): **Pick groups when creating a list** — choose which friend groups a new wishlist or list is shared with right in the create dialog, with every group selected by default
- feat(Cards): **Copies filter** — a Copies slider with a from-to range narrows the view by how many copies you own, on the cards page, in the deck builder, and in your collections
- feat(Groups): **Join request badges** — requests waiting for your approval show as a count on the Groups nav item and a badge under the group's name that takes you to the member list
- feat(Cards): **Customize filters** — pick which filters you want to see and hide the rest to cut clutter, with Set, Domain, Rarity, and Type always visible and your choice carried across devices when signed in
- feat(Decks): **Overflow zone holds anything** — the deck builder's Overflow zone now holds any card type including Legends, Runes, and Battlefields in unlimited copies, and those copies never count toward deck legality or the 3-copy limit
- fix(Collection): **Sensible list pricing** — setting up a wishlist or tradelist no longer forces a fixed default price; the list-wide price offers a marketplace lookup or negotiate, and fixed prices are set on individual cards where a single number makes sense
- fix(Cards): **Per-section owned counts** — a card appearing in more than one set or rarity now shows once in each section with that section's count, on the cards page, in the deck builder, and in your collection, instead of showing the same owned count everywhere

### Other

- feat(Groups): **Group invite link privacy** — opening an invite link no longer shows who owns the group, while still showing the name, member count, and description
- fix(App): **Steady changelog dates** — dates on the changelog, sets, and profile pages no longer briefly flicker to a different day after loading when your time zone is behind UTC
- fix(Groups): **Proper names in group headers** — rarity, type, domain, and super type headers show the proper name instead of the internal code, and marker and channel headers drop the redundant code in front of the name
- fix(Cards): **Marker grouping in Printings only** — grouping by marker or distribution channel is offered only in Printings view where it makes real sections, and Cards view falls back to grouping by Set
- fix(Cards): **Steady scrolling in long lists** — scrolling through long card lists no longer jumps or shifts as cards load and settle, with the browser's automatic scroll adjustment turned off
- fix(Cards): **Fan-out past the column edge** — hovering a card you own across several printings lets the fan-out spread past the column edge instead of being clipped
- fix(Groups): **Withdraw a code join request** — joining with a code now shows your request under Awaiting approval on the Groups page where you can cancel it, instead of showing nowhere

## 2026-06-07

### Highlights

- feat(App): **Match tracker scoring and layout** — change a player's points by tapping their card (left subtracts, right adds) with a much larger score, players stack in one column in portrait and fill a grid in landscape, and "Who goes first?" opens a menu to pick a player or run a Random spotlight with a lasting badge
- feat(App): **2v2 match tracker mode** — choose Teams in setup, put players on sides, and teammates share one score toward 11 while keeping their own XP, color-coded so you can spot them around the table
- feat(Decks): **Cards and Printings in the deck builder** — switch the card browser between Cards and Printings to pick a specific printing's art as you add it, with the 3-copy limit still applying across all printings
- feat(Collection): **Collection starts in your languages** — your collection opens filtered to your preferred languages like the cards page, and you can clear the filter to see cards you own in other languages
- fix(Trades): **Trade collection update** — the one-click update that adds received cards after a trade now works instead of failing with an error on the receiving side
- fix(Collection): **Adding cards no longer drops them** — adding to a collection no longer shows a spurious error and removes the card; cards were saved but the app misread the server's reply and rolled them back

### Other

- feat(Cards): **Pinned set name and scrubber in table view** — the table view keeps the current set name pinned as you scroll and adds a draggable scroll handle to jump to any set, like the grid view
- feat(Decks): **Clearer deck rows** — each card row shows its copy count on the left as "2×" with energy and power costs lined up on the right
- feat(Decks): **Clickable empty-zone hint** — the hint in an empty deck zone now selects that zone like clicking its header, switching the browser to cards that fit there
- feat(Decks): **Minus button clears last copy** — the minus button removes a card when it's down to its last copy, so you don't need the separate remove button
- fix(Collection): **Copies view tidy-up** — each copy in a collection's Copies view no longer shows a pointless count or add/remove controls, in both grid and table layouts
- fix(Cards): **Fan-out past the column edge** — hovering a card with several printings on the cards page lets the fan-out spread past the column edge instead of being clipped
- fix(Cards): **Per-printing Owned filter** — the Printings view's Owned filter matches each printing on its own, so it no longer shows variants you don't have just because you own another version
- fix(Decks): **Deck builder starts in your languages** — the deck builder's card browser opens filtered to your preferred languages, clearable to see them all
- fix(Decks): **Excluded cards not counted as owned** — cards in a collection marked "exclude from deck building" no longer count as owned in the deck builder's grid, matching the ownership panel
- fix(Collection): **Variant remove popup stays put** — the popup for choosing which variant to remove no longer jumps to the top-left after you remove the last copy
- fix(Decks): **Deck sidebar name truncation** — a long card name in the deck sidebar is shortened on its own instead of also cutting off the power symbols beside it

## 2026-06-06

### Highlights

- feat(App): **Match tracker** — keep score and XP for 2 to 4 players on one device during a game, with a points target, a winner announced when someone reaches it, and a built-in way to randomly pick who goes first, working offline with nothing saved to your account

## 2026-06-05

### Highlights

- fix(App): **Settings sync across devices** — your language filters and collection-completion settings now sync across devices instead of silently resetting; they were saved but never sent back on reload

## 2026-06-03

### Other

- fix(App): **Specific error messages** — when an action can't be completed, the message now explains the specific reason from the server (like "Cannot delete the inbox collection") instead of a generic one

## 2026-06-01

### Highlights

- feat(Decks): **Group collections in your deck building** — choose per shared group collection whether its cards count toward your own deck building from the collection's menu, with group collections starting excluded until you opt in
- fix(Groups): **Shared group cards visible to all** — cards added to a group's shared collection are now visible to every member, so a pooled bulk box no longer looks empty to everyone but the person who added them

## 2026-05-29

### Highlights

- feat(Trades): **Request a card from a group member** — ask for a card you want, where accepting reserves it for you and your collection, wishlist, and tradelist update in one click after the trade, with a per-group Trades tab for everything in progress and a count on any group that needs your action
- feat(Collection): **Multi-select on lists** — a select button on a wishlist or tradelist lets you pick several cards (click to toggle, shift-click for a range) and move or remove them at once, also reachable by right-click

### Other

- feat(Groups): **Wider clickable list rows** — shared wishlists and tradelists on a group open across the whole row, not just the list name
- feat(Groups): **Full-width group rows** — the Groups overview shows each group on its own full-width row with your role, member count, and pending join requests
- feat(Collection): **Card context menu in collections** — right-click or long-press a card to move it, add it to a list, or dispose of it without opening the action bar, applying to the whole multi-selection if the card is part of one
- fix(Collection): **Multi-select drag moves all cards** — dragging a multi-selection to another collection or list now moves all of them with a preview showing the count (like "5 printings") instead of moving only the top card
- fix(Collection): **Printing selection checkmark** — selecting a card with more than one printing in Printings view now shows the checkmark on that printing instead of leaving the box unchecked

## 2026-05-28

### Highlights

- feat(Groups): **Group page tabs** — the group page is now organized into Trading, Collections, and Members tabs, where Trading shows a single "Possible trades" list marking whether each card comes to you or goes to a member plus a per-member directory of shared lists, Collections shows pooled and shared personal collections, Members is the roster, and all the management actions (sharing your lists, settings, join code, invites, leaving or deleting) move behind a "Manage" link in the header
- feat(Collection): **Share collections with groups** — share a personal collection read-only with one or more of your groups from the collection's share dialog or a group's "Share your collections" panel, and members can browse it from the group page or your link
- feat(Collection): **Show library on collections** — the toolbar box icon becomes a "Show library" toggle that widens the grid to every card in the catalog (unowned cards show just a + to add), while select mode and bulk actions keep working on owned cards as before
- feat(Collection): **Show library on lists** — wishlists and tradelists swap the "Browse catalog to add" button for the same "Show library" toggle, showing on-list cards with their quantity strip and the rest with a + to add
- feat(Collection): **Drag cards between lists** — drag a card from one wishlist to another (or tradelist to tradelist) to move it, removing it from the source and merging quantities if the destination already has it
- feat(Collection): **Reorder sidebar lists by dragging** — drag rows in the sidebar to reorder your personal collections and lists, with a grip handle on hover, while the Inbox stays pinned at the top and shared group collections stay alphabetical
- feat(Trades): **Match price preferences panel** — each group match tile shows both sides' price preferences in a labeled "They want" / "You'd pay" panel with the full marketplace name spelled out, falling back to "Not set" when nobody has picked one
- feat(Trades): **Collapsed wishlist trade rows** — several printings of the same wishlist card from one member collapse into a single row led by the quantity wanted (like "1× Fury Rune"), which expands to show each printing's own count and price
- feat(Collection): **Per-printing count pill** — a collection card's count pill shows the per-printing count in this collection with the per-card total in parens (like "x10 (17)"), and clicking it opens the variants and in-your-collections popover on every collection page
- feat(Collection): **Pin a variant for the session** — clicking a variant in the fan behind a card on a collection's cards view pins it as the top printing for the rest of your session, so counts and add controls reflect the variant you care about
- feat(Groups): **Groups renamed and promoted** — friend groups are now just "Groups" throughout the app with a top-level Groups link in the main menu and mobile sidebar (and the pending-invite badge follows it) so you can jump straight there
- feat(Collection): **Per-group sharing on lists** — a list's Share dialog gains per-group toggles matching collections, so you can pick which groups see a wishlist or tradelist alongside the public link controls, and the menu entry is now just "Share"
- feat(App): **Help articles on lists and groups** — two new help articles cover wishlists and tradelists (list kinds, ways to fill a list, how trade preferences work) and how groups work (roles, joining, sharing, matches, shared collections)
- fix(Collection): **Owned filter on collections** — the Owned filter (None, Partial Playset, Full Playset, More than Full) now actually narrows the grid by the copies you hold in this collection, where before it did nothing
- fix(Groups): **Group member menu actions** — Promote to admin, demote, transfer ownership, and remove now actually run when clicked instead of just closing the menu

### Other

- feat(Collection): **Toggle Inbox availability** — the Inbox's deck-building availability can now be turned off like any other collection
- feat(Cards): **Simpler All Cards owned toggle** — the catalog mode toggle becomes a single "Show owned count" button (with the per-card total in parens for multiple variants), and adding cards now happens from a collection or list page with the library toggled on
- feat(Decks): **Play on RiftAtlas link** — a deck's menu gains a "Play on RiftAtlas" link that opens the deck in RiftAtlas's online playtester
- fix(Trades): **Correct offer price label** — the price for a card someone wants from you is now labeled as their offer instead of being mislabeled as what they're asking
- fix(Collection): **Share dialog group list** — the friend-groups list now sits inside the collection share dialog with the action button below it, instead of looking like it spills past the bottom edge
- fix(Collection): **Printings and copies search labels** — the search bar reads "Search printings…" or "Search copies…" with a matching unit count, instead of always saying "Search cards"
- fix(Groups): **Group page title weight** — group, shared user, and groups-join page titles now use the same weight as other page titles, so they no longer look thinner
- fix(App): **Consistent empty states** — empty states across deck list, collection stats, groups, and the activity feed share one layout, and the amber import-warning boxes now read correctly in dark mode
- fix(Trades): **Member match links work** — marketplace links inside a group member's match rows now work, and the rows no longer trigger hydration warnings on load
- fix(Collection): **Collection value on mobile** — a collection's total value now shows in the page header on mobile too, shortening when the name is long
- fix(Collection): **View missing link filters** — the "View missing" link on the stats page now opens the card browser filtered to the cards you're still missing in that group, instead of landing on an unfiltered /cards
- fix(Collection): **Wrapping share badges** — long friend-group share badges on a shared user page now wrap to a new row instead of cutting off the list name
- fix(Groups): **Back from a member's list** — opening a group member's wishlist or tradelist and hitting Back now returns you to the member instead of jumping all the way to the group

## 2026-05-27

### Highlights

- feat(Trades): **Trade preferences on lists** — wishlists and tradelists can carry trade preferences with a per-list default (Cardmarket lowest, TCGplayer lowest, Cardtrader Zero, a fixed price, or negotiate) plus an accepts cards/money/both hint, settable at creation or via Edit, overridable per card, and shown on match rows so you know what each side is after
- feat(Collection): **One link for all your lists** — a single URL now covers your shared wishlists and tradelists so you can paste one link into Discord or a group chat, showing only lists you've made public or shared with a group the viewer is in, grabbed from the "Share all my lists" sidebar button or your profile's Public sharing section
- feat(Groups): **Shared group collections** — any group member can create a shared collection, add or remove cards, and see it in the sidebar under the group's name, with admins able to rename or delete it
- feat(Cards): **Owned-count variant popover** — clicking the owned-count pill on the All Cards view opens a popover listing each variant with +/- buttons and showing which of your collections every copy is in
- feat(Collection): **Number-key drag quantities** — when dragging a card stack between collections, hold a number key from 2 to 9 to move that many copies (Shift still moves the whole stack)
- feat(Groups): **Full browser for member lists** — opening a group member's list now uses the same browser as a public share (filters, sort, group-by, virtualized grid) instead of the older plain thumbnail list
- fix(Trades): **Trade preference editing** — trade preferences can now be edited from any list view via right-click in the grid or the per-row pill in the table, the pill no longer wraps or clips, saving actually works instead of failing silently, and picking Fixed price on a currency-less list now asks which currency instead of showing a "?"
- fix(Collection): **Value Over Time chart** — the chart on the stats page now matches the Estimated Value in the Stats section, instead of undercounting older copies
- fix(Collection): **Domain names on stats** — the domain donut and "by domain" completion rows now show proper domain names (Fury, Calm, …) instead of lowercase slugs
- fix(Collection): **Quick add searches full catalog** — the quick add menu now searches the whole catalog even when the grid is narrowed by a filter, and on an empty collection it no longer wipes your typed search and selected card after the first add

### Other

- feat(Collection): **List share badges** — a shared user bundle page shows a "Public" badge on lists with their own link plus a badge per group it's shared with, visible only to signed-in viewers
- feat(Collection): **Grouped shared list pages** — shared list pages group lists into Wishlists and Tradelists with an entry count per row, on your bundle URL and on a member's profile
- feat(Groups): **Copy join link** — a group's join code panel gains a Copy link button that copies a shareable URL with the code prefilled
- feat(Groups): **List type badges on settings** — your shared lists on a group's settings page now show "Wishlist" or "Tradelist" and an entry count as badges
- feat(Account): **Gravatar avatar fallback** — profile pictures fall back to a Gravatar before showing initials, so most members get a real avatar
- feat(Groups): **Confirm join-code changes** — rotating or disabling a group's join code now asks for confirmation first, since it immediately breaks outstanding invite links
- feat(Collection): **Confirm sharing-link reset** — resetting your public sharing link now asks for confirmation first, since the old link stops working immediately
- fix(Cards): **Card detail in table view** — opening a card detail in table view no longer covers part of the table at mid-range widths, scrolling horizontally inside its own column instead
- fix(Collection): **Readable quick-add owned count** — the owned count on the highlighted quick-add row is now readable instead of green text on the gold background, and dark-mode selected and expanded rows are readable too
- fix(App): **No doubled headers on dead links** — a share or card URL that no longer exists no longer renders two stacked headers and footers around the "Nothing here but dust" message
- fix(Groups): **Member avatars load** — profile pictures of group members and join requesters load again instead of showing empty circles

## 2026-05-26

### Highlights

- feat(Decks): **Create wishlist from missing cards** — a deck's Missing cards view now creates a wishlist in one click, pre-named after the deck and seeded with all the missing cards
- feat(Decks): **Move deck cards by menu** — right-click or long-press a card in the deck builder to move it to another allowed zone, which is the main way to move cards on mobile where dragging is disabled
- feat(Collection): **Wishlists and Tradelists naming** — buy and sell lists are now called Wishlists and Tradelists to match other TCG sites
- feat(Collection): **Quantities on shared lists** — shared list pages show how many of each card you want or have on offer, as a badge in grid view and a Qty column in table view
- fix(Collection): **Live collection value** — a collection's total value and unpriced count now update right away when you add, move, or remove cards, instead of staying stale until refresh
- fix(Decks): **Zone-switch filter clearing** — switching to the legend, runes, or battlefield zone in the deck builder now clears the energy, might, and power filters so cards stop disappearing
- fix(Groups): **Member list thumbnails** — card thumbnails on a group member's shared list page show the art again instead of empty placeholder boxes

### Other

- feat(Groups): **Compact member list tiles** — a group member's shared lists appear as compact tiles with a heart, handshake, or folder icon for wishlists, tradelists, and organize lists
- feat(Collection): **Unified list header** — wishlists and tradelists use the same header across your view, public links, and group shares, with name, type, entry count, total value, and a back arrow on group shares
- feat(Collection): **Bigger quick-add preview** — the quick add menu's card preview is now twice as big, making the right printing easier to spot
- feat(Decks): **Rarity icons in Missing dialog** — the Missing cards dialog shows each card's rarity icon next to its set code
- feat(Collection): **Smarter variants picker keys** — in the variants picker, Enter does whatever you came in to do (add or remove) and Shift+Enter does the opposite, with the +/- keys still working either way
- fix(Cards): **Alt art label** — a single printing that is an alt art is now labeled "Alt Art" instead of "Standard"
- fix(Cards): **Printings section for single printing** — the card detail pane shows the Printings section even with only one printing, so you can still see its global owned count
- fix(Cards): **Promos links clickable** — curated links in the Promos page descriptions are clickable again after a recent safety tightening stripped them
- fix(Collection): **Remove-from list in picker** — removing a card that exists in multiple collections from the variants picker now replaces the variants list in the same popover (Esc goes back) instead of opening a second one

## 2026-05-23

### Highlights

- fix(App): **iOS Safari CSRF error page** — the app no longer shows an error page on some iOS Safari setups (older versions, in-app browsers, privacy proxies) that strip the headers used for CSRF protection

## 2026-05-19

### Highlights

- feat(Groups): **Friend groups go live** — create or join a small group from the avatar menu, share your buy or sell lists with each group, and the group page shows live matches of who has the cards you want and who wants the cards you have (trades still happen off-app via a per-group contact nickname)
- feat(Collection): **Quick-add in add mode** — the quick-add keyboard palette now opens in a collection's add mode too, so the same keyboard flow works whichever mode the collection is in
- fix(App): **No iPhone zoom on search** — card search inputs in the quick-add palette and the deck and collection import flows no longer zoom the page on iPhone when you tap in

### Other

- feat(App): **Gold menu highlight** — highlight color on popover and dropdown menu items now uses the brand gold for better contrast in dark mode
- fix(App): **Wrapping import rows** — deck and collection import rows now wrap on mobile, so the search box and zone picker no longer push past the screen edge

## 2026-05-18

### Highlights

- feat(Collection): **Buy, Sell, Organize lists** — the collections sidebar gains Buy, Sell, and Organize lists where each tracks cards, printings, or specific copies (you pick at creation) and any list can be shared with a public link
- feat(Decks): **Editable deck descriptions** — decks gain an editable description shown above the overview, added from the actions menu, with Markdown support for links, lists, bold, italics, and inline code
- feat(Collection): **List quantities and steppers** — card and printing lists track quantities, so dropping the same card twice adds another and each tile and table row gets a +/- stepper for direct edits (copy lists stay singular since each entry is one physical card)
- feat(Collection): **Import and export card lists** — card lists can be exported as plain text (one "quantity card name" per line) and imported from that same format, so you can move a buy or sell list between tools without retyping
- feat(Collection): **Browse catalog mode for lists** — card and printing lists gain a "Browse catalog" mode showing every card with a +/- stepper on each tile, so you can build a list without leaving the page
- feat(Decks): **Card details in deck views** — clicking a card in the deck overview or editor sidebar opens its details in a side panel, matching the cards browser, including on shared deck links
- feat(Decks): **Custom - Region deck rules** — Custom - Region decks now allow a Signature for any Champion in your region that's in the deck, allow 1 to 3 Battlefield cards instead of exactly 3, and no longer pre-filter cards by your Legend's domains since rune and card colors aren't enforced
- fix(Decks): **Faster deck opening** — opening a deck is noticeably faster, with first paint roughly two seconds quicker on a cold load
- fix(App): **Stale tab refresh** — a tab left idle during a release update now refreshes itself when you return to it, so you don't click through a stale page

### Other

- feat(Collection): **List values in title bar** — lists now show their total value in the title bar like collections, valuing card lists at the cheapest printing in your preferred languages and marking entries with no price as "(N unpriced)"
- feat(Collection): **Clearer new-list dialog** — the new-list dialog spells out what each list is for with concrete examples, making it clearer when to pick Cards, Printings, or Copies
- feat(Collection): **Equals key to add** — adding cards with the keyboard now accepts = as well as +, so you don't have to hold Shift on US layouts
- feat(Collection): **Add to list from selection** — selecting copies in a collection offers an "Add to list" action, and dragging a card or selection onto a sidebar list adds it there
- feat(Cards): **Promos column controls** — the Promos page now responds to the toolbar's column-count controls like the cards browser
- feat(App): **Friendly offline page** — when the site is briefly unreachable (for example during a deploy) you now see a friendly card-themed page instead of a generic browser error
- fix(Decks): **Deck card highlighting** — clicking a card in the deck overview highlights it and lets you arrow-key through the deck, with the highlight following the specific zone you clicked
- fix(Cards): **Card panel closes on navigation** — the card detail panel now closes when you switch between collections, lists, and other browser pages, instead of carrying a card into the next one
- fix(Cards): **Promos group-by label** — the Promos group-by dropdown no longer shows a leftover "set" option when the grouping is by distribution channel
- fix(Cards): **Promos column width on load** — the Promos page no longer briefly renders as a narrow two-column grid on desktop before snapping to the correct width

## 2026-05-17

### Highlights

- feat(Collection): **Share collections publicly** — collections can now be shared with a public link so anyone can browse, filter, sort, and see the total value without signing in
- feat(Collection): **Share trade lists publicly** — trade lists can now be shared with a public link so anyone with it can see what you're offering without signing in
- feat(Cards): **Multi-select Owned filter** — the Owned filter is now a multi-select with four buckets (None, Partial Playset, Full Playset, More than Full) you can combine, for example to see only cards where you're missing copies
- feat(Decks): **Custom format details in deck list** — the deck list shows each custom-format deck's picked tags (like "Bandle City + Neutral") next to its legend and labels the badge with the real format name, so a Custom - Region deck no longer looks like a Constructed one

### Other

- feat(Decks): **Plain names in deck import** — the text deck importer accepts plain card names too, so a list with no leading counts imports without prefixing every row with a "1"
- feat(Cards): **Promo detail in side panel** — clicking a promo on the Promos page opens its card detail in the side panel instead of a new tab
- fix(Decks): **Custom tags in active filters** — picked custom tags now show in the deck builder's active filters bar (grouped by category) so a tag can be cleared like any other filter
- fix(App): **Cleaner dark mode** — dark mode has darker muted surfaces and the Auto/Light/Dark picker on the Profile page now matches the login tabs
- fix(App): **Readable filter chip arrow** — the dropdown arrow on a selected filter chip is now readable in dark mode instead of fading into the chip
- fix(Decks): **No double border on invalid zones** — invalid deck zones no longer get a red border on top of the warning icon
- fix(Cards): **Fan-out on more surfaces** — hovering a card now fans out its printings on shared collection links, a collection's cards view, and set pages, matching the main cards page
- fix(Decks): **Group pill click-through** — the floating group-name pill in deck builder grid view no longer blocks clicks on the + buttons of cards in the same row

## 2026-05-16

### Highlights

- feat(Decks): **Custom - Region deck format** — pick one or more regions (like Bandle City and Neutral) and build a deck where every card carries at least one chosen region tag, keeping Constructed copy and zone rules but dropping domain restrictions so any region's cards work together regardless of color
- fix(Collection): **Drag during auto-scroll** — dragging a card onto a sidebar collection no longer breaks when the page auto-scrolls, keeping the preview under your cursor and dropping on the right collection

## 2026-05-15

### Highlights

- feat(Decks): **Freeform decks unrestricted** — freeform decks no longer enforce constructed limits, allowing multiple legends and champions, more than 3 battlefields, 4+ copies across zones, and any number of runes, with 12-rune autofill and auto-rebalance now applying only to constructed decks
- feat(Decks): **Switch deck format from editor** — the deck editor's 3-dot menu gains a Change to freeform / Change to constructed action, matching the deck list menu
- feat(Decks): **Custom Tags filter for freeform** — the freeform deck builder gains a Custom Tags filter to narrow the card list by one or more curated tags (like region) when building themed decks
- fix(App): **One-shot reload on crash** — a rare crash that left the page blank now triggers a single reload instead, so you don't have to refresh by hand

## 2026-05-13

### Highlights

- feat(Decks): **Table view matches the grid in the deck builder** — each card shows its in-deck count, Shift+click previews bulk add or remove, the + button disables when a zone is full, and legend and champion rows show Choose, Switch, and Remove labels
- feat(Decks): **Drag champions to the chosen slot** — move a champion in and out of the chosen-champion slot, including dragging one straight from the main deck, sideboard, or overflow to replace whoever is there
- fix(Collection): **Per-collection owned counts** — a card's owned count on a collection page now reflects copies in that collection, with the all-collections total in parentheses when it differs, fixing the table view that used to show only the global figure
- fix(Collection): **Filters kept when switching collections** — changing collection in the sidebar now keeps your active filters instead of clearing them every time
- fix(Cards): **Cards page stays put while you filter** — the page no longer flashes a skeleton and remounts on every filter, slider, sort, or keystroke, so typing on a slow connection no longer drops focus mid-word

### Other

- feat(Rules): **Contents button on phones** — a Contents button next to the rules search bar opens the table of contents in a bottom sheet on phones and tablets
- feat(Rules): **Tinted collapsed rule sections** — collapsed groups on the rules page get a subtle background tint so it's easy to spot which ones have hidden content
- fix(Rules): **Search panel fits the toolbar** — the "Search in" panel now stretches across the full toolbar on phones, so the field chips no longer wrap onto a cramped second row
- fix(Rules): **Rules in the right order** — rules spanning multiple updates no longer appear out of sequence (such as rule 300 showing before 184.5)
- fix(Rules): **Back button after a cross-reference** — tapping a rule cross-reference then pressing back now returns you to where you were reading
- fix(Collection): **Edit collection shows the right name** — the dialog now names the collection you're on, not the one you visited first
- fix(Collection): **Owned-across-variants total in add mode** — the table view in add mode shows the total owned across all variants in parentheses next to the per-printing count, matching the grid
- fix(Collection): **Steady + and - buttons** — the add and remove buttons stay put when the parenthesized total appears or disappears, instead of shifting sideways
- fix(Cards): **Smooth variant switching** — clicking through variants on a card detail page no longer flashes a skeleton while it reloads, especially on slow connections
- fix(Cards): **Card pages load on touch devices** — fixed a server and client mismatch in the card-tilt effect that made the browser re-render cards from scratch and break the page mid-load

## 2026-05-12

### Highlights

- feat(Collection): **Table view on collections and deck builder** — the toolbar's grid and table toggle now switches layouts on the collection and deck-builder pages too, the way it already did on Cards

### Other

- feat(Collection): **Keyboard add and remove in add mode** — pressing + or - on the keyboard adds or removes one of the selected card on the Cards and collection pages, matching the on-screen buttons
- feat(Collection): **Keyboard control for variant removal** — when a card has copies of several variants, pressing - opens the variants popover, which accepts arrow keys to move the highlight and + / - to add or remove the highlighted variant
- feat(Collection): **Keyboard control for "Remove from"** — the picker shown when copies span multiple collections now responds to arrow keys to move the highlight and Enter or - to choose
- fix(Decks): **Champion in deck stays draggable** — a champion unit also in the main deck no longer looks already chosen, so you can still drag or click it into the chosen-champion slot
- fix(Collection): **Remove from multiple collections** — pressing - on a card whose copies span several collections now opens the "Remove from" picker instead of doing nothing
- fix(Collection): **Keyboard - works in table view** — the remove shortcut now works on the table view, not just the grid

## 2026-05-11

### Highlights

- feat(Collection): **Add mode on the collection page** — the collection page now uses the same toolbar toggle as Cards, with cards going into the collection you're viewing
- feat(Cards): **Group cards by channel, year, or marker** — the Cards page group-by dropdown now offers Distribution Channel, Year, and Marker like Promos, with trailing sections for cards that don't match

### Other

- fix(Collection): **Quick-add respects your languages** — the Ctrl+K quick-add palette on a collection page now suggests only the languages enabled in your profile, not every language
- fix(Collection): **Quick-add keeps the highlight in view** — the panel scrolls to keep the highlighted printing visible as you arrow up and down inside an expanded card
- fix(Collection): **Quick-add starts fresh** — the panel opens clean each time instead of remembering last time's search and selection
- fix(Cards): **Full channel paths in the filter** — the Distribution Channel dropdown on the Cards page shows each channel's full breadcrumb path, so the four "Top 8" entries are easy to tell apart, matching Promos
- fix(Cards): **Sort dropdown closes on selection** — picking a sort or group-by option now closes the dropdown so you can see the result, while the asc / desc arrow still leaves it open for more changes
- fix(App): **Firefox reloads after a deploy** — Firefox now auto-reloads to pick up a new version instead of showing a loading error
- fix(Account): **Saving preferences works** — saving on the profile page no longer fails with a server error
- fix(Decks): **Missing deck links show Not Found** — opening a link for a deleted or nonexistent deck now shows a Not Found page instead of a server error

## 2026-05-09

### Other

- feat(Cards): **Arrow-key navigation in the table** — arrow keys now move through cards on the Cards page table view, scrolling the selected row into view like the grid does
- feat(Cards): **Icons in the table columns** — the type and rarity columns on the Cards page table view show icons next to their labels
- feat(Cards): **Full type labels in the table** — the table view shows the full type, including supertypes like "Champion Unit", with column widths retuned so longer labels fit

## 2026-05-08

### Highlights

- feat(Cards): **Grid and Table toggle** — a new toggle on the Cards page, Promos page, and deck-builder card picker switches between the visual grid and a compact list that fits more cards on screen
- feat(Cards): **Marker and Channel filters on more pages** — the Cards page and the deck builder's card picker now expose Marker and Channel filters in the More section, so you can drill down to things like Champion-marker or tournament-distributed printings as you already could on Promos

### Other

- feat(Cards): **Cleaner Promos section headers** — Promos sections now use a centered header style that matches the Cards page
- feat(Cards): **Pinned Promos search and filters** — the search and filter chips on the Promos page stay pinned to the top as you scroll
- feat(Cards): **Floating section badge on Promos** — a small badge above the Promos grid shows which section you're in and jumps back to its top when tapped

## 2026-05-07

### Highlights

- feat(Cards): **Full filter panel on Promos** — the Promos page now has the complete filter set (set, domain, type, super type, art variant, marker, finish, rarity, channel, owned status, and English-only price), plus a card name or code search, energy, might, and power range sliders, and a combined sort and view dropdown
- feat(Cards): **Suggest an image for missing promos** — promos without an image show a "Suggest image" button on the placeholder that opens a small form where you paste a URL and submit it as a one-field GitHub pull request
- feat(Collection): **Owned counts on Promos** — when signed in you can show how many copies of each promo you own, with a toolbar toggle to turn it on or off

### Other

- feat(Cards): **Searchable Channel filter with full paths** — the Channel filter is now a searchable dropdown showing each channel's full path so the four "Top 8" entries are easy to tell apart, instead of a long list of leaf labels
- feat(Cards): **Group Promos by card, year, or marker** — the same dropdown that picks the sort can group promos by card, year, or marker alongside channel, with the asc / desc arrow flipping section order, multi-marker cards appearing in each section, and unmarked promos collecting into a trailing group
- feat(Cards): **Pointer to the contribute form** — the Promos page points you to the contribute form when you spot a card that's missing
- fix(Collection): **Owned-count toggle no longer crashes** — turning on the owned-count toggle on the Promos page no longer crashes the page
- fix(Cards): **Bad card or set links show Not Found** — a mistyped or stale card or set link now shows a Not Found page instead of a server error
- fix(Decks): **Capitalized deck thumbnail headings** — the deck overview's grouped card thumbnails show capitalized type headings like "Spells" and "Gears" instead of the lowercase slug

## 2026-05-06

### Highlights

- feat(Rules): **Show changes on the Rules page** — an optional "Show changes" toggle highlights rules added, changed, or removed since the previous version, with a summary line above the document and a click-to-expand word-level diff on changed rules
- feat(Rules): **Game terms link to their definitions** — italicized terms in the rules, like Combat or Accelerate, now link straight to the section that defines them
- feat(Collection): **CSV import surfaces problems first** — the import preview now puts rows needing attention at the top, with cleanly matched cards tucked into a collapsible group below

### Other

- feat(Rules): **Tighter rules layout on mobile** — each rule fits a single row on mobile, with the number on the left, content in the middle, the fold chevron in the corner, and halved indentation so more fits on screen
- feat(Rules): **Pinned rules search bar** — the Rules page search bar stays pinned to the top as you scroll so you can refine your query without scrolling back up
- feat(App): **Polished help articles** — help articles now have a consistent look with uniform cards and callouts across the section
- feat(App): **Reading text adapts to your screen** — long-form text is slightly larger on phones and tighter on desktop for comfortable reading
- feat(Cards): **Note about attaching photos later** — the Contribute form's image URL field notes you can leave it empty and attach photos or scans to the pull request later
- feat(Rules): **Compact expand control on mobile** — the Rules page Expand all / Collapse all control is now a compact icon button on mobile instead of a text link
- fix(Packs): **Upright battlefield cards in the simulator** — battlefield cards in the pack opener are now rotated to sit upright in their slot instead of being squished into a portrait crop
- fix(Rules): **Rules links land in the right place** — clicking a rules link now scrolls to the target cleanly instead of landing behind the sticky search bar
- fix(Rules): **Cross-references work during a search** — clicking a cross-reference while a search is active now clears the filter and jumps to the target, instead of doing nothing because the rule was hidden
- fix(App): **Clearer help wording** — wording across the help articles, help index, and landing page is clearer and more direct
- fix(App): **RiftMana listed as an import source** — the Importing & Exporting help page now lists RiftMana alongside OpenRift, Piltover Archive, and RiftCore

## 2026-05-05

### Highlights

- feat(Rules): **Clickable cross-references in the rules** — references in the rules turn into clickable links, including "rule 540", bare numbers like "603.7" in tournament rules, and "CR 116" pointers to the core rules
- feat(Cards): **Promos open in a new tab** — clicking a card on the Promos page opens its detail in a new tab so you keep your place in the list
- feat(Cards): **One language at a time on Promos** — the Promos page shows a single language with a dropdown to switch, and the URL reflects the language so each is directly linkable
- feat(Rules): **Copy a direct link to any rule** — clicking a rule number copies a direct link to that rule so you can share the exact one with someone
- feat(Rules): **Live rules search with context** — searching the rules updates as you type and shows each match with its enclosing section and parent rules

### Other

- feat(Rules): **Stacked rule numbers on mobile** — the Rules page stacks each rule's number above its content on mobile instead of cramming it onto one line
- feat(Cards): **Correction button at the top of cards** — the "Suggest a correction" button now sits next to Share at the top of every card page instead of at the bottom of the printings list
- feat(Cards): **Contribute form spells out next steps** — the form now lays out the next steps on GitHub after you submit, so first-time contributors know what to click
- feat(Cards): **Prev/next arrows on mobile card detail** — the mobile card detail panel now has previous and next arrows beside the stats row, replacing the easy-to-miss swipe gesture
- feat(Cards): **Year field per printing** — the Contribute form now has a Year field on each printing for the year stamped on the physical card
- fix(Cards): **Colorless domain icon** — Colorless cards now show the correct domain icon on the detail page instead of a broken-image placeholder
- fix(Cards): **Readable detail labels** — the card detail page shows proper labels for Type, Rarity, Supertypes, and Domains (like "Unit" and "Common") instead of raw lowercase values
- fix(Cards): **Comment box removed from Contribute** — the free-text Comment box was removed because GitHub's template overrode it, so you now add notes directly to the pull request description
- fix(Cards): **Printed name always submitted** — the Contribute form always includes each printing's printed name in the JSON instead of dropping it when it matched the card name
- fix(Cards): **Printing code now required** — the form requires a printing code (like OGN-066/298) and shows the error inline, instead of letting a code-less submission fail the schema check later
- fix(Cards): **Uppercase language in submissions** — the form writes the language as EN, the format the catalog expects, so submitted files validate cleanly
- fix(Cards): **Notes go to the pull request** — notes left on the Contribute form go into the pull request description instead of being baked into the card JSON, keeping the data file clean
- fix(App): **Menus close after clicking** — the header's More menu and Feedback popover now close once you click an entry instead of staying open after you navigate away
- fix(App): **Clean reload on new versions** — when a new version ships while you have a tab open, the page reloads itself instead of breaking with strange 404s
- fix(Cards): **Free card tilt in the detail pane** — the hover tilt no longer looks clipped at an invisible edge, so the card rotates freely within its panel
- fix(Cards): **Correct count when grouping by set** — grouping cards by set now reports the right unique-card count instead of inflating it with reprints from other sets
- fix(Cards): **No stray rarity glyph in preview** — the Contribute form's live preview no longer shows a "common" rarity glyph before you've picked a rarity

## 2026-05-04

### Highlights

- feat(Rules): **Rules section is live** — the official Riftbound core rules and tournament rules are now available to everyone, linked from the More menu
- feat(Cards): **Live preview on the Contribute form** — the form shows a live preview of where each field lands on the printed card, and fills in the slug for you as you type the name

### Other

- feat(Cards): **Smarter contribute fields** — when contributing a card you can leave a note for the maintainer, pick markers from a dropdown, and have the printing's name pre-fill from the card name
- feat(Cards): **Domain picker with icons** — domain pickers on the Contribute form show an icon next to each name, cap at two domains per card, and keep Colorless on its own
- fix(Cards): **Might-only cards show the bonus** — cards with just a Might bonus and no rules text now show the bonus on the placeholder art
- fix(Cards): **Glyphs scale with their text** — Energy, Might, and rune glyphs scale with the surrounding text so they look right in small card previews

## 2026-05-01

### Highlights

- feat(Cards): **Contribute page** — a new page lets you submit a missing card or suggest a correction, opening a prefilled pull request against the openrift-data repo so your changes get reviewed and rolled into the catalog

### Other

- feat(Decks): **Clearer deck-builder first-time guide** — the guide reads more clearly, lays its tips out in two columns on wide screens, links to the cards-and-printings explainer, points at the + button on each row, and describes whichever format your deck uses

## 2026-04-30

### Highlights

- feat(Cards): **Buy links on the standalone card page** — the standalone card page now shows Buy on TCGplayer, Cardmarket, and CardTrader links with the latest price for the selected printing, matching the side-pane preview

### Other

- feat(Decks): **Quick guide for new deck builders** — first-timers see a four-step guide and key tips on the empty deck overview, with a link to the full help article and a one-click dismiss
- feat(Decks): **Help links on the Decks page** — the Decks page adds a help icon next to Import and New Deck, and the New Deck dialog links to the deck-building guide
- feat(Cards): **Printed year on card detail** — card detail now shows the printed year stamped on the card so you can tell reprints from the original at a glance

## 2026-04-29

### Highlights

- feat(Account): **Land on Collections after signup** — signing up now takes you to your Collections page with clear next steps instead of the public card catalog
- fix(Account): **Land where you intended after verifying email** — after verifying your email you land on the page you were headed for and are recognized as signed in right away, instead of being dropped on the card catalog and needing a refresh
- fix(Cards): **Energy icons render at every value** — energy cost icons in card text now show for any value, including the 6 and 7 used on Master Yi and Jayce, instead of a broken-image placeholder

### Other

- feat(App): **Refreshed Why OpenRift article** — the Why OpenRift help article is refreshed, and its feature comparison lays out as cards on phones instead of an illegible squashed table
- feat(Collection): **Import from empty Collections and Decks** — the empty Collections and Decks pages now offer an Import button next to the create options so you can pull in data from another tool in one click
- fix(Cards): **No hydration warning opening a card** — opening a card on the Cards page no longer prints a hydration warning caused by the owned-count badge sitting inside the row's clickable area
- fix(Account): **Quiet console on sign-out** — signing out no longer floods the console with live-query warnings as the page transitions away

## 2026-04-28

### Highlights

- feat(Cards): **One tile per card** — the cards page and your collections now group printings of the same card under a single tile by default, with a profile setting to go back to one tile per printing
- feat(Cards): **Filter counts that update** — filter badges on the cards page show how many cards each option matches under your other active filters, dim options that would leave zero results, and narrow their counts when you filter by owned, missing, or incomplete
- fix(Cards): **Cards from a fresh visit match** — the first row shown before the page finishes loading now reflects your active search, shows one English tile per card, and keeps its set heading and sidebar in place instead of flashing other-language cards and jumping as the grid loads
- fix(Decks): **Drop maxed-out cards back** — in the deck builder you can now return a card already at the 3-copy limit to its original zone or move it between main, sideboard, and overflow, instead of being forced to discard it
- fix(Cards): **Faster image loading** — the card grid, decklist tiles, pack-opener cards, and small thumbnails now pick a right-sized image for each slot and phones and tablets skip the hover-only stacked images, so everything loads quicker

### Other

- feat(Cards): **Per-printing owned counts** — the owned-count badge in the card detail pane now sits next to each entry in the Printings list, so you see how many of each printing you own instead of one ambiguous total
- feat(Cards): **Cards listed under every set** — grouping the cards page by set now places each card under every set it was printed in rather than only the earliest, while multiple printings in one set still collapse to a single tile
- fix(App): **Sharp logo on high-res screens** — the OpenRift logo on the homepage, header, and login flows no longer looks blurry from being scaled up on high-resolution phones
- fix(Cards): **Reprint clicks open the right set** — clicking a reprinted card under one set now highlights and opens that set's tile instead of jumping to the set it first appeared in
- fix(Cards): **Arrow keys after switching variant** — left and right arrow navigation in the card detail view now works after you switch to a non-default printing variant, not only on the first variant
- fix(Decks): **Rune + button limit** — the deck builder's + on a rune is now disabled when adding would push the count past 12 with no opposite-domain rune to swap, instead of leaving the deck stuck at 13
- fix(Decks): **Rune removal swaps domain** — removing a rune right after a page reload now swaps in a rune of the legend's other domain instead of just lowering the count
- fix(Decks): **Imported decks use your language** — importing from a deck code or TTS export no longer pins random non-English printings, so the deck shows in your preferred language like the rest
- fix(Cards): **Owned popover lists each variant** — the owned-count popover on the cards page now lists every printing variant with its per-collection counts, matching what the badge totals
- fix(Cards): **Package icon stays clickable** — the package icon above each card on the cards page stays clickable on hover instead of being hidden behind the variants fanning out
- fix(Cards): **Sliders stay visible when narrowed** — the energy, might, and power sliders on the cards page stay on screen as disabled rows when a filter narrows results to one shared value, preserving the layout
- fix(Cards): **Smooth row resizing** — resizing the browser window on the cards page adjusts row heights smoothly again, so rows no longer leave large gaps when you shrink the window
- fix(Cards): **Stable column count on wide screens** — very wide screens no longer briefly show one fewer column before settling into the final layout
- fix(Cards): **Smooth slider dragging** — the energy, might, power, and price sliders are now smooth while dragging or holding an arrow key, applying once you settle on a value
- fix(Cards): **Consistent warning tooltips** — the rules-deviation and banned-format warning icons on cards now use the system tooltip, matching the rest of the icon row
- fix(Cards): **Instant cards page from homepage** — tapping "Browse cards" opens the cards page almost instantly because the catalog quietly preloads while you're on the homepage
- fix(Cards): **Set order from admin panel** — sets on the cards page are again grouped in the order configured in the admin panel rather than by when each was added

## 2026-04-27

### Highlights

- feat(Decks): **Import and replace deck cards** — the deck builder's three-dot menu now lets you paste a deck code or list to overwrite the current deck in place, keeping its name and format instead of only importing as a new deck
- feat(Decks): **New decks page toolbar** — the decks page gains search by name, legend, or champion, sorting, filtering by format, validity, and domain, grouping options, and a new compact list view alongside tiles
- feat(Decks): **Pin and archive decks** — keep frequently-used decks at the top of the list and tuck retired decks behind a toggle without deleting them
- fix(App): **Faster homepage and cards page** — the homepage now fetches only the stats and thumbnails it shows instead of the full catalog, and the cards page shows its first row instantly on a fresh visit

### Other

- fix(Cards): **Smaller card images on mobile** — card detail pages load faster on phones by fetching an image sized for the screen rather than the full-resolution one
- fix(Decks): **Clearer deck stats tooltips** — deck stats chart tooltips now name the metric, show a matching gradient swatch for multi-domain bars with segments listed in bar order, and adjacent segments no longer leave a hairline gap
- fix(Account): **Display name limits** — display names are capped at 50 characters and limited to letters, digits, spaces, periods, underscores, and hyphens so they stay readable on shared deck pages
- fix(Collection): **Owned counts refresh on re-login** — after signing out and back in, the sidebar's owned-copies badges and the cards page owned counts refresh straight away instead of showing the previous session's numbers
- fix(App): **Feedback button announced** — screen readers now announce the header's Feedback button by name on mobile, where its label was hidden before

## 2026-04-26

### Highlights

- feat(Cards): **Incomplete filter on cards** — the Owned filter gains a third "Incomplete" state for cards where you don't yet own a full deck-legal playset (under three copies, or one for Legends, Battlefields, and Unique cards), cycling Owned, Missing, Incomplete, off
- feat(Collection): **Exclude collections from deck building** — each collection has an "available for deck building" toggle so display copies or lent-out cards are skipped when counting what you own, while excluded copies still show as locked in the deck's ownership panel
- feat(Decks): **Unique keyword enforced** — the deck builder now flags any [Unique] card you've added more than once across the main deck or sideboard

### Other

- feat(Collection): **Rename collections** — collections can now be renamed from the same Edit collection dialog
- fix(Collection): **Plain apostrophes in exports** — card names like "Kai'Sa" now export with a plain apostrophe in deck text exports, CSV exports, and the missing-cards copy button, so external tools can match them

## 2026-04-25

### Highlights

- feat(Packs): **Realistic token slot** — the pack opener's token slot now reflects real packs, usually a basic Rune, occasionally foil or alt-art, and sometimes a Token card like Sprite or Recruit, instead of always a regular Rune
- fix(Packs): **No duplicate cards in a pack** — a simulated booster no longer contains the same printing twice, so the two rare-or-better slots are always different cards, just like real packs

### Other

- fix(Decks): **Missing-cards prices match the deck** — the missing-cards dialog now shows the price and short code of the printing the deck builder displays for each card instead of the cheapest variant in any language

## 2026-04-24

### Other

- fix(Cards): **Hover outline during tilt** — the hover outline on card tiles is no longer cut off at the corners while the 3D tilt effect is active
- fix(Account): **Sign-out clears preferences** — signing out now fully clears saved display preferences (language filters, theme, card view), so the next person on this browser starts with defaults

## 2026-04-23

### Highlights

- feat(Collection): **One toast per batch add** — adding a burst of cards in collection add mode now shows a single summary toast per batch (like "Added 5 cards") instead of one toast per click, whether you use the quick-add palette or the plus buttons

### Other

- fix(Cards): **CardTrader condition filter** — CardTrader prices now exclude played-condition listings correctly so only Near Mint counts, fixing a wrong-field read that let Slightly Played and worse show as the cheapest
- fix(Collection): **No grid flash on add or remove** — the collection grid no longer briefly grays out each time you add or remove a copy; the dim only appears when a filter or sort change is actually slow

## 2026-04-22

### Highlights

- feat(Cards): **CardTrader Zero headline price** — CardTrader prices now lead with the cheapest CardTrader Zero (hub-fulfilled) seller you can actually order through, with the overall low shown as a secondary dashed line and used as a fallback when no Zero seller exists

### Other

- fix(Account): **Sign-in link keeps your email** — the sign-up page's "Sign in" link now carries the email you've typed so it stays pre-filled when you switch to login
- fix(Decks): **Legend header on text import** — importing a text deck now respects an explicit "Legend:" header for a Champion card instead of auto-promoting the first Champion to the Champion zone
- fix(Decks): **More zone headers recognized** — text import now reads "Rune Pool:" and "Main Deck:" headers (as riftdecks.com exports use), stops dumping unknown-header cards into the prior zone, and expands the warning panel by default
- fix(Cards): **More accurate CardTrader lows** — cheapest CardTrader prices no longer count listings from sellers on vacation or multi-card bundles priced as a whole pack
- fix(Cards): **Non-English CardTrader prices show** — CardTrader prices in Chinese and other non-English languages now appear alongside their English counterparts instead of being dropped after the English listing was wired up

## 2026-04-21

### Highlights

- feat(Decks): **Faster shared deck pages** — shared deck pages now show the full deck and card thumbnails on first paint instead of a skeleton, use the standard sticky top bar with the name and copy button kept in view, and repeat opens are served from the edge cache
- feat(Decks): **Build cost for logged-out viewers** — logged-out viewers of a shared deck now see its estimated build cost with a "View prices" breakdown, and the Ownership tile becomes a sign-in prompt that returns them to the same deck
- fix(Collection): **Collection shows every language** — your collection now shows every card you own regardless of language, and a Language filter is available in the collection and deck builder panels so you can narrow by language yourself

### Other

- feat(Cards): **Collapsible Promos sections** — every section on the Promos page, including language groups and individual card lists, can be folded to a single heading line
- feat(Cards): **Sub-channels in Promos sidebar** — the Promos sidebar now lists sub-channels of compact sections so you can jump straight to any sub-group
- fix(Cards): **Promos sidebar scrolls** — the Promos sidebar now scrolls independently when taller than the viewport, so the bottom language and channel entries are no longer cut off
- fix(Account): **Instant sign-in and sign-out** — signing in and out now takes effect immediately, without a page refresh, and switching accounts loads the new account's collections in the sidebar
- fix(Decks): **Card preview no corner flash** — hovering a card in the deck editor or on a shared deck no longer flashes the preview in the top-left before snapping to the cursor
- fix(Decks): **Right-click always opens printings** — right-clicking a card in the deck editor now always opens the printings menu, including for single-printing cards
- fix(Decks): **Proxy PDF order** — the proxy PDF now prints cards in the order the deck sidebar shows them, grouped by zone and card type
- fix(Collection): **Mixed-language CSV import** — importing a Piltover Archive CSV that mixes English and Chinese printings of one card now keeps them as separate rows instead of merging them
- fix(Cards): **Cards nav keeps language filter** — clicking "Cards" in the top nav while already on the cards page no longer clears your language filter
- fix(Account): **Sign-in form focus and tab order** — the sign-in page focuses the email field on load, auto-focuses the code input when it appears, and fixes tab order so the switcher and Google, Discord, and Sign up buttons are reachable
- fix(Account): **Sign-up name field focus** — the sign-up page focuses the name field on load so you can start typing right away
- fix(Account): **Password reset focus and Enter** — the password reset page focuses the email or code input as it appears, and Enter submits the form
- fix(Collection): **Clearer Manage mode** — Manage mode on Collections labels its button "Manage cards" / "Manage printings", aligns the selection checkbox with the card edge, and enlarges the Move and Dispose action bar
- fix(Cards): **Ribbons clear the power pips** — the "Preview" and "Banned" ribbons now sit in the top-right corner so they no longer cover a card's power pips
- fix(Decks): **Deck editor Back button highlight** — the Back button in the deck editor top bar now shows a proper square hover highlight matching the icon buttons next to it

## 2026-04-20

### Highlights

- feat(Decks): **Share decks by link** — generate a link to a deck that friends can view without an account and copy into their own decks in a click, with the same large hover preview and, for signed-in viewers, ownership and value tiles against their collection
- feat(Packs): **Pack opener simulator** — open virtual Riftbound boosters at the real published pull rates, flip cards one at a time or crack a whole display at once, and see the rarity breakdown, average value, and best pulls
- feat(Cards): **Preview and Banned ribbons** — cards from previewed-but-unreleased sets carry a "Preview" ribbon and banned cards carry a red "Banned" ribbon everywhere they appear, not just in the deck builder
- feat(Cards): **Printings view by default** — the cards browser and collections now open to the Printings view so each finish shows as its own tile, with a toolbar toggle and a permanent default in Display settings

### Other

- feat(Decks): **Grouped missing-cards dialog** — the Missing cards dialog now groups rows by zone with headings, shows each card's short code inline (and in the copy output), and splits pricing into per-copy Cost and line Total columns
- feat(Collection): **Printing picker previews** — when an Import Collection row needs a printing chosen, the dropdown shows each candidate's image and hovering one brings up a large preview
- feat(App): **"Unofficial" badge** — the badge next to the OpenRift logo now reads "Unofficial" instead of "Beta" to make clear this is a fan project, not an official Riot product
- feat(Cards): **Promos language totals** — each language heading on the Promos page shows how many distinct printings and cards it covers
- fix(Decks): **Shared deck full width** — shared deck pages now fill the page width instead of collapsing into a narrow column
- fix(Cards): **Preview ribbon not clipped** — the "Preview" ribbon on unreleased cards is no longer clipped at the card edge, so the full word is readable
- fix(Decks): **Banned card styling** — banned cards in the deck builder now show a matching red corner ribbon over a dimmed card instead of the old big diagonal overlay
- fix(Collection): **Unpriced note on its own line** — the "n copies unpriced" note on the Collection stats page now sits on its own line instead of wrapping mid-phrase next to the marketplace label
- fix(Collection): **Promo CSV picks right printing** — Piltover Archive CSV imports now pick the right promo printing even when the promo type is new or unrecognized, instead of matching the non-promo card
- fix(Cards): **Promos caret not clipped** — the collapse caret next to Promos section headings is no longer clipped off the left edge on phones
- fix(Cards): **No double-counted promo printings** — the Promos page no longer double-counts a printing distributed through multiple channels, so the roll-up numbers match the cards below
- fix(Decks): **Consistent printing order** — printings in the deck builder's "Change printing" menu and other lists now appear in a consistent order (set, then card number, then finish)
- fix(Cards): **Battlefield thumbnails landscape** — Battlefield thumbnails in the printing picker now show in their natural landscape orientation instead of being squashed into a portrait frame
- fix(Cards): **Comfortable promo sizing** — promo cards are sized more comfortably across screen widths, and the sidebar only appears on wider desktops so the grid can use the full width on laptops

## 2026-04-19

### Highlights

- feat(Collection): **Starter Binder collection** — new accounts begin with a Binder alongside the Inbox, so there's somewhere to sort cards into from the very first booster
- feat(Collection): **Plus/minus on owned cards** — your own cards in a collection show plus/minus buttons above each thumbnail, so you can add or remove copies without switching into add mode
- feat(Collection): **Variant-aware remove** — clicking minus on a card with copies of more than one printing now opens the variant popover to pick which printing to remove, in both browse and add mode, instead of silently taking from the displayed one; in add mode minus also works on cards you owned before opening add mode, removing the newest copy or letting you pick the collection when copies span several
- feat(Decks): **Phone deck builder gestures** — tapping a card adds it to the active zone and long-pressing opens the card's detail view
- feat(Collection): **Single-copy drag between collections** — dragging a card stack moves one copy by default and holding Shift moves the whole stack, matching the deckbuilder
- feat(Cards): **Promos page event hierarchy** — events are grouped into a collapsible tree (like Regional Event then Houston then Top 1) with rolled-up counts, sparse leaves folded into one compact table, product-based distributions such as starter decks and bundles included, and a sticky sidebar listing every language and channel so you can jump straight to a section
- feat(Cards): **Distribution notes on card pages** — printings show their markers, full channel breadcrumb, channel descriptions, and editor's note in a combined block, with a small info icon next to the rarity (hover to read the note) on any card view
- feat(Cards): **Card detail share button** — opens the native share sheet on mobile or copies the link on desktop, points at the exact printing you're viewing, and that link unfurls with the matching art and text on Discord, Slack, and social sites
- feat(App): **Pinned page top bar** — the back button, title, and actions stay under the global header as you scroll, keeping the zone count, export, and other controls always in reach
- fix(Collection): **Consistent owned count** — the owned-count number above each card stays the same when you switch between browse and add mode, instead of jumping to the across-all-collections total

### Other

- feat(Cards): **Close icon on mobile card detail** — the mobile card detail view has a close (X) icon in the top right instead of a back arrow in the top left
- feat(Cards): **Logo watermark on placeholders** — generated placeholders for cards without an uploaded image show a subtle OpenRift logo watermark in the art area
- feat(Cards): **Trimmed printing info table** — the card detail printing table keeps just the core attributes, moves language up next to set and code, and gathers promo markers, channels, and the editor's note into one box at the bottom
- feat(Cards): **Metal printing icons** — metal and metal-deluxe printings get their own anvil and trophy icons across grids, the detail page, and printing menus, so they're no longer indistinguishable from normal printings
- feat(Cards): **Marker chips on Promos cards** — small chips like "Promo" and "Champion" sit below each image so you can tell at a glance what makes each printing distinct
- feat(Cards): **Artist and channel in variant list** — each printing in the variant list shows its artist and distribution channel next to the code, so you can tell variants apart without clicking each one
- feat(Cards): **Smoother foil shimmer** — the foil shimmer is off by default now, and turning it on in Display settings gives a fluid shimmer instead of the stepped version
- fix(Decks): **No split hint on phones** — the deck builder printing picker drops the "shift-click to split 1" hint on phones, where it doesn't apply
- fix(Decks): **Stat chart color order** — the energy and power charts in the deck stats panel stack domain colors in the same order as the type chart and domain bar
- fix(Cards): **Unfiltered card count** — the count next to the search bar shows "407 cards" instead of "407 / 407 cards" when nothing is narrowing the list
- fix(Cards): **Discord printing posts** — announcements of new or changed printings now include the card's thumbnail and show proper finish and language names (like "Metal", "French") instead of raw slugs
- fix(Collection): **Scroll badge fades on touch** — the scroll position badge fades shortly after you stop scrolling, instead of lingering and getting in the way of taps
- fix(Collection): **Recording indicator layout** — the add-mode recording indicator in the sidebar sits beside the collection's card count instead of hiding it
- fix(Cards): **Full language name** — the Language row on a card's detail page shows the full name (like "English") instead of the two-letter code
- fix(Cards): **Firefox promo overflow** — promo cards without an uploaded image no longer spill out below the page footer on Firefox
- fix(Cards): **Art variant labels** — art variant labels on the detail page show their display name (like "Overnumbered", "Alt Art") instead of the raw lowercase slug
- fix(Cards): **Light-mode stat icons** — the power and might icons on a card's detail page are visible in light mode instead of blending into the background
- fix(Cards): **Finish display names** — finish labels come from the finishes table, so non-foil finishes show their proper name instead of the raw slug
- fix(Cards): **Matching share preview** — a shared card link's preview image and description match the printing shown on the page instead of pulling from a different variant

## 2026-04-18

### Highlights

- feat(Cards): **Marketplace prices clarified** — your favorite marketplace stands out with an outlined button while others stay quiet, the printings list shows only your favorite's price per row, affiliate links are noted in tooltips, detail-page links look like proper "Buy on" buttons, and the profile setting explains each market's trade-offs (CardTrader splits by language and condition, Cardmarket shows the overall lowest, TCGplayer lists only English)
- feat(Decks): **Deck zone tiles clarified** — empty zones on the deck overview show a clickable dashed button with a plus and starter hint, the edit pencil on each tile is always visible, brand-new constructed decks show a muted "Constructed · Draft" badge instead of an amber "N issues" warning, and on mobile the top bar reads "Zones" with an arrow hint when no zone is selected
- fix(Decks): **Export deck dialog fixes** — proxies export uses the printings shown in the deck (your pinned variants, otherwise your preferred language) instead of stray Chinese cards, the dialog scrolls inside itself on iPhone, the empty gap below Copy is gone, and switching tabs no longer collapses the dialog while refetching

### Other

- feat(Collection): **Consistent add-to-collection icon** — the collection page's "Browse & add" button uses the same box icon as the cards page
- feat(Cards): **Count/add toggle in toolbar** — the cards page collection mode toggle sits directly in the mobile toolbar instead of inside the options drawer
- feat(App): **Mobile menu order** — the mobile menu lists Cards, Collection, and Decks first with Rules and Promos under a "More" heading, matching desktop
- fix(Cards): **Trimmed white scan borders** — card images that came with a white border around the scan have it trimmed off, so every card fills its thumbnail evenly
- fix(Collection): **Quick add icon** — the "Quick add" button uses a lightning bolt instead of a box-with-plus, so it's no longer confused with the "Browse & add" icon beside it
- fix(Collection): **Quick-add stepper** — each printing in the quick-add palette uses a − N + stepper showing total owned count, drops keyboard hints on mobile, and rapid minus clicks advance copy by copy instead of erroring with "Failed to remove"
- fix(Collection): **Session count resets** — the "new this session" count resets when you switch collections instead of carrying over
- fix(Collection): **Browse & add stays put** — starting "Browse & add" from All Cards stays on All Cards with a "→ Inbox" hint, instead of teleporting you to the Inbox and stranding you there
- fix(Collection): **Centered empty message** — the "Browse the card catalog..." message on an empty collection centers when it wraps on narrow screens
- fix(Decks): **Deck power icon spacing** — power icons on deck zone cards have a small gap between them, so multi-power cards are easier to read
- fix(Decks): **iPhone long-press menu** — long-pressing a deck card on iPhone no longer triggers iOS text selection alongside the printing menu, and picking a printing no longer flashes the large hover preview before closing

## 2026-04-17

### Highlights

- feat(Decks): **Pin a printing per deck row** — right-click to pin a preferred printing so "1 normal + 2 alt art" of a card show as separate entries with the art you picked, and Piltover deck codes round-trip your variant choices
- feat(Decks): **Drag between zones from overview** — you can drag cards between zones straight from the deck overview dashboard without opening each zone first
- feat(Decks): **Richer deck overview** — each zone shows its full card list with larger thumbnails grouped by type (Units, Spells, Gears), a KPI strip for cards, domains, ownership, and value, and Energy, Power, and Types as separate charts, with hover previews that follow your cursor
- feat(Cards): **Promo page by language** — the Promo Cards page groups by language first (English, Chinese, French), then by promo type within each, instead of switching languages from a filter
- fix(Collection): **Select mode clears on switch** — switching collections while in select mode exits select mode and clears the selection instead of carrying invisible selections
- fix(Collection): **Deleted collection cards visible** — deleting a collection moves its cards into the Inbox visibly instead of having them seem to disappear until reload
- fix(Cards): **Card link scrolls to card** — clicking a card link (like from the activity feed) scrolls the grid to that card instead of opening the detail pane with the grid at the top

### Other

- feat(Decks): **No language filter in deck builder** — the deck builder drops the Language filter, since language doesn't matter when picking cards for a deck
- feat(Cards): **Missing-card links to stores** — card names in the missing-cards dialog link straight to the product page on TCGplayer, Cardmarket, or CardTrader instead of a generic search
- fix(Decks): **Stable deck overview order** — deck overview thumbnails no longer jump when you change quantities or drag, since they follow the sidebar's sort order (type group, then energy, power, and name)

## 2026-04-16

### Highlights

- feat(Decks): **Deck dashboard** — opening a deck shows a dashboard with each zone's progress, card previews, and deck-wide stats instead of a blank "pick a zone" page, and clicking the active zone again returns to it
- fix(Decks): **Reliable last deck edit** — the last edit you make before navigating away saves reliably instead of sometimes being dropped while the save was pending
- fix(Collection): **Offline action feedback** — if your connection drops while adding, moving, or removing copies, the action reverts and shows an error toast instead of silently looking like it worked

### Other

- fix(Decks): **Smoother zones sidebar** — moving the mouse over the deck editor's zones sidebar no longer lags, since rows were being rebuilt on each hover
- fix(Collection): **Empty collection delete** — deleting an empty collection opens the confirm dialog right away instead of silently failing and later popping up for the wrong collection
- fix(Collection): **Friendly empty collection** — an empty collection shows a "No cards yet" prompt instead of a misleading "server may be unreachable" error

## 2026-04-15

### Highlights

- feat(App): **Faster loading** — the card browser, collections, and decks load faster when you're signed in, and public pages like the home, browser, and individual card and set pages load noticeably faster for signed-out visitors
- feat(Cards): **Distribution on card detail** — the card detail page shows where each printing was distributed (tournaments, prerelease events, etc.) so you know how to find a copy
- feat(Cards): **Stacked stamps as own printing** — a printing can carry multiple stamps at once (like a promo plus a Top 8 placement), and the stack is treated as its own visually distinct printing with its own price
- feat(Cards): **Promos grouped by event** — the Promo Cards page groups by distribution event, so a card given out at several tournaments shows under each one, and clicking a card opens the detail view with that exact printing already selected
- fix(Cards): **Multi-filter card browser** — the card browser no longer errors when you have multiple languages or other filters selected in the URL
- fix(Cards): **Fast search field** — the card browser search no longer drops or scrambles letters when you type quickly

### Other

- feat(Cards): **Markdown promo descriptions** — promo type descriptions on the Promo Cards page support markdown, so links and basic formatting render inline
- feat(Cards): **No duplicate language chips** — the active filters bar no longer repeats language chips, since the language picker above already shows them
- fix(Cards): **Clean filter URLs** — the Owned, Signed, Promo, Banned, and Errata chips produce clean shareable URLs (like `errata=true`)
- fix(App): **Help page titles** — help article titles include "OpenRift" in the browser tab even when the title already mentions the name
- fix(Cards): **Cardmarket headline price** — Cardmarket shows its market average as the headline price with the cheapest listing on the price chart, matching TCGplayer
- fix(Decks): **Screen reader deck menus** — screen readers announce the per-deck actions menu on each deck tile, and the add and remove buttons on each card tile in the deck editor

## 2026-04-14

### Highlights

- feat(Cards): **Promo page languages** — the Promo Cards page shows all printings, including multiple languages of the same card, with a language filter up top to narrow the view
- feat(App): **New landing page** — the landing page uses real card art in the background (a fresh random selection each visit), explains what OpenRift is, and puts sign up, browse, and sign in buttons together with three feature blocks
- fix(Cards): **Working language filter** — the language filter now actually hides printings and cards outside your selected languages and defaults to your language preferences when you first open the browser
- fix(Account): **Instant account UI updates** — signing out, changing your display name or email, and deleting your account update the UI immediately instead of needing a refresh

### Other

- fix(Cards): **Screen reader card detail** — screen readers announce the card detail close button and which printing is selected in the picker
- fix(Cards): **Top cards load colored** — cards at the top of the page no longer stay gray on first load
- fix(Cards): **No foil flash when off** — the foil effect no longer briefly flashes on cards when you've disabled it in preferences

## 2026-04-13

### Highlights

- feat(Cards): **Promo Cards page** — a new page shows all promotional printings grouped by promo type, each type carrying an optional description, with card grids
- feat(Collection): **CSV imports** — you can import collections from RiftMana exports (normal/foil splits, alt art, promos, language detection), and Piltover Archive imports use the Language column to match the right variant so English imports no longer collide with Chinese or French
- feat(Collection): **Owned cards dimmed** — cards you don't own are dimmed when showing owned counts or in add mode, making collection gaps easy to spot
- feat(Collection): **Cost to Complete chart** — a new Statistics chart shows what you'd spend to reach 100%, cheapest cards first, so you can see where diminishing returns kick in
- fix(Collection): **Reliable bulk loading** — collections with many cards added at the same time no longer risk skipping some when your collection loads

### Other

- feat(App): **Animated landing counts** — card and printing counts on the landing page animate up from zero as the page loads
- feat(App): **Privacy-friendly analytics** — search queries, collection actions, and filter usage are tracked with Umami so we can see which features matter most
- feat(Cards): **Branded card placeholders** — cards without artwork show a branded placeholder image instead of a blank space
- feat(Collection): **Add-mode minus explained** — clicking minus on a card you already own in add mode explains why it can't be removed and how to manage existing copies
- feat(Cards): **Sticky active filters** — the active filters bar stays visible as you scroll, so you always see which filters are applied
- fix(Cards): **Group header labels** — group header labels no longer disappear behind cards when you hover them

## 2026-04-12

### Highlights

- feat(Collection): **Statistics page** — a new page shows collection completion, estimated value, domain distribution, rarity breakdown, and energy/power curves, with a dropdown for per-collection or all-collections stats, and completion rows link straight to the browser filtered to your missing cards
- feat(Cards): **Owned/Missing filter** — the card browser can show only cards you own or only those you still need
- feat(Cards): **Rarity colors** — rarities have their own colors throughout the UI wherever rarity appears
- fix(Collection): **Selecting all printings** — in Cards view, selecting a card stack selects all copies across every printing, not just the displayed one, and the owned-count popover shows the full per-collection breakdown
- fix(Collection): **Live disposal updates** — disposing or moving cards removes them from the collection view immediately instead of needing a reload

### Other

- feat(Cards): **Sets grouped by type** — the Sets page groups main sets separately from supplemental ones like Proving Grounds and Arcane Box Set, and the browser's set filter shows main sets first
- fix(Cards): **Deselect language filter** — the language filter can be fully deselected to show all languages, matching every other filter
- fix(Decks): **Deck violation badge on touch** — tapping the deck violation badge opens the issue list on all devices instead of needing a hover on desktop
- fix(Collection): **Delete after moving cards** — deleting a collection no longer fails when cards had previously been moved or removed from it
- fix(Collection): **Collection menu width** — the 3-dot menu on collection pages no longer squishes items into a narrow column
- fix(Cards): **Language-tagged printing rows** — when a card has printings in multiple languages, every row is tagged with its language code (`[EN]`, `[ZH]`, …) instead of labeling some "Standard"
- fix(Cards): **Card fan layering** — the card fan no longer hides behind its own label text or cards in the row below
- fix(Cards): **English set covers** — set cover images on the Sets page show English card art instead of Chinese printings

## 2026-04-11

### Highlights

- fix(Cards): **Card link previews work** — sharing a card page on Telegram, WhatsApp, or Discord now shows the preview, where before crawlers were pointed at a URL that returned 404, and previews use English art and a clean description instead of whichever language came first or rules text leaking unrendered icon shortcodes

### Other

- fix(Cards): **English default printing** — card detail pages default to the English printing instead of whichever happens to sort first

## 2026-04-10

### Highlights

- feat(Cards): **Cardmarket on Chinese printings** — Cardmarket prices now show on Chinese printings too, marked with a star and an "any language" tooltip (Cardmarket publishes one price across all languages), and clicking through opens Cardmarket pre-filtered to the language you're viewing
- feat(Cards): **CardTrader for Chinese cards** — Chinese printings show CardTrader prices and price history, so you can track their value like English ones
- fix(Cards): **Set page language** — set pages show cards in your preferred language instead of randomly mixing printings from different languages
- fix(Cards): **Price filter respects marketplace** — filtering by price range uses your selected marketplace instead of always TCGplayer, and the slider and filter badges show the right currency (€ for Cardmarket and CardTrader, $ for TCGplayer)

### Other

- feat(App): **Support page commission note** — the Support page explains that buying through TCGplayer or CardTrader links earns a small commission, so shopping you'd do anyway can help fund the site
- fix(Decks): **Instant deck hover preview** — hovering a card in the deck editor shows the preview instantly, then crisps up once the higher-res image arrives
- fix(Cards): **Card preview shares image** — sharing a card page on Telegram, WhatsApp, or Discord shows the card image instead of nothing
- fix(Decks): **Clean deck-editor drag** — dragging a card in the deck editor no longer shows the hover preview or lets text get selected, so the drag stays out of the way
- fix(Cards): **Smoother card scrolling** — scrolling the cards page is smoother, since it no longer makes a separate request for every card in view

## 2026-04-09

### Highlights

- feat(Decks): **Deck ownership panel** — the deck editor sidebar shows how many cards you own, how many are still missing, and the estimated cost to complete the deck, with a detailed dialog for the missing cards that includes a copy-to-clipboard shopping list
- feat(Cards): **Collection mode on the cards page** — a button cycles through showing owned counts and quick-add controls, and Ctrl+K adds cards straight to your Inbox
- feat(App): **Server-side rendering** — pages load faster on first visit, navigation is smoother, and the site shows up better in search engines
- feat(Decks): **Signature card validation** — the deck builder now caps Signatures at 3 and requires they match the Legend's Champion tag
- feat(App): **Easier-to-find Discord and feedback** — a new Feedback button in the header reaches Discord or opens a GitHub issue, Discord links appear across the footer, mobile menu, support page, and help center, and the server gets a daily changelog digest plus alerts when new printings are detected
- fix(Cards): **Instant count updates on cards** — adding or removing cards on the cards page updates the count right away instead of after a delay
- feat(Account): **Reorderable languages** — you can reorder languages in preferences, and the first one is preferred when choosing which printing to show

### Other

- feat(Collection): **Delete collections from sidebar** — a three-dot menu deletes a collection and moves its cards to the Inbox automatically
- feat(Collection): **Shift-click range select** — in select mode, Shift+click picks every card between the first and last one you clicked
- feat(Decks): **Named proxy PDF files** — proxy downloads use the deck name in the filename (like "fury-aggro-proxies.pdf") instead of a generic one
- feat(App): **Clearer help pages** — the import/export, collections, deck building, and card detail guides have been rewritten for clarity
- fix(Decks): **Disabled languages hidden in decks** — the deck overview and deck card browser no longer show cards from languages you've turned off
- fix(Cards): **Aligned card detail labels** — the Set, Rules, Flavor and other labels line up consistently on mobile and desktop
- fix(Cards): **Clean Chinese keyword badges** — keyword badges on Chinese cards no longer show trailing color suffixes or formatting noise

## 2026-04-08

### Highlights

- feat(Cards): **Dedicated card pages** — every card has its own page at /cards/{name} with full details and a shareable link, surfaced from the detail pane via a "View full page" link and visible to search engines (including prices and breadcrumbs in Google results)
- feat(Cards): **Browsable set pages** — sets have their own pages at /sets and /sets/{name} showing every card in a responsive image grid instead of a plain list
- feat(App): **Rich link previews** — sharing a link on social media, Discord, or Slack now shows a preview with title, description, and image

### Other

- feat(Cards): **Chinese keyword colors and search** — keyword badges on Chinese cards show the right colors, and searching a keyword in any language finds all matching cards
- feat(App): **Descriptive tab titles** — each page now has a meaningful browser tab title instead of a blank one
- feat(App): **Help article breadcrumbs** — help articles show breadcrumb navigation so you know where you are

## 2026-04-07

### Highlights

- feat(Collection): **Re-import your own exports** — collection import accepts OpenRift CSV exports back in, and those exports now carry a Promo column so promo variants come back without ambiguity
- fix(Collection): **Bulk edits over 500 cards** — deleting or moving more than 500 cards at once no longer fails with a validation error

### Other

- feat(Cards): **Search scope hint** — the search bar placeholder shows which fields are being searched when you narrow the scope (like "Search by name, artist...")
- fix(Cards): **Copies count in search bar** — the copies view search bar shows the total number of copies instead of unique printings
- fix(Account): **Working password autofill** — password and email inputs have proper autocomplete attributes so browser password managers work
- fix(Collection): **Visible footer on empty collections** — the collections page footer is no longer hidden below the viewport when a collection is empty

## 2026-04-06

### Highlights

- feat(Decks): **Official tournament registration PDF** — the deck registration PDF matches the official Piltover Archive format, and you can fill in your name, Riot ID, and event details before downloading
- feat(Decks): **Rename and reformat from the deck list** — a three-dot menu lets you rename a deck or change its format without opening it
- feat(Cards): **Errata shown by default** — cards with errata show the corrected text, with the original printed text available in an expandable disclosure
- fix(Decks): **Correct zones on text import** — importing a deck in text format without zone headers now places legends, runes, battlefields, and the first champion in their proper zones instead of dumping everything in the main deck

### Other

- feat(Decks): **Export format guidance** — the export dialog shows where each format is used, with links to Piltover Archive, TCG Arena, and the Tabletop Simulator mod
- feat(Decks): **Database-ordered deck zones** — deck zones in the builder and import view follow the order set in the database, and the import preview groups cards by zone
- feat(Decks): **"Character, Title" name matching** — deck text import recognizes names like "Sett, The Boss" even when the card is stored under just the title
- feat(Collection): **Sorted import preview** — the collection import preview sorts entries by card ID within each match status group
- fix(Decks): **Visible footer on the decks page** — the footer is no longer pushed off screen when you only have a few decks
- fix(Account): **Disabling all languages sticks** — turning off every language on the profile page no longer snaps back to English after a moment
- fix(Decks): **Case-insensitive deck sorting** — decks sort alphabetically regardless of capitalization
- fix(Decks): **Always-visible plus icon** — the plus icon in the deck editor card grid stays visible even when a card hits its copy limit
- fix(Collection): **RiftCore special IDs** — importing from RiftCore now recognizes token, rune, and signed card IDs instead of skipping them

## 2026-04-05

### Highlights

- fix(Decks): **Correct deck export variants** — deck export uses the proper base card variant instead of sometimes picking alt-art versions, and no longer duplicates the chosen champion across zones when importing a deck code

### Other

- feat(Cards): **Upgraded keyword arrows** — upgraded keyword abilities render with the correct arrow shape on their left edge
- fix(Decks): **Sticky deck zones sidebar** — the deck zones sidebar no longer scrolls out of view while you scroll through cards in the editor
- fix(Decks): **Hover preview clears** — the card hover preview no longer stays stuck on screen after you remove a card from the deck sidebar
- fix(Decks): **Deck export on iOS** — the deck export no longer overflows its container on iOS, and copied text keeps its line breaks

## 2026-04-02

### Highlights

- feat(Decks): **Three deck import/export formats** — import and export decks via tabs for Deck Code, Text (a human-readable list), and TTS (Tabletop Simulator), with a printable tournament registration sheet PDF and proxy PDF export available straight from the deck overview
- feat(Cards): **Search every field by default** — search checks name, card text, keywords, tags, artist, flavor text, type, and ID at once with an "All" toggle to reset scope, and flavor text and card type are now searchable with f: and ty: shortcuts
- feat(Decks): **Switch filled deck slots** — when the Legend, Champion, or Battlefield slot is already filled, a "Switch" button swaps the card without removing it first

### Other

- feat(Decks): **Deck value on overview tiles** — overview tiles show the estimated deck value based on the cheapest available printing, alongside a domain color bar and type counts
- feat(Decks): **Compact deck stats panel** — domain colors show as a bar in the header, energy and power curves merge into one butterfly chart, and the charts are colored by domain
- feat(Decks): **Reordered deck zones** — zones are ordered Legend, Champion, Main Deck, then Battlefield and Runes at the bottom
- fix(Decks): **Dual-color type counts** — dual-color cards are no longer double-counted in the deck stats type breakdown
- fix(Decks): **Amber for invalid decks** — the deck editor shows amber for invalid decks instead of gray, matching the deck overview
- fix(Decks): **Stable minus button** — the minus button in the deck editor card grid no longer jumps when a card reaches its copy limit
- fix(Decks): **No stray reset-filters bar** — the empty "reset filters" bar no longer appears in zones where the card type is forced (like the Legend zone)

## 2026-04-01

### Highlights

- feat(Decks): **Proxy PDF export** — export any deck as a printable proxy PDF with card images or text placeholders, plus optional cut lines and a watermark
- feat(Decks): **Visual deck overview** — the deck overview shows a card grid with legend and champion art previews, domain icons, a card type breakdown, and validity badges

### Other

- feat(Cards): **Sort and group direction toggle** — a small arrow next to each section header in the sort/group popover flips the direction
- feat(App): **Snappier buttons** — buttons have a subtle press-down effect and tooltip keyboard hints look sharper
- fix(Decks): **Rune replacement keeps 12** — removing a rune in the deck builder now adds a replacement from the other domain so the total stays at 12
- fix(Decks): **Group-by works in the builder** — the deck builder respects your group-by setting instead of always grouping by set

## 2026-03-31

### Highlights

- feat(Decks): **Guided deck building** — build a deck step by step (choose a Legend, Champion, Battlefields, and Runes, then fill your main deck and sideboard) with full card browser integration, drag and drop cards between zones (one copy by default, Shift to move all) or straight from the browser grid, and import or export via Piltover Archive deck codes
- feat(Decks): **Live deck stats** — a stats panel shows domain distribution, energy curve, power curve, and card type breakdown with stacked main/sideboard bars, and the energy curve stacks domain colors so you can see the color mix at each cost
- feat(Decks): **Deck list at a glance** — the deck list shows each deck's domain colors, card count, and Standard validity

### Other

- feat(Decks): **Rename from the editor** — click a deck's name in the deck editor to rename it
- feat(Decks): **Banned card overlay** — banned cards in the deck builder show a large diagonal "BANNED" overlay across the image
- fix(Cards): **No duplicate cards across groups** — the cards view no longer shows the same card in multiple set or rarity groups
- fix(App): **Clean help article text** — help articles no longer show garbled characters for apostrophes and dashes

## 2026-03-30

### Highlights

- feat(Cards): **Multi-language printings** — cards can show English, French, and Chinese printings, with your preferences controlling which languages appear (English only by default)
- feat(Collection): **Full collection search and filters** — collections have search and filters by name, type, rarity, and more without entering add mode, plus CSV export of any collection (or all cards) from the Import / Export page
- feat(Cards): **Group cards your way** — group cards by set, type, supertype, domain, rarity, or art variant (or ungrouped) from a new Sort & Group popover
- feat(Collection): **Collection market value** — each collection shows its total market value for your preferred trading platform, flagging cards that don't have price data yet
- feat(Collection): **Drag and drop to collections** — drag cards from the grid onto a collection in the sidebar to move them, with multi-select supported
- feat(Cards): **Banned card badges** — cards banned in a format show a red "Banned" badge in the grid and a banner with the reason in the detail panel

### Other

- feat(App): **Active page highlight** — the navigation menu highlights the page you're on
- feat(Cards): **"None" stat filters** — the energy, might, and power range filters have a "None" option to find cards without that stat (like spells with no energy cost)
- feat(Collection): **Jump to a filtered collection** — clicking a collection name in the "In your collections" popover opens it filtered to the card you're viewing
- feat(Collection): **Tappable mobile collection title** — on mobile, the collection sidebar opens from a tappable title instead of a separate icon, reducing clutter near the menu button
- feat(App): **Beta badge** — a "Beta" badge next to the logo makes it clear this is an early release
- feat(Collection): **Detailed import preview** — the import preview shows all parsed CSV fields (set, rarity, finish, condition, and more) in an expandable row so you can check each entry before importing
- feat(Collection): **Undo in the quick add palette** — the quick add palette (⌘K) lets you undo cards added by mistake via a minus button on each printing row or Shift+Enter, and always expands to show printings first so the flow is consistent
- feat(Collection): **Open cards from Activity** — clicking a card on the Activity page opens it in the card browser with full details
- feat(Collection): **Cleaner selection** — selection checkboxes stay hidden until you click "Select" or Ctrl+click a card, keeping the default view tidy
- feat(Collection): **Dimmed unowned cards** — unowned cards are dimmed in add mode so you can see at a glance what you already have
- feat(Cards): **Foil sparkle icon** — foil cards show a sparkle next to the rarity badge in the grid and detail view, so you can spot them even with the foil effect off
- fix(Cards): **Set filter scoping** — filtering by set no longer shows variants from other sets in the sibling fan, price ranges, and detail pane
- fix(Cards): **Total owned count** — the owned count badge in cards view shows the total across all printings, not just the displayed variant
- fix(Cards): **Name and price aren't clickable** — clicking the card name or price below the image no longer selects the card, only the image does
- fix(Cards): **Consistent owned count placement** — the owned count shows above every card instead of as a small corner badge
- fix(Collection): **Reliable rapid add** — rapidly clicking add no longer loses count, every click is tracked immediately and appears in the "added this session" panel
- fix(Cards): **No flickering set header** — the set header pill no longer briefly appears when jumping to a section
- fix(Cards): **Aligned detail pane** — clicking a card scrolls its row to the top so the detail pane lines up with the selected card

## 2026-03-29

### Highlights

- feat(Collection): **Import collections from other apps** — bring your collection in from Piltover Archive or RiftCore by uploading or pasting a CSV, previewing matched cards, resolving ambiguous printings, and importing into any collection
- feat(Collection): **Activity timeline** — a new Activity page in the collection sidebar shows everything you've added, removed, or moved, grouped by day with card counts and value summaries, and filterable by action type, collection, or date range (today, 7 days, 30 days)
- fix(Account): **Login without a refresh** — protected pages like Profile open right after signing in, instead of needing a page reload first

### Other

- fix(Collection): **Clearer sidebar selection** — active and hovered items in the collection sidebar stand out more from each other
- fix(Cards): **Stable alt art order** — alt art printings of the same card keep a consistent order instead of sometimes shuffling
- fix(Cards): **Consistent price and rarity sorting** — sorting by price descending puts the priciest printing in each stack first with unpriced cards last, and sorting by rarity keeps a steady card-ID order within each rarity regardless of direction
- fix(Collection): **Browse & add from all-cards** — the button now opens your inbox when used from the all-cards view instead of doing nothing
- fix(Collection): **Quick add keeps its search** — the quick add input no longer clears after you add the first card to an empty collection

## 2026-03-28

### Highlights

- feat(Collection): **Inline browse & add** — "Browse & add" opens the full card browser right inside the collection page, with the sidebar still showing which collection you're adding to
- feat(Collection): **Quick-add palette** — press ⌘K in any collection to type a card name, pick a printing, and add it without leaving the page

### Other

- feat(Cards): **Bring stacked variants forward** — clicking a stacked variant in the grid swaps it to the front of the stack
- fix(Collection): **Owned count in add mode** — shows for every card, not just ones with multiple printings
- fix(Cards): **Only the image is clickable** — clicking above or below a card in add mode no longer opens the detail pane by accident

## 2026-03-27

### Highlights

- feat(Cards): **Choose your marketplaces** — pick which marketplaces show and in what order, with the first one appearing on card thumbnails in the grid
- feat(Cards): **Rich placeholders for imageless cards** — cards without images show a full text-only stand-in with type, tags, rules, effect, and flavor text

### Other

- fix(App): **Dark theme survives refresh** — signed-in users no longer get bounced back to light theme on reload
- fix(Cards): **No blank marketplace rows** — marketplace preferences stop showing empty rows when stored settings drift out of sync
- fix(Cards): **European price formatting** — EUR prices (Cardmarket, CardTrader) show as 1,23 € instead of €1.23

## 2026-03-26

### Highlights

- feat(App): **Display preferences sync across devices** — theme, card images, rich effects, and visible card fields follow you between devices when signed in

### Other

- feat(Cards): **Power shown as domain icons** — cards without images show their power as repeated domain icons, matching the real card layout
- fix(Cards): **Battlefield cards fill the frame** — they no longer appear as squares in the card browser
- fix(Cards): **Keyword bracket icons** — icons inside keyword brackets like Equip costs render properly instead of showing raw text
- fix(Cards): **Swipe only on the image** — swiping between cards on mobile works on the card image, not the whole detail pane

## 2026-03-24

### Highlights

- feat(App): **Database size on the landing page** — the landing page shows how many cards and printings are in the database

## 2026-03-23

### Highlights

- feat(Cards): **CardTrader prices** — CardTrader prices appear alongside TCGPlayer and Cardmarket on card detail pages

## 2026-03-20

### Other

- fix(Cards): **No false text-mismatch warning** — the "printed text differs" warning stays hidden when the printed text matches the canonical text

## 2026-03-16

### Highlights

- feat(Cards): **Faster price loading** — price data loads quicker thanks to browser caching

### Other

- fix(App): **Themed not-found page** — visiting an unknown URL shows a styled "not found" page instead of a blank one

## 2026-03-13

### Highlights

- feat(App): **Friendly route error page** — route errors show a helpful fallback page instead of a blank screen

## 2026-03-11

### Other

- fix(App): **Open the logo in a new tab** — middle-clicking or ctrl-clicking the logo opens the home page in a new tab, like the other nav links

## 2026-03-10

### Highlights

- feat(App): **Landing page** — OpenRift now has a landing page at / with sign-in and a quick link to browse cards, plus a hidden easter egg to find
- fix(App): **Automatic updates** — app updates install on their own instead of needing a manual reload, fixing a crash loop on some devices where stale cached code hid the update prompt

## 2026-03-09

### Other

- feat(App): **Legal and privacy pages** — legal notice and privacy policy pages are reachable from the footer
- fix(Cards): **Consistent card heights** — cards render at the same height across browsers, fixing a layout issue on Safari and WebKit

## 2026-03-08

### Highlights

- feat(App): **Streamlined menu and settings** — the profile menu now holds dark mode, what's new, and update controls (the separate settings gear is gone), and card display settings live in the card browser next to sort and view controls
- feat(App): **Easier-to-find updates** — an "Update" badge marks "What's new" when the blue dot appears, and checking for updates lives inline in the changelog panel
- feat(App): **Sticky changelog dates** — date headers stick as you scroll with relative labels like "Today" or "3 days ago", and the changelog header scrolls away to make room for entries

### Other

- fix(App): **Faster scrollbar fade** — the scrollbar fades out sooner on desktop after you stop scrolling
- fix(App): **Update dot stays put** — the blue update dot no longer vanishes when you dismiss the update notification
- fix(Cards): **Smoother grid scrolling** — scrolling up on the card grid no longer stutters after jumping to a distant position

## 2026-03-07

### Other

- feat(Cards): **Foil shimmer on stacks** — stacked cards in the grid show a foil shimmer effect
- fix(Cards): **Fanned sibling clicks** — clicking a fanned sibling card opens its detail pane correctly
- fix(Cards): **Selected card stays in view** — it no longer scrolls off when the grid resizes as the detail pane opens

## 2026-03-06

### Other

- feat(Cards): **Mobile controls in the filter drawer** — sort, view, and column controls move into the filter drawer on mobile for a cleaner layout
- fix(Account): **Google sign-in redirect** — signing in with Google no longer lands on a "Not Found" page on the way back
- fix(Account): **Email carries to password reset** — the email you typed on the login page follows you to "Forgot your password?" and back
- fix(Account): **Signup with a slow mail server** — signing up no longer hangs when the mail server is slow to respond

## 2026-03-05

### Other

- feat(Cards): **Cardmarket price badge** — Cardmarket prices show as a badge in the card detail view and version list
- feat(Account): **Playful reset placeholder** — the reset password page shows a random funny email placeholder
- fix(Account): **Resend verification for unverified emails** — signing up with an already-registered but unverified email re-sends the verification code

## 2026-03-04

### Highlights

- feat(Cards): **Price history charts** — see how a card's price has changed over time, with a compact trend sparkline in the detail sidebar

### Other

- fix(Cards): **Distinct price-range colors** — each end of the price range gets its own color in stacked view

## 2026-03-03

### Highlights

- feat(Cards): **Stacked printings view** — the card browser groups printings of the same card into one tile by default, with a price range and fan preview on hover, and a "Printings" view to see every version individually
- feat(Cards): **Cardmarket prices and daily refresh** — Cardmarket prices appear alongside TCGplayer prices, with all prices refreshing daily and a TCGplayer icon replacing the old text label
- feat(Cards): **Versions section on card detail** — when a card has multiple printings, switch between finishes, art variants, and other versions, and see the official card text with a note when the printed version differs
- feat(Account): **Sign in with Google or Discord** — sign in with a Google or Discord account, and link or unlink them from your profile page
- feat(Account): **Account and profile management** — the profile page gets a card-based layout to change your email, update your password, and delete your account, with email changes and forgotten-password resets handled through a secure 6-digit email code
- feat(Account): **Gravatar profile picture** — your Gravatar appears in the header and on the profile page
- feat(Cards): **Signed and Promo filters** — filter cards by Signed and Promo status with three-state toggles in the filter panel

### Other

- fix(Cards): **Sensible minimum columns** — the column stepper won't shrink to absurdly few columns on wide screens, with the minimum scaling to your screen size, and the plus/minus buttons start enabled when you open the page
- fix(Cards): **Clear load-failure message** — the grid shows "Couldn't load cards" with a retry button when data fails, instead of "No cards found"
- fix(Cards): **No bare filter headings** — empty filter sections stay hidden when no cards are loaded

## 2026-03-02

### Highlights

- feat(Account): **Email verification on signup** — new accounts must verify their email before signing in, keeping fake signups out
- feat(Account): **Redesigned login and signup** — the login and signup pages have a fresh look with inline form validation

### Other

- fix(Cards): **Closing detail deselects** — closing the card detail panel clears the selection instead of leaving the card highlighted
- fix(Cards): **Variant filter accuracy** — filtering by a specific variant no longer shows cards that have no variant
- fix(Cards): **Prices near $10k fit** — prices near the $10k boundary no longer overflow their display space
- fix(Cards): **Smoother sticky set header** — the sticky set header no longer stutters while scrolling

## 2026-02-28

### Other

- fix(Cards): **Foil tilt toggle on mobile** — tapping a foil card now turns the tilt effect back off instead of staying stuck on
- fix(Cards): **Scrollbar drag off-screen** — sliding your finger past the screen edge now ends the drag cleanly instead of freezing on a wrong card number
- fix(Cards): **Scrollbar handle text wrapping** — the handle label no longer breaks onto multiple lines while dragging on mobile

## 2026-02-26

### Highlights

- feat(Account): **Email sign-up and sign-in** — create an account with email and password and manage it on a profile page where you can see your account info and change your display name, all set up for the collection features to come

### Other

- fix(App): **Browser back and forward** — moving between pages with the browser buttons now lands where you expect

## 2026-02-25

### Highlights

- feat(Cards): **Persistent filter sidebar** — on wide screens (1600px+) filters live in an always-visible sidebar, so you no longer open a panel to change them
- feat(Cards): **Database-backed card data** — cards are now served from a real database instead of static files, with no loss in speed

### Other

- feat(App): **Wider ultrawide layout** — new breakpoints let the grid use more of the screen on ultrawide monitors
- feat(Cards): **Sharper scroll indicator** — the scroll indicator grows while you drag and snaps more precisely to set boundaries
- fix(App): **Smoother drawer closing** — drawers now slide shut when you tap outside or release a half-swipe instead of vanishing instantly
- fix(Cards): **Steady grid layout** — the grid no longer jumps when a sticky set header appears or when the window is resized
- fix(App): **Full-width header and footer** — the header and footer now stretch to match the content width on wide screens
- fix(Cards): **Stable scroll indicator** — the scroll indicator no longer drifts, resizes, or disappears during and after dragging

## 2026-02-24

### Highlights

- feat(Cards): **Color-coded prices** — prices are tinted by value (grey for bulk, green for $1 to $10, amber for $10 to $50, rose for $50+) and always show whether they're normal or foil, even when only one variant exists
- feat(Cards): **Redesigned card detail** — the detail sidebar has a fresh layout with distinct panels for descriptions and effects (effects tinted in the card's domain color), inline keyword styling with italic reminder text, clearer type info, and pricing shown as compact chips at the bottom
- feat(Cards): **Tap to toggle foil** — tap the card image in the detail view to switch the holographic foil effect on or off

### Other

- feat(Cards): **Always-on scroll indicator** — the scroll indicator is always draggable now, with an accent dot, a glowing ring, and smart positioning so it avoids overlapping other elements
- feat(Cards): **Right-sized thumbnails** — card thumbnails load at the resolution that fits their display size, saving bandwidth on smaller screens
- fix(Cards): **Prices fit small cards** — prices no longer overflow tight spaces, wrapping, dropping labels when narrow, and using a compact format like $25 or $1.2k
- fix(Cards): **Tidy card info row** — compact view shows IDs as #001 instead of OGS-001, and the ID, type, and rarity share one icon-only row with the title on its own line so nothing gets clipped on narrow columns
- fix(Cards): **Column zoom reset** — tapping the column number resets to auto, and stepping from auto snaps to the next size up or down
- fix(App): **Re-showing dismissed updates** — checking for updates after dismissing the popup now re-shows the update instead of claiming you're on the latest version
- fix(Cards): **Keyword tap closes detail** — tapping a keyword or tag in the card detail now closes the pane on mobile so you can see the filtered results
- fix(Cards): **Correct mobile columns** — the grid now matches your screen size the moment it opens instead of briefly showing 4 columns on mobile
- fix(Cards): **iOS tilt toggle stays** — the tilt toggle on iOS no longer disappears after you deny gyroscope permission
- fix(Cards): **No empty description box** — cards without a description no longer show an empty text box in the detail view
- fix(Cards): **Subtler card tilt** — the 3D tilt effect on cards is now gentler and less exaggerated
- fix(Cards): **Floating set header pills** — sticky set headers appear as compact floating pills instead of stretching the full width

## 2026-02-23

### Highlights

- feat(Cards): **Holographic foil cards** — cards shimmer with a holographic foil effect when you hover on desktop or tilt your phone in the detail view, and TCGPlayer price data now shows on cards
- feat(Cards): **Browse cards by swipe and arrow keys** — swipe left or right on mobile to move between cards without closing the detail view, and arrow keys step through a selected card while the grid scrolls to keep it in view
- feat(Cards): **Quick-jump scroll indicator** — a draggable scroll indicator with a ghost badge lets you jump between sets, opt-in via settings

### Other

- feat(Cards): **Cards-per-row in the filter bar** — the cards-per-row control sits next to sort, you can pinch to zoom on mobile, and you can set the maximum per row from settings
- feat(App): **Swipe-to-dismiss panels** — mobile filter and changelog panels can be swiped away
- feat(App): **Toast update notifications** — update and offline notifications appear as toast popups instead of fixed overlays, and the settings menu shows when an update is available
- fix(Cards): **Detail pane clears headers** — the card detail pane no longer hides behind sticky set headers

## 2026-02-21

### Highlights

- feat(App): **Works offline and installable** — the app works offline and can be installed to your home screen
- feat(Cards): **Grouped by set** — cards are grouped by set with the set name staying visible as you scroll, and tapping a set header scrolls back to the start of that set

### Other

- feat(App): **What's new panel** — a "What's new" panel in the settings menu shows recent changes, and the menu also shows the current build version
- feat(Cards): **Jump to next set** — a bottom overlay lets you jump to the next set section
- feat(App): **Tap logo to scroll up** — tapping the header logo scrolls back to the top
- feat(App): **Slogan in mobile header** — a short slogan now shows in the header on mobile
- feat(Cards): **Mobile display settings** — display settings are gathered in one place on mobile, with filters sliding up from the bottom for easier one-handed reach
- feat(Cards): **Clearer active filters** — active filters show with a distinct background and icons, and you can flip the sort order with a toggle
- feat(Cards): **Show or hide card fields** — each card can show or hide its ID, title, type, and rarity
- feat(Cards): **Filter by Signed variant** — you can now filter for the Signed card variant
- fix(Cards): **No accidental filter deselect** — tapping a filter quickly no longer accidentally turns it off

## 2026-02-20

### Highlights

- feat(Cards): **Card detail sidebar** — tap any card to open its details in a sidebar, showing real images (with a toggle to rotate to landscape) plus rarity, type, and domain icons with domain-based coloring
- feat(Cards): **Search and filter cards** — search across name, type, and card text with scope chips to pick which fields to search, and filter by card version (Normal, Alt Art, Overnumbered) or search by ID

### Other

- feat(Cards): **Inline card count** — the card count shows right in the filter bar
- feat(App): **Settings menu** — a settings menu gives you dark mode and filter controls
- feat(Cards): **Default sort by ID** — cards are sorted by ID by default
- feat(Cards): **Official Riftbound data** — the app uses official Riftbound card data, with domain colors matching the official icons including multi-domain cards
