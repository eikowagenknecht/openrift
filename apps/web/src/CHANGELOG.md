# Changelog

## 2026-08-02

### Highlights

- feat(Trades): **Discord trade channels** — mark a channel with `/tradechannel` and the bot answers ordinary posts that name a card with who in your group has it, no command needed.

### Other

- feat(App): **Shorter Discord card replies** — a card lookup now shows the image and prices, with the stats and rules text behind a Details button, and flags a ban or errata right away.
- fix(Collection): **Quick add asks before deleting card details** — undoing an add in the quick-add palette removed a copy outright, so any grade, condition, notes, or links you had recorded on it since adding went with it.
- fix(Tournaments): **Cancelled tournaments stay readable** — cancelling a tournament with pairings broke its pairings tab and every participant's follow link with an error; both now open and show it as cancelled.
- fix(Collection): **Errors on failed list and collection edits** — adding to a list, changing an entry, or reordering lists and collections used to revert with no message, and now says why it failed.

## 2026-08-01

### Highlights

- feat(App): **OpenRift Discord bot** — add the bot to your server to look up cards, unfurl deck codes, and quote rules right in chat, with setup steps in the Help Center.
- feat(Collection): **Dynamic rules for organize lists** — organize lists now take the same filter-driven rules wish and trade lists have, so a list can fill itself with every card matching a filter, or every matching copy in your collection.
- feat(Collection): **Price filters in dynamic rules** — list rules can now match by market price on a marketplace you pick (for example, offer every card worth 5 or more).
- fix(Collection): **Value over time matches your collection value** — the chart ended on a different figure than the value beside it, and cards listed under several marketplace entries could take the wrong price.
- fix(Collection): **Collection stats follow your filters** — the totals and estimated value at the top of the stats page counted your whole collection while the charts below them honored the active filters.

### Other

- feat(Collection): **Top ten priciest cards** — collection stats now list your most valuable printings instead of a single one, showing two with a button to reveal ten, and the cheapest-printing tile is gone.
- fix(App): **Pull to refresh works again** — pulling down at the top of a page on a phone did nothing, because the app suppressed the browser's own refresh gesture.
- fix(Collection): **Language filter now reachable** — a collection holding only cards in languages you haven't enabled looked empty with no filter to clear, so the Language filter now lists any language it's narrowing by.

## 2026-07-31

### Highlights

- feat(Products): **Product pages load instantly** — a product's card list now arrives with the page instead of appearing once the card data finishes loading, and repeat visits are served from cache.

### Other

- fix(Account): **Old settings could break every page** — a saved setting the app no longer recognizes is now ignored instead of failing the request that loads your settings.

## 2026-07-30

### Other

- fix(App): **Missing help articles** — articles kept behind a feature flag never appeared in the Help Center index, even once the flag was switched on.

## 2026-07-29

### Highlights

- feat(Cards): **Real artwork for missing images** — printings without a scanned image now show the standard printing's artwork, labeled as placeholder art with badges for anything the borrowed image doesn't show (language, promo stamp, signature).
- fix(Cards): **Sharper scanned card images** — scans now crop tightly to the card (dust on the scanner glass no longer leaves wide white margins) and get a contrast fix that restores true blacks on washed-out scans.

### Other

- feat(Tournaments): **Decklist API help article** — a new help article explains how registration websites push entrant decklists into a tournament's deck check, from API keys to player claim links.
- feat(Cards): **Cleaner card labels** — the row below each card drops the type icons, shows proper rarity names on hover, and only shows the foil sparkle on commons and uncommons, where foil is a premium variant.
- fix(Cards): **Search inside the More filters** — typing in a filter's search box under More did nothing because the menu grabbed the keystrokes, the text now lands in the box.
- fix(Collection): **Library stays open while you switch** — the "show whole library" button no longer switches itself off every time you move to another collection or list.

## 2026-07-28

### Highlights

- feat(Decks): **Missing cards straight to a wishlist** — the missing-cards view can now top up one of your existing wishlists, and a new copy button gives a paste-ready wants list for Cardmarket's shopping wizard.
- feat(Collection): **CSV export in more formats** — collections now also export in RiftMana and RiftCore layouts, and wishlists and tradelists can download as CSV in any supported format.
- feat(Decks): **Smarter deck import** — the importer now detects what you pasted (deck list, deck code, TTS string, or a shared-deck link) and can read a deck straight from an uploaded file or a URL containing a deck code.

### Other

- feat(Collection): **Cardmarket export for lists** — the list export dialog adds a paste-ready wants list for Cardmarket's shopping wizard, and lists of specific printings can now export too.
- fix(Decks): **Import & replace for local decks** — using it on a deck stored in this browser failed or quietly made a new deck, the cards now land in the deck you started from.

## 2026-07-27

### Highlights

- feat(Tournaments): **Simpler tournament setup** — the create page trims the explanations and groups play mode, pairings (one Swiss BO1/BO3 or FFA choice with an on/off switch), points and decks into compact two-column cards.
- feat(Tournaments): **2v2 teams shown as teams** — match cards, the standings preview and result entry now treat each duo as one entry with a shared score, combined avatar initials, and per-side scoreline buttons.
- feat(App): **A QR for every share link** — collection, list, deck, profile and all-lists links now show a scannable code next to the link, so you can hand one to someone at a table without printing anything first.
- fix(Collection): **Accurate bulk move and dispose** — when a large move or dispose fails partway, the cards that already went through now stay done, with the error covering only the rest.

### Other

- feat(Trades): **Easier-to-read trade emails** — update and request emails now sort cards under accepted/declined and wants/offers headings instead of repeating a full sentence per card, and match digests list cards per trade partner.
- feat(Groups): **Join-code QR without the detour** — the invite code on the manage page shows its QR in place instead of behind a dialog, and copying the link now confirms it worked.
- fix(Collection): **No false success on just-added cards** — acting on cards in the brief moment they are still saving now shows a clear message instead of a success that did nothing.
- fix(Trades): **No double-booked copies** — a copy can no longer be claimed by a trade and a loan at the same time when both happen in the same instant.
- fix(Tournaments): **Judges no longer overwrite each other** — two judges deciding on the same deck at once now get a clear conflict instead of silently replacing the first decision.
- fix(Decks): **Copy limit applies from Overflow** — dragging extra copies of a card out of Overflow into the deck no longer sneaks past the 3-copy limit.
- fix(Decks): **Legend swap keeps matching runes** — switching legends now removes only the runes that no longer fit the new domains instead of clearing all of them.
- fix(Cards): **Filter panel edge cases** — a still-active filter now stays visible when it drops out of the options list, and the price slider disables when only one price remains.
- fix(Account): **Flicker while typing your email** — the sign-in and sign-up pages rebuilt the whole card on every keystroke, which made the email field flicker on iOS.
- fix(App): **Dropdown options no longer cut off** — open dropdowns now widen to fit long options instead of clipping them at the button's width.
- fix(Tournaments): **Start date prefill now visible** — the new-tournament page filled the start date in on save, but the field looked empty until now.
- fix(Tournaments): **Quieter match cards for organizers** — pairing fairness stats only appear when something is off, and player rows drop the cryptic standings figure.
- fix(Decks): **Scannable QR on deck share images** — the code was drawn light-on-dark, which some phone cameras refuse to read, and now sits on a light plate.
- fix(App): **QR codes scan more easily** — every code on screen carries more error correction and a proper quiet zone, so they read from further away and at sharper angles.

## 2026-07-26

### Highlights

- feat(Tournaments): **2v2 team tournaments** — pick 2v2 as the play mode, pair players into fixed teams of two, and run Swiss rounds where teams are paired, scored, and ranked together (decks are also checked against the 2v2 banlist).
- feat(Tournaments): **Your deck lives on the tournament page** — every tournament you entered now shows a My deck tile that opens your list, tells you when it is still unsubmitted or a judge asked for changes, and replaces the old "My tournament decks" entry in the account menu.

### Other

- fix(Tournaments): **Pair up players stuck on byes** — the round editor gains a New match zone, so after a drop removes a table its remaining players can be seated against each other again.

## 2026-07-25

### Highlights

- feat(App): **Sorting and grouping stick per page** — cards, collections, decks and promos each remember how you last sorted and grouped them, while a link someone shares still opens in their view without changing your own.
- feat(Collection): **Printable binder QR sheet** — share dialogs can now create a PDF with a QR code to your link, sized to a real card or a 2×2 or 3×3 binder page, so trade partners can scan it out of your binder.
- fix(Cards): **Search ignores punctuation** — "dorans shield" and "doran's shield" now find Doran’s Shield, and searching card text no longer needs the exact apostrophe, dash or accent that the card is printed with.
- fix(App): **Crash on older iPhones** — card, deck and collection pages failed to load on iOS below 17.4, and now work again.

### Other

- feat(Decks): **Deck image as a printable PDF** — the deck image export now also downloads as a single A4 page.
- fix(Tournaments): **Own score entry in Swiss events** — players following a Swiss tournament by report link can save their own score again instead of getting an error.
- fix(Decks): **Deck cost ignores overflow** — cards parked in the overflow zone no longer count toward a deck's price, ownership or missing count, and the cost now splits into main deck plus sideboard.

## 2026-07-24

### Highlights

- feat(Products): **Add a product to your collection** — one click on a product page (or the plus on the products list) puts the full card list into a collection of your choice.
- feat(Collection): **Special versions count as owned** — wishlist rules gain a "Count special versions" switch: alt arts, foils, signed and promo copies fill the missing count, while the list keeps asking only for printings matching the filter.
- feat(Trades): **Condition and notes on suggestions** — trade suggestions now show the offered copies' condition (or grade) and public notes, so you know what you'd get before requesting.

### Other

- feat(Products): **Product list grouped by set** — the products page now splits into one section per set, in release order, with cross-set products at the end.
- feat(Collection): **Rule presets for lists** — the rule editor now offers common setups like "one of everything" or "keep a playset, trade the rest" as one-click starting points.
- fix(Trades): **Altered cards no longer match** — copies marked as altered are excluded from automatic trade matching, since a wish means the clean version.
- fix(Collection): **Rule counts say "missing"** — with "Only what I'm missing" on, the rule editor labels its counts as missing instead of matches, since owned copies shrink that number.
- fix(Products): **Simpler card counts** — products where every card is unique now show one count instead of repeating the same number twice.

## 2026-07-23

### Highlights

- feat(Collection): **Move cards with the quick palette** — the Ctrl+K palette gains a Move mode: pick source and target collections and shift copies by typing card names.

### Other

- feat(Collection): **Keep rules per printing** — tradelist keep rules can now count per printing instead of per card, so each printing keeps its own playset.
- feat(Trades): **Preview cards on hover** — hovering a trade suggestion now shows a large card image beside the list, like the deck builder.
- feat(Collection): **Search the move dialogs** — moving cards to a collection or entries to another list now offers a filter box, so the target is quick to find.
- fix(Collection): **Promos kept over plain foils** — tradelist keep rules now treat stamped printings (promos) as nicer than unmarked ones, so they stay in the keep pile instead of the offer pile.
- feat(Collection): **Marker and channel filters everywhere** — collections, shared collections, and lists now offer the promo marker and distribution channel filters known from the card browser.
- fix(Cards): **Clear filters keeps your language** — the clear-filters button now resets every filter except the language selection, so you stay in your chosen language.

## 2026-07-21

### Other

- fix(Cards): **Mobile card-detail navigation crash** — swiping through cards on a phone no longer crashes when the list changed while the detail view was open.

## 2026-07-20

### Highlights

- fix(Tournaments): **Tournament pages for players** — opening a tournament as a player no longer shows an error screen, and a pending join request no longer breaks the pairings and standings for everyone.

### Other

- fix(Tournaments): **Deleted tournament links** — an old link to a removed tournament now shows a proper 404 page instead of an error screen.

## 2026-07-17

### Other

- feat(Decks): **Sideboards hold 10 cards** — the sideboard limit is now 10 instead of 8, in the builder hints, the deck legality check, and the registration sheet.
- feat(Cards): **Format-specific ban display** — cards banned only in 2v2 now carry a "2v2 Ban" ribbon and stay usable in the deck builder, while full constructed bans keep the red banned treatment.
- fix(Rules): **Tidier rules toolbar** — the toolbar background now reaches the screen edges on phones instead of stopping short, and the changes toggle is a compact icon button.
- fix(Rules): **Readable rule diffs** — comparing rule versions no longer shows garbled characters or misplaced highlights, and rules whose wording never changed are no longer flagged as changed.

## 2026-07-16

### Highlights

- feat(Tournaments): **Redesigned tournament pages** — the tournament page now opens with an event header and leads with the live round and a standings podium, and the players, pairings, standings, and staff pages match the same look.
- feat(Tournaments): **Swiss 1v1 rounds** — tournaments can now pair head-to-head Swiss rounds (best of 1 or 3) with configurable win, draw, and bye points, automatic byes, and strong rematch avoidance.
- feat(Tournaments): **Player regions** — assign each player a region: pairings avoid same-region matchups and the standings add a per-region leaderboard.
- feat(Tournaments): **Events pages redesign** — the next tournament gets a hero card with legend art from submitted decks, and past events line up on a timeline with winner callouts and participant avatars, on the tournaments page and in groups.
- feat(Groups): **Redesigned group page** — a new group header with card art and member avatars, one trades hub for matches and in-progress trades, and an activity feed that folds big trade sessions into a single entry.
- feat(Trades): **Redesigned group trades page** — a summary band shows what needs your action and the value at stake, trades waiting on you come first, and members' shared lists appear as cards with contact info.
- feat(Groups): **A friendlier groups overview** — groups now show as tiles with member photos, shared-list counts, and a clear marker on any group that needs your attention.
- feat(Tournaments): **Enter just your own score** — players on the result link can now save their own game points next to their name; the pod completes once everyone has entered theirs.
- feat(Tournaments): **Live round updates** — while a round is open, the results page refreshes itself, so scores saved by anyone appear for everyone without reloading.

### Other

- feat(Tournaments): **Fixed tables for players** — pin a player to a physical table and their match is placed there each round; pairings stay untouched, and if two pinned players meet, the round notes who moves.
- feat(Tournaments): **Region variety across rounds** — on region-aware events, pairings now also avoid serving a player the same opposing region round after round.
- feat(Tournaments): **Fresh seating orders in pods** — the player order shown on each pod is now the seating order at the table, arranged so nobody keeps the same neighbors or turn order as in earlier rounds.
- fix(Tournaments): **Region avoidance from round 1 in pods** — 3/4-player pod events with regions on no longer pair the first round fully at random; same-region pods are avoided from the start.
- feat(Groups): **Date-anchored activity feed** — each day in the group activity feed now gets the same calendar date tile as the events timeline, replacing the Today and Yesterday headers.
- feat(Tournaments): **Podium on the shared standings link** — the standings page you share with players and spectators now leads with the top three, matching the tournament page.
- feat(Groups): **Redesigned group collections page** — pooled collections are now tiles with a fan of their own card art, and each member's shared collections list openly under their name with cover thumbnails, no unfolding needed.
- feat(Groups): **Redesigned members page** — join requests stand out in a highlighted approval band, and each member is now a card showing their role, join date, cards traded, and what they share.
- feat(Groups): **Ownership transfer in group settings** — handing the group to another member now happens on the Manage page with a member picker and confirmation, instead of hiding in a member menu.
- feat(Groups): **Tournaments first on the group overview** — the tile row now leads with tournaments, so the next event is the first thing you see.
- feat(Tournaments): **Warning before overwriting results** — the pod result form now says when someone else saved scores while you were editing, with a button to load the latest values.
- fix(Designer): **Card designer fits on phones** — the editor and live preview now stack within the screen instead of running off the right edge.
- fix(App): **Phone layout cleanup** — the sets list, card pages, group join-code controls, tournament status banners, and deck value stats no longer clip or crush their text on narrow screens.
- fix(Tournaments): **Regions required before pairing** — on region-aware events, rounds can no longer be generated while active players lack a region; the participants page now flags those players and offers a one-click Set region button.
- fix(Tournaments): **Staff invite links fit on phones** — the invite link no longer gets squeezed to a sliver beside the Copy button on a narrow screen.
- fix(Products): **Card art stays inside its band** — the fanned cover art on product tiles is now cropped at the band edge, so card corners no longer overlap the product name below.
- feat(Cards): **Clearer narrowed-search indicator** — when search is limited to certain fields, the "in:" chip now stays visible even with an empty search box and has its own remove button to search all fields again.
- fix(Cards): **Filter chips no longer detach on mobile** — the active-filter chips now stay attached to the search bar instead of sometimes floating below a gap with uneven spacing.
- fix(Groups): **Accurate tournament tile hint** — the group overview now says how many open tournaments you play in, instead of a stale deck-list count that missed some events.
- fix(Tournaments): **Readable standings on phones** — the mobile standings are now a compact ranked list showing wins, opponent score, and game points, instead of a cramped wall of numbers.

## 2026-07-15

### Highlights

- feat(Products): **Card-art product tiles** — the products page now shows each product with a fan of its signature cards, a short description, and the card counts.
- feat(Decks): **Any number of copies** — cards whose text allows more than 3 copies of themselves now build and validate correctly, with the add buttons and drag limits following the printed rule.
- feat(Cards): **See which products contain a card** — every card page now has a "Found in" list showing the sealed products and promo channels the selected printing comes in, with how many copies.
- feat(Cards): **Chinese cards now use the printed code** — Simplified Chinese printings show as SC, matching what Riot prints on the card, and saved links and language filters carry over on their own.

### Other

- fix(App): **Sidebar fold button on landscape phones** — the sidebar can be collapsed again on wider phone screens, the fold button lines up with page titles, and top bar content clears the notch on iPhones.
- fix(Tournaments): **Fairer three-player pod rotation** — the pairing engine kept seating the same low-scoring players in three-player pods; it now rotates that duty across the whole field.
- fix(Cards): **Price filter on non-English promos** — the promo price filter was hidden on every language except English, even for cards that had prices, and now appears whenever there are prices to filter on.
- fix(Products): **No more dimming for unowned cards** — product pages no longer gray out cards you don't own, your collection now shows only in the card detail pane and the owned filters.

## 2026-07-14

### Highlights

- feat(Trades): **Cardmarket export for trades** — each trade partner now has an export that copies your agreed cards as a plain list, ready to paste into Cardmarket's shopping wizard for pricing.

### Other

- fix(Collection): **List text pastes into Cardmarket** — the copied list text now writes "2x" instead of "2×", so Cardmarket's import recognizes the lines.
- fix(Collection): **Share menu renamed** — the list menu entry is now "Share" instead of "Share link", since it also covers the text and image options.

## 2026-07-13

### Highlights

- feat(Decks): **List view for decks** — a new list toggle on the deck overview shows every card in dense rows (count, energy, ownership, price, set code) that you can sort by name, energy, price, rarity, or how many you still own.
- feat(Decks): **Missing cards, ready to buy** — each missing card now shows its cost inline (copies × price), links its name to the card page, and has a button to buy it on your marketplace.

### Other

- feat(Decks): **Missing count on the deck list** — every deck in the overview now shows how many cards you still need to build it, the same number as the deck's ownership panel.
- feat(Decks): **Missing card count in value tile** — the deck value card now shows how many cards you still need alongside the estimated cost to buy them.
- fix(Decks): **Reserved cards no longer count as owned** — cards you have reserved for an outgoing trade are left out of a deck's buildable stock, so the missing count reflects what you can actually build.
- fix(Collection): **Copies filter narrows the others** — filtering by copies owned now dims the other filter options to match, and the copies slider range follows your owned-status selection.
- fix(Cards): **Battlefield thumbnails no longer cropped** — landscape Battlefield art was cropped to a center strip in card lists, tables, and stats, and now rotates to fill the frame.

## 2026-07-12

### Highlights

- feat(Collection): **Clear your Inbox** — the Inbox can't be deleted, but its menu now has a clear action that removes every card in one go.

### Other

- feat(Collection): **Remove a copy without expanding** — each variant in the card's box popover now has a minus next to its plus, removing from the same collection the plus adds to.
- feat(Collection): **Clearer copies list** — the "Copies of…" list now names each copy by its printing (variant details and rarity) and summarizes what it actually records: condition, altered, notes, links, and loan status, instead of a bare set code.
- feat(Collection): **Reset collections in one step** — a new profile danger-zone action removes every card, keeps only your Inbox, and cleans up lists that end up empty.
- feat(Cards): **Color-coded language chips** — a printing's language now shows as a colored chip (a blue EN, a red ZH) so you can spot it at a glance instead of reading the code.
- fix(Collection): **Worth counts only your cards** — the "worth" total counted shared group collections too, so it stayed non-zero after you cleared your own cards, and now counts only yours.
- fix(Cards): **Full-size rune symbols** — the rune icons in card text carried an invisible margin inside the image and rendered smaller than intended; they now fill their full space.
- fix(Collection): **Clearer wait in remove dialogs** — while the remove and take-off-tradelist dialogs check your lists, the confirm button now shows a spinner with "Checking your lists" instead of staying greyed out with no hint.
- fix(Cards): **Energy circles on the text line** — the numbered energy-cost circle in card text hung noticeably lower than the rune symbols next to it and now lines up with them.
- fix(Cards): **Placeholder art in the printing fan** — printings without a photo now fan out as proper placeholder cards (with a small Promo stamp where it applies) instead of blank gray boxes.
- fix(App): **Broken images look like missing ones** — a card image that fails to load (missing on the server, network hiccup) now shows the same fallback as a card that has no image, everywhere images appear: placeholder art in the browser and on card pages, icon tiles in lists and deck previews, or simply no thumbnail. No more empty boxes or browser broken-image icons.

## 2026-07-11

### Highlights

- feat(Cards): **Filter by card tags** — a new Tags filter groups the tags printed on cards by region, champion, and species; tag chips on card pages now apply it directly.
- fix(App): **Enter confirms dialogs** — pressing Enter in confirmation and edit dialogs now triggers the main button (save, create, remove) instead of doing nothing.

### Other

- fix(Groups): **Tournaments reachable for all members** — the group overview now shows the Tournaments tile to every member, so group tournaments are no longer hidden from players without an admin role or a submitted deck.
- fix(Cards): **Rune symbols match the cards** — rune icons in card text now show the domain's colored emblem instead of a filled disc, matching how they look on the printed cards.
- fix(Collection): **On-loan count in the card strip** — the loan marker moved from the card image into the strip above it, so it no longer covers the art and stays visible while hovering a card with several printings.
- feat(App): **Cleaner card-grid controls** — the strip above cards now looks the same on every page: counts and info chips lose their grey boxes and the "×" prefix, and the deck editor gets remove on the left, add on the right.
- feat(Collection): **Prices in quick add** — the quick-add palette now shows each printing's market price next to it, so you can see value while adding.
- fix(App): **Destructive button hover in dark mode** — red buttons like Delete gave no visual feedback under the cursor in dark mode and now lighten on hover.
- fix(App): **Search clear button spacing** — the × that clears a search box sat nearly flush against the right edge and now keeps a small gap.
- fix(Decks): **Search bar focus ring** — the ring around the deck search box was cut off at the top by the sticky title bar and now shows fully.
- fix(Trades): **Clearer trade value wording** — "You'd get ≈X" on trade headers read like cash coming to you; it now says "cards worth ≈X" to make clear it's the value of the cards.
- fix(App): **Consistent tile highlighting** — clickable tiles (groups, sets, tournaments, help, stats, decks) now share one hover style and show a focus ring when navigating by keyboard.
- fix(App): **Subtler focus rings** — inputs, buttons, and toggles now mark keyboard focus with a thinner 2px ring instead of the thick 3px halo, matching the rest of the app.
- fix(App): **One corner radius everywhere** — cards, tiles, dialogs, drawers, and pickers now share the form controls' corner radius, fixing mismatched corners in popover pickers.
- fix(Collection): **Quick add search reset on first card** — adding the first card to an empty collection no longer clears the quick-add search box mid-session.
- fix(App): **Consistent page-title dashes** — Google rewrote our title suffix with its own dash style, so search results mixed two kinds of dashes; titles now use the plain hyphen everywhere.
- fix(App): **Content flush under the title bar** — cards and content no longer sit tight against the sticky page header, so their top edge stops fading into it.

## 2026-07-10

### Other

- feat(Tournaments): **Deck-check API hint in settings** — tournament settings now show the tournament ID and link to the Deck check tab, so pushing decklists in from another tool is easier to find.
- fix(Tournaments): **Deck-check pushes before start** — pushing decklists in from another tool no longer fails with a conflict error while the tournament is still in setup, so decks can be handed in before it begins.
- fix(Groups): **Smart list counts everywhere** — dynamic wishlists and tradelists that held cards showed 0 items on member pages, the share picker, and public profile lists, and now show their real size.
- fix(Groups): **Missing in-progress trades on member pages** — a member's page hid trades whose cards were already reserved, and now lists every trade in progress with that member.
- fix(Collection): **Add popup on scrolled cards** — clicking a card's count pill after scrolling down a collection jumped the grid to the top instead of opening the variants and add popup. The grid now stays put, the popup opens where you clicked, and clicking the same pill again closes it.

## 2026-07-09

### Other

- fix(Groups): **Bulk box playset filter** — filtering a group bulk box by copies owned now counts your full personal playset across every variant (foil and normal together), so a card you already own enough of no longer shows under "cards I'm missing".

## 2026-07-08

### Highlights

- feat(Trades): **Trades grouped by person** — the Trades page now stacks your trades and possible trades under each member with a running value estimate, plus bulk Accept all, Decline all, Cancel all, and Request all buttons.
- feat(Products): **Product catalog** — the new Products page lists official products with every card inside.
- feat(Collection): **Card lending** — right-click a card in your collection to lend it to a friend: it stays owned but stops counting for decks and trades until it's back, and the new Lending page tracks who has what, including cards you're borrowing.
- fix(Trades): **Wishlist rule filters now limit matches** — a dynamic card want no longer matches printings its filters exclude (like overnumbered variants), and "only what I'm missing" no longer counts such copies as owned.

### Other

- feat(Cards): **Bullet in punctuation helpers** — the card text toolbar now has a bullet button alongside quotes, dashes, and ellipses.
- feat(App): **Ambient background color** — the soft color washes from the landing page now carry through the whole app in a quieter form, in both light and dark mode.
- fix(App): **Update prompt loop after releases** — for a while after a release, the app could repeatedly show the "new version available" prompt and reload on every page change; it now updates once and settles.
- fix(App): **Recover from rare blank-page crashes** — a rare crash that used to leave a dead white page now reloads the app once automatically.
- fix(Groups): **Rule-based list counts on the group trades page** — dynamic wishlists and tradelists showed 0 items there even when they held cards; they now show their real size.

## 2026-07-07

### Highlights

- feat(Collection): **Track each copy's condition** — right-click any owned card to record its condition or professional grade, an altered flag, notes, and photo links; imports and exports keep conditions, and removing a copy with details asks first.
- feat(Cards): **Multi-type card support** — cards with more than one type (like the new Unit Gear cards) now count for every type they carry: filters, grouping, deck rules, and copy limits all recognize both, and the card shows a glyph for each.
- feat(App): **New body typeface** — everyday text across the app, and the generated share and deck images, now use Hanken Grotesk, a warmer face that reads softer than the old default.
- fix(App): **Constant background redraw on card pages** — a hidden render loop kept the card, collection, and deck pages working nonstop even when idle, draining CPU and battery for nothing.

### Other

- feat(Tournaments): **Save your tournament deck to your decks** — a new button on your tournament deck copies the handed-in list into a regular deck, so you can keep building on it after the event.
- feat(Cards): **Punctuation helpers when submitting cards** — the contribute form's text fields gained quick buttons for curly quotes, apostrophes, em dashes, and ellipses, and flavor text now shows a live preview.
- feat(Collection): **Live match counts on list rules** — each dynamic wishlist or tradelist rule now shows how many cards it wants or copies it offers, plus a combined total once you stack several.
- fix(App): **Hairline gap under the header** — at some browser zoom levels a thin line of scrolling content peeked through between the header and the sticky bars below it.
- fix(App): **Friendlier landing headline** — the tagline now describes the app for you and your playgroup instead of claiming the fastest collection tracker.
- fix(App): **Clipped toolbar focus rings** — the highlight ring around the search box and toolbar buttons on the card pages no longer gets cut off along the top.
- fix(App): **Clearer navigation highlights** — the current page in the header is now marked by bold text instead of a filled pill, so it no longer blends into the hover highlight next to it.

## 2026-07-06

### Highlights

- feat(Collection): **Multiple rules per tradelist** — tradelists can now stack up to 10 dynamic rules, and both wishlists and tradelists let you pick how overlapping rules combine.
- feat(Collection): **Replace on import** — importing into a collection that already has copies now asks whether to add to it or replace everything with the import.
- feat(App): **Redesigned landing page** — a fanned hand of real cards takes center stage: hover to tilt them, click to collect them all, with sharper copy and new angular buttons.
- feat(App): **New display typeface** — page titles, section headings, big stat numbers, and the OpenRift wordmark now use Chakra Petch, giving the app its own voice instead of the default font everywhere.
- feat(App): **Sharper, angular look** — corners are tighter across the app, filled buttons carry a signature corner cut (delete buttons now solid red with the same shape), and tiles share one consistent card style.
- feat(App): **Friendlier empty screens** — pages without content yet (decks, collections, lists, search results) now show a fan of card outlines with clear next steps.
- feat(Decks): **Try a sample deck** — the empty decks page offers a ready-made Azir deck that opens in the builder with one click, no account needed.

### Other

- feat(Collection): **Overlapping wish rules add up** — a card matched by several wishlist rules is now wanted once per rule; switch a list to "highest rule wins" to get the old behavior.
- feat(Collection): **Special copies kept first** — trade rules now hold back foil, signed, and promo copies before plain ones when deciding what to offer.
- feat(App): **Expanded "Why OpenRift" article** — more on the story behind the app, what the other trackers do well, and a comparison table with its own trading and groups section.
- feat(App): **Refreshed interface components** — buttons now respond to hover everywhere, dialogs got subtly lighter surfaces, and mobile drawers track your finger with snappier fling-to-close.
- feat(Decks): **Placeholders for missing key cards** — deck tiles now show labeled dashed cards for a legend or champion you haven't picked yet, instead of a generic icon.
- feat(Decks): **Local decks flag when to sign in** — building a deck while signed out now clearly says it lives only on this device, with a sign-in link to keep it and use it anywhere.
- feat(App): **Landing feature previews** — the feature list now shows mini previews of the real app (price compare, deck rows, trade matches) instead of icon tiles.
- fix(Account): **Trade contacts button alignment** — the Save and Add buttons next to a contact entry now match the input height instead of sitting slightly shorter.
- fix(Cards): **Readable mobile card header** — the card detail title bar on phones now sits on a frosted, card-tinted background, so the title stays legible over the card art instead of floating on top of it.
- fix(Decks): **Copy limits in deck codes** — exporting more copies of a card than deck codes support (12 main deck, 3 sideboard) now exports the maximum and warns, instead of silently losing the card.
- fix(Tournaments): **Organizations survive owner deletion** — deleting your account now hands your organization to a co-owner or manager instead of erasing it for everyone.
- fix(Groups): **Old group links keep working** — renaming a group now forwards its previous address, so bookmarks and trade emails from recent days still open it.
- fix(Collection): **Exact CSV re-import** — importing your own export no longer drops token cards like Buff, and promos with several markers now match exactly.
- fix(App): **Share links stay out of search** — pages opened via share links now ask search engines not to index them, while link previews in chats keep working.

## 2026-07-05

### Other

- fix(App): **Cleaner message punctuation** — error messages, toasts, and the What's new list now read as plain sentences instead of dash-heavy phrasing.
- fix(Decks): **Deck codes for special printings** — exporting a deck code no longer fails when the deck pins a printing deck codes don't support yet (like a Founders alt art), it encodes the default printing or lists the skipped cards instead.
- fix(Decks): **Locked zones reject dropped cards** — dragging a card from the browser onto a zone shown as locked (like the sideboard on a Custom-Region deck) no longer adds a copy there.
- fix(Decks): **One battlefield pick in plans** — the deck plan for Custom-Region decks now offers a single battlefield slot instead of three, and the too-many-battlefields warning explains itself in plain words.
- fix(Decks): **Share dialog mentions your Plan** — the deck share dialog now says the link includes your Plan (strategy, mulligans, matchup notes), so nothing goes public unexpectedly.
- fix(Decks): **Signed-out decks survive bad storage** — decks built while signed out now load even when the browser's saved data is partially damaged, keeping every intact deck instead of failing the deck list.
- fix(Tournaments): **Hosted events survive account deletion** — deleting your account now removes you as host instead of erasing the whole tournament, so participants keep their results.
- fix(Tournaments): **No false region warning in deck checks** — Custom-Region deck checks no longer flag every deck with "Pick at least one region".
- fix(Tournaments): **Email never used as player name** — joining an event without an account name now shows the part before the @ of your email, never the full address.
- fix(Cards): **Bad links can't crash the catalog** — a card-browser link with an unknown grouping or sort value now falls back to the defaults instead of showing an error page.

## 2026-07-03

### Highlights

- feat(Decks): **Custom-Region rules update** — signature cards need their champion in the deck copy for copy, only one battlefield is played, there is no sideboard, runes of every domain are allowed, and ban badges no longer show.

### Other

- feat(Trades): **See which list matched** — each possible-trade row now names the wishlist or tradelist of yours that produced it.
- fix(Decks): **Custom-Region battlefield count** — the deck builder claimed 3 battlefields were needed while the format plays exactly 1, so all counters and hints now say 1 and a full deck reads as complete.
- fix(Decks): **Dragging onto a wrong zone keeps the card** — dropping a deck card onto a zone it can't go in (like a unit onto Runes or Battlefields) now leaves it in place, instead of removing a copy.
- fix(Collection): **All printings in list detail panes** — the detail panel on wishlists and tradelists (your own and ones shared with you) now lists every printing of a card, not just the ones on the list.
- fix(Trades): **Per-copy price on suggestions** — a suggestion priced the full amount you wished even when fewer copies were available, so it now shows the price per copy with the wished and available counts beside it.

## 2026-07-02

### Highlights

- feat(Cards): **One filter bar everywhere** — the slim filter bar is now the standard filter layout on every screen size, replacing the filter sidebar, the fold-out panel, and the compact-filters setting.
- feat(Cards): **Pick your top-level filters** — decide per filter whether it sits in front or waits under "More", replacing filter hiding (previously hidden filters now show up in More).
- feat(Cards): **Contribute cards in the app** — submit a missing card, a correction, or an image right from the app and send it straight to review, no GitHub account needed.

### Other

- feat(Cards): **Clearer filter-bar toggles** — domain and rarity toggles show their names and match counts next to the icons whenever the bar has room for them on one row, and excluded toggles drop the extra red border.
- feat(Trades): **Price estimates on trade rows** — in-progress trades and possible-trade suggestions now show their estimated value at your favorite marketplace.
- feat(Cards): **Search scope stays visible** — when "search in" is limited to certain fields, the search box now shows that scope next to your query, so a forgotten narrow scope doesn't look like broken search.
- feat(Collection): **Friendlier first visit** — an empty collection now opens the whole card library so your first cards are one tap away, and a dismissible guide explains the toolbar controls.
- feat(App): **See features before signing in** — Collection, Groups, and Tournaments now stay in the menu when signed out, and opening one explains the feature with a quick way to sign in or sign up.
- feat(Cards): **Hide the grouped column** — in table view, grouping by set, type, or rarity now drops that column, since every group header already spells out its value.
- feat(Collection): **Tradelists keep your nicer copies** — when a tradelist rule keeps a set number per card and offers the rest, it now protects your rarest, foil, and special-art copies and offers the plainer duplicates first, instead of choosing by the order copies were added.
- feat(Collection): **Rules start in your languages** — a new dynamic wishlist or tradelist rule pre-fills its language filter with your preferred languages, still editable per rule.
- fix(Collection): **Playset count mode** — the completion count mode on the stats page is now labeled Playset instead of Copies, matching what it counts.
- fix(Collection): **Group-visibility button works again** — the people icon in a list's title bar did nothing when the list had cards on it, and now opens the group visibility dialog.
- fix(Collection): **No overlapping cards after switching lists** — switching between wishlists or tradelists could stack the card rows on top of each other until the window was resized, and the grid now lays them out correctly right away.
- fix(Collection): **No zero value in the top bar** — a collection worth nothing no longer shows a 0 price next to its title.
- fix(Collection): **Lists match the card browser** — clicking a card in a wishlist or tradelist now tints its tile so you can see which one the detail pane is showing, the up and down arrow keys cycle through that card's printings, and the grouping now follows the group-by control instead of always grouping by set, just like the card browser and collection.
- fix(Collection): **Select all deletes whole stacks** — in card view, using Select all then Dispose left copies behind for any card you own in more than one printing, and now it removes every copy under each card.
- fix(Trades): **Compact trade-match rows** — each possible-trade row is shorter now, with the price and accepted trade type on one line instead of three stacked lines.
- fix(Collection): **Open lists with older rules** — a wishlist or tradelist whose dynamic rule was saved before a recent filter was added failed to open, and those lists now load again.
- fix(Collection): **Labeled rule chips on cards** — a card added by a dynamic list rule now shows a "Rule" chip on its corner instead of a bare sparkle icon, matching the table view.
- fix(Collection): **Remove excluded copies one at a time** — a tradelist rule showed the copies you excluded from its auto-offers as a bare count with a single clear-all button, and now names each excluded copy with its own remove button.
- fix(Collection): **Cleaner dynamic-rule filters** — the "has any" options for markers, tags, keywords, and the rest now sit inside their filter's picker, matching the card browser, instead of cluttering the Add filter menu.
- fix(Collection): **Import name field spacing** — the new-collection name box on the import screen sat flush against its label, and now has a proper gap.
- fix(Groups): **Readable overview rows** — the recent-activity entries and the in-progress trade rows now wrap to a second line instead of cutting off, so long card names stay legible on phones.
- fix(Trades): **Trade a card offered by a rule** — offering or accepting a card your tradelist shares through a dynamic rule failed with a "0 copies available" error, and those copies now count as available.
- fix(Trades): **Trade matches on small screens** — the possible-trades rows stack neatly on phones instead of cramming the card, price, member, and button onto one line, and the price now reads "Price".
- fix(Cards): **Placeholder for art-less cards** — a card thumbnail with no image (like a printing we haven't added art for yet) now shows a faded rarity mark tinted in the card's domain color, instead of a blank grey box.
- fix(Cards): **All printings in the detail pane** — the detail panel now lists every printing of a card, not just the ones left after your set, search, and rarity filters (still scoped to your chosen languages).
- fix(Groups): **Group matches with older list rules** — a group page could fail to load when a shared wishlist or tradelist used a dynamic rule saved before a recent filter was added, and those rules now evaluate correctly again.

## 2026-07-01

### Highlights

- feat(Decks): **Deck image in the Export menu** — download the shareable deck picture from a new Image tab in Export, for any deck, without turning on link sharing first.
- feat(Cards): **Filter by "has any" or "none"** — require a card to have at least one (or zero) markers, custom tags, distribution channels, or keywords, without naming specific values. The old Promo filter is now "Has any marker", and dynamic list rules get the same options (including supertypes) so a saved rule stays correct as the catalog grows.

### Other

- feat(Cards): **Filter by keyword** — a new Keywords filter in the More menu narrows to cards with a given ability keyword (Shield, Ambush, and the rest), alongside its has-any / none options.
- feat(Cards): **Simpler size filter** — Size moved into the More menu as a single "Oversized" toggle (require oversized, require standard, or off), instead of a separate size picker.
- feat(Collection): **Clearer list sharing** — sharing a public link and choosing which groups can see a list are now two focused dialogs that link to each other, instead of one crowded panel.
- feat(Collection): **Dynamic-rule status on lists** — a wishlist or tradelist with active dynamic rules now highlights its rules button and shows how many are running.
- fix(Account): **Trade-status email toggle** — the profile setting for trade status update emails didn't save, so opting out never took effect, and now your choice persists.
- fix(Decks): **Deck image layout** — the shared deck picture now groups the deck into sideboard, battlefield, and rune sections that grow to fill the space, lists the main and sideboard counts separately with the deck's domain icons, and centers each card in its tile.
- fix(Decks): **Proxies hidden for empty decks** — the Proxies button did nothing on a deck with no cards, and now it only appears once the deck has cards to print.

## 2026-06-30

### Highlights

- feat(Decks): **Build decks without signing in** — start a deck right away, save it on this device, and import a deck code while logged out; sign in later to keep the ones you pick.
- feat(Groups): **In-progress trades on the overview** — the group page now lists the trades you're waiting to finish, so a request you sent or a deal awaiting hand-off no longer disappears until it's complete.
- feat(Collection): **Drop a card from a list rule** — a card a dynamic rule added can now be excluded so it stays off the list, and you can put it back from the rule editor.
- feat(Cards): **Exclude values from filters** — click any filter value a second time to exclude it (sets, types, rarities, domains, and the rest, in the dropdowns too), hiding it from the catalog, with each exclusion shown as a chip you can clear.

### Other

- feat(Tournaments): **Follow-only tournament link** — share a view-only follow-along link that shows rounds and standings but cannot enter results, alongside the reporting link, and both now have a scannable QR code.
- feat(Tournaments): **Change a tournament's group** — link, switch, or unlink an event's group right in settings, instead of being locked to the choice made at creation.
- feat(App): **Link previews on WordPress** — deck, collection, list, and profile share links now unfurl to their preview image when posted on a WordPress site (via oEmbed).
- fix(Tournaments): **Group open-tournaments count** — the group page counted a finished tournament left unmarked as still open, and now matches the events list by counting only upcoming and in-progress ones.
- fix(Cards): **Standard filter shows as active** — setting only the Standard toggle trimmed the grid without lighting the filter indicator or offering a clear-all, and it now appears as a removable chip like every other filter.
- fix(App): **Stale tab recovers after an update** — a tab left open across a new release could silently stop refreshing (e.g. a deck-check page mid-event), and now reloads itself to pick up the new version.

## 2026-06-29

### Highlights

- feat(Collection): **Dynamic lists** — wish and trade lists can now fill themselves from saved rules (a playset of every card, every surplus common you own beyond two playsets, and so on), staying up to date automatically instead of being added by hand. A wish list can stack several rules and combines their matches.
- fix(Collection): **Shared list links open again** — opening someone's shared wishlist or tradelist returned an authorization error for signed-out visitors, and the public share page now loads for everyone.

### Other

- feat(Tournaments): **Simpler tournament setup** — pairings and deck collection are now independent and each optional, and judges can check any lists you collect without a separate deck-check switch, so you can run pods, a deck-only check, a plain roster, or any mix.
- feat(Tournaments): **Add staff from your group or a link** — pick organizers or judges from your group and roster, or share a per-role invite link anyone takes by confirming while signed in.
- feat(Tournaments): **Jump to a player's deck** — once a participant has a submitted deck, their row gets a button straight to it, next to the actions menu.
- feat(Tournaments): **Add players from the top bar** — the participants page moved its "Add player" button into the top bar, where it opens a dialog asking for the name, and the old field became a player search.
- feat(Tournaments): **Manage decks from the list** — a per-row menu on the deck-check list lets you withdraw, restore, or delete a player's deck without opening it.
- feat(Tournaments): **Dropped players flagged on decks** — a dropped player's deck now shows a status badge and dims in the deck-check list, so judges can see the list is kept but the player is out.
- feat(Tournaments): **Tidier deck-check entry header** — a player's contact, reviewer, sharing, and linked account now sit in a compact labeled grid, and each sharing item is marked allowed or withheld with a check or cross.
- feat(Tournaments): **Change a tournament's host** — the host is now editable in settings, so you can hand an event to an organization you belong to or take it back as a personal host instead of being locked to the choice made at creation.
- feat(Tournaments): **Organization staff shown on events** — an org-hosted event's staff page now lists the organization's owners and managers as organizers, so it's clear who can manage it even without an explicit staff grant.
- feat(Tournaments): **Claim a spot with a link** — every player you add gets a claim link (copy it from the participant menu) that ties their spot, and any deck, to their OpenRift account, now working for events without deck check too.
- feat(Tournaments): **Mark checked fills the ticks** — marking a deck checked now ticks every card as found, and re-opening it clears them again so a re-check starts clean (flagging an issue leaves your ticks as they were).
- feat(Cards): **Standard-only filter** — the More filters now have a Standard toggle that narrows the catalog to plain printings, hiding foils, signed, promo, and premium-finish versions.
- fix(Tournaments): **Deck link works without self-registration** — with sign-ups closed, the shared deck link now accepts decks from anyone who claimed their spot and points everyone else to their claim link, instead of going dead.
- fix(Tournaments): **Run org-hosted events** — pairings, standings, and round running now open for an organization's owners, managers, and staff, and participants can follow along, instead of failing to load for everyone including the host.
- fix(Tournaments): **Clearer deck-check progress** — the overview tile and deck-check list now show the same numbers, how many decks are approved and how many are checked.
- fix(Tournaments): **Overview and settings refresh after a round** — running, finalizing, or rerolling a round now updates the current-round tile and locks the pairing setup right away, instead of showing stale values until you reload.
- fix(Tournaments): **Set a member to Judge** — changing an organization member's role to Judge now takes effect, instead of silently doing nothing.
- fix(Tournaments): **No more stuck deck-check page** — opening a tournament's deck check without judge access now shows a short notice, instead of a loading spinner that never finishes.
- fix(Tournaments): **Re-issue a claim link** — unlinking the wrong account from a player's spot used to leave it stuck, so you can now re-issue its claim link for the correct player to claim.

## 2026-06-28

### Highlights

- feat(Tournaments): **One home for your events** — the new Tournaments area runs pod pairings and standings, collects player decklists, and lets judges check them, all on one event hosted by you or an organization, with times in your own timezone and multi-day scheduling.
- feat(Collection): **Import CSVs into lists** — both a list's own Import and the Import / Export page now accept any supported CSV (OpenRift, Piltover Archive, RiftCore, RiftMana) and can send the cards to a list instead of your owned collection, keeping each card's finish and art variant.
- feat(Collection): **One menu for variants and collections** — the count box on a card now opens a single menu listing each variant with the collections your copies live in, where you can add or remove copies per collection (or add to another collection) right there. Removing a copy that could come from several places opens this menu instead of chaining through separate pickers.
- feat(Cards): **Oversized cards** — cards that also come in a physically larger print are now tracked as their own variety, so you can filter by size and collect the oversized version separately from the standard one.

### Other

- feat(Tournaments): **Dashboard overview** — the event page now opens on a tile dashboard linking to participants, pairings, standings, decks, and staff instead of a tab bar, with a consistent look across those lists.
- feat(Collection): **Collapsible variants in the card menu** — when a card has several variants, the menu lists just the variants and expands one to show its collections on click, opening on the variant you came in on.
- feat(Collection): **Plain text lists on the import page** — the Import / Export page now accepts a plain text "quantity cardname" list, not just CSV exports, matching how list import already worked.
- feat(Decks): **Text deck format leads import and export** — the plain text list is now the default tab and comes first when importing or exporting a deck, ahead of the deck code.
- feat(Decks): **Custom printings are clearer** — the deck overview now rings cards that use a pinned printing, and the card menu has a "Use default printing" option to drop the pin and fall back to the standard art.
- feat(Cards): **Tidier compact filter bar** — the Stats button now reads its value (like "Energy 1–3") when one range is set, the active-filters strip is hidden while the compact bar is up (that bar already shows every active filter), and a clear-all button next to the filter settings resets every filter in one click.
- fix(App): **Smarter card-name search** — the card search in the importer, deck import, and deck check now ignores punctuation and word order, so "annie dark" finds "Annie, Dark Child".
- fix(Collection): **Tell printings apart while importing** — the importer's catalog search now shows a thumbnail, tags non-English printings (like `[ZH]`), and previews the full card on hover (reliably, even after an imageless result), matching the variant picker beside it, so two same-looking entries are no longer indistinguishable.
- fix(Collection): **Clearer import review counts** — the collection and deck import summaries now split rows into ready, "to verify" (a best guess that still imports), and "need attention", and the per-row icons match those buckets, so the warning marks line up with the count.
- fix(Collection): **Tidier variant menu layout** — the variant-and-collections menu now lines its counts and add/remove buttons into clean columns and sets each variant off as a quiet header, and a menu opened with the remove shortcut shows only remove controls.
- fix(Cards): **Group by set lists main sets first** — grouping the card grid (or table) by set now shows the main sets ahead of the supplemental ones, matching the filter sidebar order, including the cards shown on the very first page load before the grid finishes loading.
- fix(Cards): **Clear a filter with no cards left** — a selected set or value that no longer matches any cards (say after moving them to another collection) vanished from its dropdown yet stayed active. It now stays listed so you can untick it.
- fix(Collection): **Select all respects your filters** — in select mode, "select all" was grabbing every copy in the collection, even cards hidden by your active filters. It now selects only the cards currently shown.
- fix(Collection): **Variant minus no longer reopens the menu** — removing a copy from the variants popover now decrements that variant directly, instead of opening a second, near-identical variants menu.
- fix(Collection): **Friend-group copies no longer inflate your totals** — on the All Cards view, collection stats, and the variant remove popover, copies in your friend groups counted toward your owned numbers, filters, and value. They now count only when you're viewing that group's own collection.

## 2026-06-27

### Highlights

- feat(Cards): **Compact filter bar** — a new optional filter layout (turn it on under Display settings) collapses the filters above the grid into domain and rarity icon toggles plus small dropdowns, so a crowded filter area stays tidy.
- feat(Collection): **Export to Piltover Archive** — the collection export now offers a Piltover Archive CSV format alongside OpenRift's own, so you can move your collection straight into Piltover Archive.
- feat(Trades): **Trade update emails** — you now get an email when the other person accepts, declines, or cancels a trade, batched so a whole basket of cards arrives as one message, with its own toggle under email settings.
- feat(Account): **One-click email unsubscribe** — the native Unsubscribe button in Gmail and Apple Mail now works, and the in-email link opens an on-brand confirmation page.

### Other

- fix(Trades): **Clearer batched trade emails** — batched trade-request and update emails now name the sender on every line, so the trading group is never mistaken for who's trading, and a first batch no longer reads as "N more requests waiting".
- fix(Cards): **Compact "None" on range sliders** — the filter sliders now show a small no-value icon instead of the word "None", so the value labels no longer widen the row.
- fix(App): **Landing page stats load again** — the home page hero counts and card previews were blocked on the live site because the browser requested them from the wrong address, and now load correctly.

## 2026-06-26

### Highlights

- feat(Decks): **Rich deck share previews** — shared deck links now unfurl with a full visual decklist (legend, runes, battlefields, and cards), and you can download a high-resolution version for chats or printing.
- feat(Collection): **Rich previews for shared collections** — a shared collection link now unfurls with a card-art preview when posted to Discord, chat, or social, the same way shared lists already do.

## 2026-06-19

### Highlights

- feat(Trades): **Request copies one at a time** — request individual copies from a member's tradelist, each requested copy shows a "Requested" tag you can click to give back, and requesting more adjusts your existing request instead of erroring.

### Other

- feat(Trades): **Trade requests last a week** — pending trade requests now expire 7 days after they're sent instead of 24 hours, giving you more time to respond.
- feat(Trades): **See what you already own on a tradelist** — browsing a member's tradelist now shows how many of each printing you own next to the Request button, so you can skip cards you already have.
- feat(Trades): **Wishlist hearts on tradelists** — a member's tradelist now flags cards already on your wishlist with a red heart (with how many you want), and clicking it lists every wishlist the card is on so you can open the right one.
- fix(Cards): **Stray filter-panel scroll** — the expanded filter panel no longer has a small leftover scroll on desktop. It now scrolls internally only on short landscape screens, where it is actually needed.
- fix(App): **Cleaner mobile filter bar** — the title, search, and active filters now group with even spacing on phones, and active filters read as lightweight tags (with their category shown inline) instead of a heavy panel.
- fix(Trades): **Wishlist requests stay specific** — requesting a card from a member's tradelist now adds it to a wishlist that matches just that printing, not every printing of the card, and the list picker shows whether each list tracks cards or printings.

## 2026-06-18

### Highlights

- feat(Tournaments): **Enter game points, not places** — score each pod by typing every player's game points (8 wins, more when a turn overshoots), and the finishing order and standings points are worked out for you. Total game points now break ties in the standings.
- feat(Groups): **Take cards from a group bulk box** — browse a group collection and move copies into your inbox with the Take button on each card. A confirmation lets you choose how many copies to take. Cards on your wishlist show a red heart with how many you still want. Click it to jump to that wishlist, and after taking one you wanted, you're asked whether to drop it from the list.

### Other

- feat(Collection): **Choose how many copies to add to a list** — adding a card to a trade or organize list from its menu now lets you pick how many of your copies to add, instead of always adding them all.
- feat(Trades): **Choose your trade email frequency** — get trade-request emails instantly or batched every 5, 15, 30, or 60 minutes from your notification settings.
- feat(Groups): **QR code for the join link** — admins can show a scannable QR of the group invite link, handy for inviting people in person.
- feat(Tournaments): **Past events tucked away** — a group's events page now leads with upcoming events and folds past and archived ones into a collapsible "Past and archived" section
- feat(Tournaments): **Deck-check API keys moved to Manage** — a group's deck-check API keys now live on the Manage page with the other admin settings.
- feat(Tournaments): **Set what a sat-out game is worth** — a tournament setting controls the points a bye scores, from the usual win-equivalent down to 0 when sitting out means a player dropped or was not back in time.
- fix(App): **Page titles line up with content** — the title row on pages like Groups and Collection no longer sits indented from the cards below it, and the menu and avatar in the top bar line up with the content too. The misalignment was most obvious on phones held in landscape.
- fix(Collection): **Only your own cards on trade and wishlists** — cards from a group's shared collection aren't yours to trade away, so trade and wish lists no longer accept them. Dragging or adding such a card now skips those lists with a clear note instead of the old, confusing "already on the list" message, and the list isn't offered as a target in the first place. Organize lists still take shared group cards.
- fix(App): **Clear the notch in landscape** — on the installed iPhone app held sideways, sidebar pages and the match tracker no longer slip under the Dynamic Island or home indicator, so the layout stops looking shifted to one side.
- fix(Collection): **Card preview in the quick-add picker on phones** — expanding a card in the quick-add picker now shows its image at the top of the sheet, instead of no preview at all as on desktop.
- fix(Cards): **Filters scroll on landscape phones** — the filter panel held sideways no longer fills the whole screen with no way to scroll. It now scrolls inside so every section stays reachable.
- fix(Groups): **Compact share-lists rows** — each list under "Share your lists" now keeps its name and tags on one line, wrapping only when it has to.
- fix(Groups): **Alphabetical member and trade lists** — the members roster sorts by role then name instead of join date, and a member's possible trades are ordered by card name.
- fix(Groups): **Group list on mobile** — each group on the groups list now stacks on small screens, so a long group name wraps in full instead of being cut off, with the member count and badges dropping to a line below

## 2026-06-17

### Highlights

- feat(Groups): **Share contact methods, not a nickname** — let group members reach you on Discord, Signal, phone, or email. You control which channels each group sees, and nothing shows until you opt in.
- feat(Groups): **Redesigned group dashboard** — your group opens to what matters: trades waiting on you, what members are sharing, and upcoming events, each a tap away.
- feat(Trades): **Offer cards from member wishlists** — see something on a member's wishlist you own? Offer it in one tap, straight from their list.
- feat(Groups): **One-stop Trades page** — browse everything members offer and everything they want in one place, right next to the trades you can make.
- feat(Decks): **Deck Plan tab** — capture how to pilot a deck: gameplan, opening hand, battlefield, and per-matchup sideboarding, then share it on the deck page.
- feat(Collection): **Take a card off your tradelist** — sold or traded a card? Take it off in one step and it leaves your collection too. Keeping it just clears the tradelist.
- feat(Trades): **Email notifications for trades** — know the moment someone wants to trade with you, with an optional daily digest of new matches in your groups.
- feat(Tournaments): **Zone fixes after approval** — judges can correct a mis-zoned card after approval without being able to swap it for a different one.

### Other

- feat(Trades): **Time left on pending trades** — see how long a request has before it expires, so nothing lapses unnoticed.
- feat(Collection): **Share collections with a group** — let a group see your personal collections, the same way you share wishlists and tradelists.
- feat(Collection): **Reserved cards on tradelists** — cards in a live trade are held so they can't be sold or requested out from under it.
- feat(App): **Cleaner What's new page** — release notes now lead with the big stuff and tuck the rest behind a toggle.
- feat(Trades): **Choose where traded cards land** — pick which collection the cards from a finished trade go into, or make a new one on the spot.
- feat(Cards): **Quick add from the catalog** — hit Ctrl+K (Cmd+K on Mac) to drop cards into your Inbox without leaving the catalog.
- fix(App): **Steady toolbars under the iOS header** — toolbars no longer flicker or mis-size on a notched iPhone run from the Home Screen.
- fix(Trades): **Group Trades on mobile** — trade rows now read clearly on small screens, including what happens to a card you gave away.
- fix(App): **Crash adding cards on some iOS setups** — fixed a crash when adding cards on older iOS Safari or over plain http.
- fix(App): **iOS Home Screen safe areas** — content and menus no longer hide behind the status bar and Dynamic Island.
- fix(Cards): **Printing-specific link previews** — a shared link to a specific printing now shows that printing's art.
- fix(Tournaments): **No re-flag after a flagged issue** — an already-flagged entry no longer offers a button that just re-flags it.

## 2026-06-16

### Highlights

- feat(Trades): **Want button on shared tradelists** — request a card straight from a group member's tradelist, picking or creating the wishlist it goes on, in one step.
- feat(Trades): **Clearer group Trades page** — active trades come first, completed ones collapse away, and a sent trade tells you who you're waiting on.
- feat(Cards): **Legends shown by champion name** — Legends now lead with their champion name everywhere, and search finds them by either the champion or the card name.
- feat(Collection): **List sharing is now opt-in** — lists start private and joining a group no longer auto-shares them. You choose which to share when creating or joining.
- feat(Tournaments): **Fix mis-zoned tournament decks** — a judge can move flagged cards (all or some copies) to the right zone in one step, reviewing each move first.
- feat(Collection): **Safer collection removal** — removing cards warns when they're also on a list and names which, and big batches ask you to type the count to confirm.

### Other

- feat(Tournaments): **Sort deck-check cards by energy** — orders each zone by energy cost, then power, then name.
- feat(Cards): **Filter-picker stays out of the way** — the button for choosing which filters to show appears on hover over the filter panel.
- feat(Collection): **Full-height collection sidebar** — your lists and folders stay in view as you scroll the cards.
- fix(Tournaments): **Deck-check buttons above the card** — edit and remove now sit in a bar above each card, so they're easy to tap on a phone.
- fix(Rules): **Duplicate rule warnings** — a card held under several printings no longer shows the same warning twice, and copy limits count all copies together.
- fix(Collection): **Shared-list title bar** — a separator now sits between the breadcrumb and the title instead of running them together.
- fix(Tournaments): **Deck-check column count** — the card grid opens at the column count you set instead of stuck at two.
- fix(Groups): **Group member count** — shown as a chip in the page header next to the role, not a stray line above the tabs.
- fix(Tournaments): **Deck-check progress wording** — each entry now reads "X / Y cards checked" instead of "cards found".
- fix(Tournaments): **Loading placeholders** — tournament deck and deck-check pages show a page-shaped placeholder instead of a stray "Loading…".
- fix(Decks): **"Chosen Champion" wording** — deck-building help and zone hints now use "Chosen Champion" consistently instead of "Champion".
- fix(Account): **Clean session expiry** — an expired session sends you to the login page instead of freezing on an error.
- fix(Account): **Password-reset feedback** — the page now tells you if a code couldn't be sent and reminds you to check spam, instead of silently advancing.
- fix(Groups): **Activity-feed icon sizes** — member avatars now line up with the other event icons.
- fix(Decks): **Deleting a deck** — no longer opens the editor for the deck you just removed. It stays on the deck list.

## 2026-06-12

### Highlights

- feat(Tournaments): **Tournament deck submission via OpenRift** — players submit a deck through a per-event link (pick one, paste a deck code, or paste a card list), with legality warnings before sending.
- feat(Tournaments): **Tournament deck lifecycle** — submitted decks lock and move through clear states, change only when a judge grants an unlock, and a deck still open at close is sent in as-is.
- feat(Tournaments): **Per-event relaxed deck lock** — organizers can let players fix their own submission without a judge until submissions close, handy for casual leagues.
- feat(Tournaments): **Claim your tournament deck** — a link in the organizer's confirmation email connects your entered deck to your account just by signing in.
- feat(Tournaments): **My tournament decks menu** — decks you entered appear in the user menu with their status and any judge note.
- feat(Tournaments): **Judge deck-check controls** — judges can withdraw and restore entries, share a claim link, connect an entry to a player's account, and leave them a message.
- feat(Tournaments): **Check physical cards while approved** — a judge can approve the list first, then do the physical card check before recording the result.
- feat(Tournaments): **Deck publish consent at submission** — you choose whether the organizer may publish your list after the event, and whether your name and Riot ID appear.
- feat(Account): **Riot ID on your profile** — save your Riot ID once and it fills in automatically when you submit a deck to a tournament.
- feat(Tournaments): **Deck checker list view and layout controls** — switch to a scannable row-per-copy list with tick-off checkboxes, sort, and choose cards per row.
- feat(Tournaments): **Members see their own event decks** — entrants get an Events tab showing their own decks, while the full entrant view stays judge-only.
- feat(Collection): **List visibility per group** — each list's Share dialog lets you choose which groups can see a wishlist or trade list, so members can find matches with you.
- feat(App): **Shared page headers** — groups, tournaments, rules, the pack opener, the designer, and the match tracker now share one compact header that stays pinned as you scroll.
- feat(Groups): **Tidier group overview** — one trades tile shows what needs you, the shared tile leads with how much members have shared, and admins get an Invite button.
- fix(App): **Recovery after a release** — opening a page right after a new release no longer leaves you stuck on a broken view, and stale service workers are cleaned up.
- fix(Rules): **Duplicate copies counted correctly** — a card held under several printings no longer triggers warnings twice, and copy limits count all copies together.
- fix(Tournaments): **Frozen deck-check verdicts** — a checked or flagged entry's card list locks so the verdict can't change by accident, until you re-open the entry.

### Other

- feat(Tournaments): **Found zones marked in green** — a zone whose cards are all found shows its count in green with a check, so accounted-for zones stand out.
- feat(Trades): **Trades page guidance** — the Trades page explains why no matches show yet, lets you share a list right there, and flags members who aren't sharing.
- fix(Account): **Redirect after signup** — creating an account from a sign-in link (like claiming a tournament deck) now lands you where you were headed.
- fix(Rules): **Rules search box** — gained a clear button and a live match count as you type, with toolbar buttons matching the rest of the app.
- fix(Tournaments): **Riot ID field on entries** — the optional player field is now labelled Riot ID instead of the unclear Handle.
- fix(Groups): **Group tabs scroll on phones** — the tabs scroll sideways instead of being cut off at the screen edge.
- fix(Trades): **Trade match count** — the overview's matches number now counts possible trades the same way the Trades tab does, not every single copy.
- fix(App): **Consistent 24-hour times** — times use 24-hour format everywhere, and deadlines show the exact moment in UTC so the timezone is never in doubt.

## 2026-06-11

### Highlights

- feat(Tournaments): **Add deck-check entrants by hand** — judges can type a player's name and paste their decklist when the organizer system can't send it. System entries carry an API badge.
- feat(Groups): **Group collection tiles** — the overview splits the group's own collections from members' shared ones, with new-collection, share, and invite buttons.
- feat(Decks): **Pinned deck list filter bar** — the deck list's search and filter bar stays pinned as you scroll, so you can refine without scrolling back up.
- fix(App): **Faster first load after a release** — releases now refresh only the files that changed instead of discarding all cached files, so first visits aren't slow.
- fix(App): **Reload notice after a release** — a new version shows a notice with a working Reload button instead of refreshing on its own.
- fix(App): **Faster clicks on slow connections** — clicking filters or moving between pages no longer freezes while waiting for the server to confirm your theme settings.
- fix(Decks): **Shared deck card details** — opening a card's details on a shared deck page no longer crashes the detail panel.

### Other

- feat(Collection): **Quick Share button on lists** — the Share button on a wishlist or trade list now sits in the top action row, so you can share in one tap.
- fix(App): **Tighter top-bar spacing** — removed the doubled empty band above the toolbar, below the deck list filters, and under the expanded card filters.
- fix(Collection): **Clear add/remove errors** — a failed add or remove now shows in red and stays until you dismiss it, instead of looking like a normal added message.
- fix(Collection): **Collection stats on narrow screens** — the cheapest and most expensive printing cards keep their card shape and stack into one column.
- fix(Collection): **List image download** — downloading a wish or trade list as a card image works again instead of failing with an error.
- fix(Collection): **List link previews in chat** — sharing a wish or trade list link to WhatsApp or Discord shows the card preview again.

## 2026-06-10

### Highlights

- fix(Cards): **New cards show immediately** — newly added cards appear in the browser right away instead of briefly showing then dropping out from an hourly cache.
- fix(Account): **Expired session redirect** — when your login expires with the app open, you're taken to the login page and brought back where you were, instead of a crash.

### Other

- fix(Collection): **Completion ignores unreleased sets** — collection stats no longer count unreleased sets, so preview cards you can't own don't drag your numbers down (a preview set still counts if you own cards from it).
- fix(Decks): **Repeated deck deletion** — confirming a deck deletion more than once (double-click, or already deleted in another tab) no longer shows a confusing Not found error.

## 2026-06-09

### Highlights

- feat(Tournaments): **Pod tournaments** — run a free-for-all pod tournament: add players, each round splits into fair 3- and 4-player pods, tap finishing order to update standings, and share a follow-along link.
- feat(Tournaments): **Pod tournament round editing** — drag players between pods, sit someone out with a bye, switch scoring, and get warned when players would meet again or scores are lopsided.
- feat(Collection): **Filter shared collections by copies owned** — filter a shared or group collection by how many copies you own, to spot which cards you don't have a full playset of yet.
- feat(Collection): **Share lists three ways** — wishlists and trade lists can be shared as a card image, a copy-paste card list, or a link that shows a card preview in WhatsApp or Discord.
- fix(Collection): **Accurate completion for single-copy cards** — completion and cost-to-complete now count Legends, Battlefields, and unique cards as needing one copy, matching deck rules.
- fix(Cards): **Battlefield card orientation** — Battlefields show in their correct landscape orientation as the page loads, fanned stacks in Firefox no longer cut them off, and they no longer join the home page's floating cards.

### Other

- feat(Cards): **Polished generated card art** — the type icon sits in a gold-on-black pill, Gear cards show their energy cost in a diamond badge, and image-less cards use fonts that read like a printed card.
- fix(Cards): **Readable rune symbols on card art** — rune symbols next to a unit's power turn dark on light domain colors instead of staying white, and a dual-domain unit's runes sit on a half-and-half of its two colors.
- fix(Cards): **Proper names in card table headers** — grouping the card table by type, domain, or rarity shows the proper name (like Rare or Unit) instead of the internal code.
- fix(Decks): **Matching deck zone labels** — the missing-cards and price breakdown for a deck labels its zones like the rest of the app (Chosen Champion, Main Deck).
- fix(App): **Home page tab order** — pressing Tab on the home page no longer stops on the decorative floating background cards.
- fix(Groups): **Group avatar overlap** — overlapping member avatars no longer let the one behind show through when the front image has transparent areas.

## 2026-06-08

### Highlights

- feat(Designer): **Card Designer** — make your own Riftbound-style card with your photo and details, then download or copy it to share, all in your browser.
- feat(Groups): **Group overview and Trades page** — each group opens to an overview with a recent-activity feed, all trades live on one Trades page, and the group's cards and lists sit together on a Shared page.
- feat(Collection): **Pick groups when creating a list** — choose which friend groups a new wishlist or list is shared with right in the create dialog.
- feat(Cards): **Copies filter** — narrow the view by how many copies you own, on the cards page, deck builder, and your collections.
- feat(Groups): **Join request badges** — requests waiting for your approval show as a count on the Groups nav item and under the group's name.
- feat(Cards): **Customize filters** — pick which filters you see and hide the rest, with your choice carried across devices when signed in.
- feat(Decks): **Overflow zone holds anything** — the Overflow zone now holds any card type in unlimited copies, none counting toward deck legality or the 3-copy limit.
- fix(Collection): **Sensible list pricing** — lists no longer force a fixed default price. Set fixed prices on individual cards where a single number makes sense.
- fix(Cards): **Per-section owned counts** — a card in more than one set or rarity now shows that section's count instead of the same number everywhere.

### Other

- feat(Groups): **Group invite link privacy** — an invite link no longer reveals who owns the group, while still showing the name, member count, and description.
- fix(App): **Steady changelog dates** — changelog, sets, and profile dates no longer flicker to the wrong day after loading when your time zone is behind UTC.
- fix(Groups): **Proper names in group headers** — rarity, type, domain, and super type headers show the proper name instead of the internal code.
- fix(Cards): **Marker grouping in Printings only** — grouping by marker or channel is offered only in Printings view. Cards view falls back to grouping by Set.
- fix(Cards): **Steady scrolling in long lists** — long card lists no longer jump or shift as cards load and settle.
- fix(Cards): **Fan-out past the column edge** — hovering a card you own across several printings lets the fan-out spread past the column edge instead of being clipped.
- fix(Groups): **Withdraw a code join request** — joining with a code now shows your request under Awaiting approval where you can cancel it.

## 2026-06-07

### Highlights

- feat(App): **Match tracker scoring and layout** — change a player's points by tapping their card (left subtracts, right adds), and "Who goes first?" picks a player or runs a Random spotlight.
- feat(App): **2v2 match tracker mode** — choose Teams in setup so teammates share one score toward 11 while keeping their own XP, color-coded around the table.
- feat(Decks): **Cards and Printings in the deck builder** — switch the browser to Printings to pick a specific printing's art as you add it, with the 3-copy limit still applying across all printings.
- feat(Collection): **Collection starts in your languages** — your collection opens filtered to your preferred languages, clearable to see cards you own in other languages.
- fix(Trades): **Trade collection update** — the one-click update that adds received cards after a trade now works instead of failing on the receiving side.
- fix(Collection): **Adding cards no longer drops them** — cards you add now stay. Before, the app misread the server's reply and rolled them back with a spurious error.

### Other

- feat(Cards): **Pinned set name and scrubber in table view** — the table keeps the current set name pinned and adds a draggable scroll handle to jump to any set, like the grid.
- feat(Decks): **Clearer deck rows** — each row shows its copy count on the left as "2×" with energy and power costs lined up on the right.
- feat(Decks): **Clickable empty-zone hint** — the hint in an empty zone now selects that zone, switching the browser to cards that fit there.
- feat(Decks): **Minus button clears last copy** — the minus button removes a card on its last copy, so you don't need the separate remove button.
- fix(Collection): **Copies view tidy-up** — each copy in a Copies view no longer shows a pointless count or add/remove controls, in both grid and table layouts.
- fix(Cards): **Fan-out past the column edge** — hovering a card with several printings lets the fan-out spread past the column edge instead of being clipped.
- fix(Cards): **Per-printing Owned filter** — the Printings view's Owned filter matches each printing on its own, so you no longer see variants you don't have.
- fix(Decks): **Deck builder starts in your languages** — the deck builder's browser opens filtered to your preferred languages, clearable to see them all.
- fix(Decks): **Excluded cards not counted as owned** — cards marked "exclude from deck building" no longer count as owned in the deck builder's grid.
- fix(Collection): **Variant remove popup stays put** — the popup for choosing which variant to remove no longer jumps to the corner after you remove the last copy.
- fix(Decks): **Deck sidebar name truncation** — a long card name is shortened on its own instead of also cutting off the power symbols beside it.

## 2026-06-06

### Highlights

- feat(App): **Match tracker** — keep score and XP for 2 to 4 players on one device, with a points target, a winner announced at the target, and a built-in way to pick who goes first, working offline.

## 2026-06-05

### Highlights

- fix(App): **Settings sync across devices** — your language filters and collection-completion settings now sync across devices instead of silently resetting on reload.

## 2026-06-03

### Other

- fix(App): **Specific error messages** — a failed action now explains the specific reason from the server (like "Cannot delete the inbox collection") instead of a generic one.

## 2026-06-01

### Highlights

- feat(Decks): **Group collections in your deck building** — choose per shared group collection whether its cards count toward your deck building, starting excluded until you opt in.
- fix(Groups): **Shared group cards visible to all** — cards added to a group's shared collection are now visible to every member, not just whoever added them.

## 2026-05-29

### Highlights

- feat(Trades): **Request a card from a group member** — ask for a card you want, where accepting reserves it and updates your collection, wishlist, and tradelist in one click, tracked on a per-group Trades tab.
- feat(Collection): **Multi-select on lists** — pick several cards on a wishlist or tradelist (click to toggle, shift-click for a range) and move or remove them at once.

### Other

- feat(Groups): **Wider clickable list rows** — shared wishlists and tradelists open across the whole row, not just the list name.
- feat(Groups): **Full-width group rows** — the Groups overview shows each group on its own row with your role, member count, and pending join requests.
- feat(Collection): **Card context menu in collections** — right-click or long-press a card to move it, add it to a list, or dispose of it, applying to your whole selection.
- fix(Collection): **Multi-select drag moves all cards** — dragging a multi-selection now moves all of them with a count preview, instead of moving only the top card.
- fix(Collection): **Printing selection checkmark** — selecting a multi-printing card in Printings view now shows the checkmark on that printing.

## 2026-05-28

### Highlights

- feat(Groups): **Group page tabs** — the group page splits into Trading, Collections, and Members tabs, with all management actions tucked behind a "Manage" link.
- feat(Collection): **Share collections with groups** — share a personal collection read-only with one or more groups, so members can browse it from the group page or your link.
- feat(Collection): **Show library on collections** — the box icon toggles the grid to show every card in the catalog, with a + on unowned ones to add.
- feat(Collection): **Show library on lists** — wishlists and tradelists gain the same "Show library" toggle, with a + to add cards that aren't on the list yet.
- feat(Collection): **Drag cards between lists** — drag a card from one wishlist to another (or tradelist to tradelist) to move it, merging quantities if the destination already has it.
- feat(Collection): **Reorder sidebar lists by dragging** — drag rows to reorder your personal collections and lists, while the Inbox stays pinned at the top.
- feat(Trades): **Match price preferences panel** — each match tile shows both sides' price preferences as "They want" / "You'd pay", falling back to "Not set".
- feat(Trades): **Collapsed wishlist trade rows** — several printings of the same wishlist card from one member collapse into one row that expands to show each printing's count and price.
- feat(Collection): **Per-printing count pill** — a card's count pill shows the per-printing count with the per-card total in parens (like "x10 (17)"), and clicking it opens the variants popover.
- feat(Collection): **Pin a variant for the session** — clicking a variant in the fan pins it as the top printing for the rest of your session, so counts and add controls follow it.
- feat(Groups): **Groups renamed and promoted** — friend groups are now just "Groups" with a top-level Groups link in the main menu and mobile sidebar.
- feat(Collection): **Per-group sharing on lists** — a list's Share dialog gains per-group toggles, so you can pick which groups see a wishlist or tradelist.
- feat(App): **Help articles on lists and groups** — two new help articles cover wishlists and tradelists and how groups work (roles, joining, sharing, matches).
- fix(Collection): **Owned filter on collections** — the Owned filter now actually narrows the grid by the copies you hold in this collection, where before it did nothing.
- fix(Groups): **Group member menu actions** — Promote to admin, demote, transfer ownership, and remove now actually run when clicked instead of just closing the menu.

### Other

- feat(Collection): **Toggle Inbox availability** — the Inbox's deck-building availability can now be turned off like any other collection.
- feat(Cards): **Simpler All Cards owned toggle** — the catalog mode toggle becomes a single "Show owned count" button, with adding done from a collection or list page.
- feat(Decks): **Play on RiftAtlas link** — a deck's menu gains a "Play on RiftAtlas" link that opens the deck in RiftAtlas's online playtester.
- fix(Trades): **Correct offer price label** — the price for a card someone wants from you is now labeled as their offer instead of what they're asking.
- fix(Collection): **Share dialog group list** — the friend-groups list now sits inside the share dialog with the action button below it, instead of spilling past the edge.
- fix(Collection): **Printings and copies search labels** — the search bar reads "Search printings…" or "Search copies…" with a matching count, instead of always saying "Search cards".
- fix(Groups): **Group page title weight** — group, shared user, and groups-join page titles now use the same weight as other page titles.
- fix(App): **Consistent empty states** — empty states across deck list, collection stats, groups, and the activity feed share one layout, and import-warning boxes read correctly in dark mode.
- fix(Trades): **Member match links work** — marketplace links inside a member's match rows now work, and the rows no longer trigger hydration warnings on load.
- fix(Collection): **Collection value on mobile** — a collection's total value now shows in the page header on mobile too, shortening when the name is long.
- fix(Collection): **View missing link filters** — the "View missing" link now opens the browser filtered to the cards you're still missing in that group.
- fix(Collection): **Wrapping share badges** — long friend-group share badges on a shared user page now wrap to a new row instead of cutting off the list name.
- fix(Groups): **Back from a member's list** — opening a member's wishlist or tradelist and hitting Back now returns you to the member instead of the group.

## 2026-05-27

### Highlights

- feat(Trades): **Trade preferences on lists** — wishlists and tradelists carry a per-list price default plus an accepts cards/money/both hint, overridable per card and shown on match rows.
- feat(Collection): **One link for all your lists** — a single URL covers all your shared wishlists and tradelists, showing only what you've made public or shared with a group the viewer is in.
- feat(Groups): **Shared group collections** — any member can create a shared collection, add or remove cards, and see it in the sidebar, with admins able to rename or delete it.
- feat(Cards): **Owned-count variant popover** — clicking the owned-count pill on All Cards opens a popover listing each variant with +/- buttons and which collections every copy is in.
- feat(Collection): **Number-key drag quantities** — when dragging a card stack between collections, hold a number key from 2 to 9 to move that many copies (Shift moves the whole stack).
- feat(Groups): **Full browser for member lists** — opening a member's list now uses the same browser as a public share (filters, sort, group-by, virtualized grid).
- fix(Trades): **Trade preference editing** — preferences can now be edited from any list view, saving works instead of failing silently, and a currency-less Fixed price asks which currency.
- fix(Collection): **Value Over Time chart** — the chart now matches the Estimated Value in the Stats section, instead of undercounting older copies.
- fix(Collection): **Domain names on stats** — the domain donut and "by domain" rows now show proper domain names (Fury, Calm, …) instead of lowercase slugs.
- fix(Collection): **Quick add searches full catalog** — quick add now searches the whole catalog even when the grid is filtered, and no longer wipes your search after the first add on an empty collection.

### Other

- feat(Collection): **List share badges** — a shared bundle page shows a "Public" badge on lists with their own link plus a badge per group it's shared with, for signed-in viewers.
- feat(Collection): **Grouped shared list pages** — shared list pages group lists into Wishlists and Tradelists with an entry count per row.
- feat(Groups): **Copy join link** — a group's join code panel gains a Copy link button that copies a shareable URL with the code prefilled.
- feat(Groups): **List type badges on settings** — your shared lists on a group's settings page now show "Wishlist" or "Tradelist" and an entry count as badges.
- feat(Account): **Gravatar avatar fallback** — profile pictures fall back to a Gravatar before showing initials, so most members get a real avatar.
- feat(Groups): **Confirm join-code changes** — rotating or disabling a group's join code now asks for confirmation, since it immediately breaks outstanding invite links.
- feat(Collection): **Confirm sharing-link reset** — resetting your public sharing link now asks for confirmation, since the old link stops working immediately.
- fix(Cards): **Card detail in table view** — opening a card detail in table view no longer covers part of the table at mid-range widths, scrolling within its own column instead.
- fix(Collection): **Readable quick-add owned count** — the owned count on the highlighted quick-add row is now readable instead of green text on the gold background, including in dark mode.
- fix(App): **No doubled headers on dead links** — a share or card URL that no longer exists no longer renders two stacked headers and footers around the error message.
- fix(Groups): **Member avatars load** — profile pictures of group members and join requesters load again instead of showing empty circles.

## 2026-05-26

### Highlights

- feat(Decks): **Create wishlist from missing cards** — turn a deck's missing cards into a wishlist in one click, pre-named after the deck.
- feat(Decks): **Move deck cards by menu** — right-click or long-press a card in the deck builder to move it to another zone, the main way to move cards on mobile.
- feat(Collection): **Wishlists and Tradelists naming** — buy and sell lists are now called Wishlists and Tradelists to match other TCG sites.
- feat(Collection): **Quantities on shared lists** — shared lists now show how many of each card you want or have on offer.
- fix(Collection): **Live collection value** — total value and unpriced count update right away when you add, move, or remove cards, instead of staying stale until refresh.
- fix(Decks): **Zone-switch filter clearing** — switching to the legend, runes, or battlefield zone now clears the energy, might, and power filters so cards stop disappearing.
- fix(Groups): **Member list thumbnails** — card thumbnails on a group member's shared list show the art again instead of empty placeholder boxes.

### Other

- feat(Groups): **Compact member list tiles** — a group member's shared lists appear as compact tiles with an icon marking wishlists, tradelists, and organize lists.
- feat(Collection): **Unified list header** — wishlists and tradelists use the same header across your view, public links, and group shares.
- feat(Collection): **Bigger quick-add preview** — the quick add menu's card preview is now twice as big, making the right printing easier to spot.
- feat(Decks): **Rarity icons in Missing dialog** — the Missing cards dialog shows each card's rarity icon next to its set code.
- feat(Collection): **Smarter variants picker keys** — in the variants picker, Enter does what you came to do (add or remove) and Shift+Enter does the opposite, with +/- still working either way.
- fix(Cards): **Alt art label** — a single printing that is an alt art is now labeled "Alt Art" instead of "Standard".
- fix(Cards): **Printings section for single printing** — the card detail pane shows the Printings section even with one printing, so you can still see its global owned count.
- fix(Cards): **Promos links clickable** — curated links in the Promos page descriptions are clickable again after a recent safety change stripped them.
- fix(Collection): **Remove-from list in picker** — removing a card that exists in multiple collections now replaces the variants list in the same popover (Esc goes back) instead of opening a second one.

## 2026-05-23

### Highlights

- fix(App): **iOS Safari CSRF error page** — the app no longer shows an error page on some iOS Safari setups (older versions, in-app browsers, privacy proxies) that strip the headers used for CSRF protection.

## 2026-05-19

### Highlights

- feat(Groups): **Friend groups go live** — create or join a small group from the avatar menu, share your buy or sell lists, and see live matches of who has the cards you want and who wants yours.
- feat(Collection): **Quick-add in add mode** — the quick-add keyboard palette now opens in a collection's add mode too, so the same flow works whichever mode the collection is in.
- fix(App): **No iPhone zoom on search** — card search inputs in the quick-add palette and the deck and collection import flows no longer zoom the page on iPhone when you tap in.

### Other

- feat(App): **Gold menu highlight** — popover and dropdown menu highlights now use the brand gold for better contrast in dark mode.
- fix(App): **Wrapping import rows** — deck and collection import rows now wrap on mobile, so the search box and zone picker no longer push past the screen edge.

## 2026-05-18

### Highlights

- feat(Collection): **Buy, Sell, Organize lists** — new sidebar lists where each tracks cards, printings, or specific copies (you pick at creation) and any list can be shared with a public link.
- feat(Decks): **Editable deck descriptions** — decks gain an editable description shown above the overview, with Markdown support for links, lists, bold, italics, and inline code.
- feat(Collection): **List quantities and steppers** — card and printing lists track quantities, so dropping the same card twice adds another and each tile and row gets a +/- stepper (copy lists stay singular).
- feat(Collection): **Import and export card lists** — export a card list as plain text (one "quantity card name" per line) and import the same format, so you can move a list between tools without retyping.
- feat(Collection): **Browse catalog mode for lists** — card and printing lists gain a "Browse catalog" mode with a +/- stepper on every card, so you can build a list without leaving the page.
- feat(Decks): **Card details in deck views** — clicking a card in the deck overview or editor sidebar opens its details in a side panel, including on shared deck links.
- feat(Decks): **Custom - Region deck rules** — these decks now allow a Signature for any Champion in your region, allow 1 to 3 Battlefield cards instead of exactly 3, and no longer pre-filter by your Legend's domains.
- fix(Decks): **Faster deck opening** — opening a deck is noticeably faster, with first paint roughly two seconds quicker on a cold load.
- fix(App): **Stale tab refresh** — a tab left idle during a release update now refreshes itself when you return to it, so you don't click through a stale page.

### Other

- feat(Collection): **List values in title bar** — lists now show their total value in the title bar like collections, valuing card lists at the cheapest printing in your languages and marking unpriced entries.
- feat(Collection): **Clearer new-list dialog** — the new-list dialog spells out what each list is for with examples, making it clearer when to pick Cards, Printings, or Copies.
- feat(Collection): **Equals key to add** — adding cards now accepts = as well as +, so you don't have to hold Shift on US layouts.
- feat(Collection): **Add to list from selection** — selecting copies offers an "Add to list" action, and dragging a card or selection onto a sidebar list adds it there.
- feat(Cards): **Promos column controls** — the Promos page now responds to the toolbar's column-count controls like the cards browser.
- feat(App): **Friendly offline page** — when the site is briefly unreachable (for example during a deploy) you now see a friendly card-themed page instead of a generic browser error.
- fix(Decks): **Deck card highlighting** — clicking a card in the deck overview highlights it and lets you arrow-key through the deck, following the specific zone you clicked.
- fix(Cards): **Card panel closes on navigation** — the card detail panel now closes when you switch between collections, lists, and other pages, instead of carrying a card into the next one.
- fix(Cards): **Promos group-by label** — the Promos group-by dropdown no longer shows a leftover "set" option when grouping by distribution channel.
- fix(Cards): **Promos column width on load** — the Promos page no longer briefly renders as a narrow two-column grid on desktop before snapping to the correct width.

## 2026-05-17

### Highlights

- feat(Collection): **Share collections publicly** — collections can now be shared with a public link so anyone can browse, filter, sort, and see the total value without signing in.
- feat(Collection): **Share trade lists publicly** — trade lists can now be shared with a public link so anyone with it can see what you're offering without signing in.
- feat(Cards): **Multi-select Owned filter** — the Owned filter is now a multi-select with four buckets (None, Partial Playset, Full Playset, More than Full) you can combine.
- feat(Decks): **Custom format details in deck list** — the deck list shows each custom-format deck's picked tags (like "Bandle City + Neutral") and labels the badge with the real format name.

### Other

- feat(Decks): **Plain names in deck import** — the text deck importer accepts plain card names too, so a list with no leading counts imports without prefixing every row with a "1".
- feat(Cards): **Promo detail in side panel** — clicking a promo on the Promos page opens its card detail in the side panel instead of a new tab.
- fix(Decks): **Custom tags in active filters** — picked custom tags now show in the deck builder's active filters bar (grouped by category) so a tag can be cleared like any other filter.
- fix(App): **Cleaner dark mode** — dark mode has darker muted surfaces and the Auto/Light/Dark picker on the Profile page now matches the login tabs.
- fix(App): **Readable filter chip arrow** — the dropdown arrow on a selected filter chip is now readable in dark mode instead of fading into the chip.
- fix(Decks): **No double border on invalid zones** — invalid deck zones no longer get a red border on top of the warning icon.
- fix(Cards): **Fan-out on more surfaces** — hovering a card fans out its printings on shared collection links, a collection's cards view, and set pages, matching the main cards page.
- fix(Decks): **Group pill click-through** — the floating group-name pill in deck builder grid view no longer blocks clicks on the + buttons of cards in the same row.

## 2026-05-16

### Highlights

- feat(Decks): **Custom - Region deck format** — pick one or more regions and build a deck where every card carries at least one chosen region tag, keeping Constructed copy and zone rules but dropping domain restrictions.
- fix(Collection): **Drag during auto-scroll** — dragging a card onto a sidebar collection no longer breaks when the page auto-scrolls, keeping the preview under your cursor and dropping on the right collection.

## 2026-05-15

### Highlights

- feat(Decks): **Freeform decks unrestricted** — freeform decks drop constructed limits, allowing multiple legends and champions, 4+ battlefields, 4+ copies across zones, and any number of runes. Autofill and rebalance now apply only to constructed decks.
- feat(Decks): **Switch deck format from editor** — the deck editor's 3-dot menu gains a Change to freeform / Change to constructed action, matching the deck list menu.
- feat(Decks): **Custom Tags filter for freeform** — the freeform deck builder gains a Custom Tags filter to narrow the card list by curated tags (like region) when building themed decks.
- fix(App): **One-shot reload on crash** — a rare crash that left the page blank now triggers a single reload, so you don't have to refresh by hand.

## 2026-05-13

### Highlights

- feat(Decks): **Table view matches the grid in the deck builder** — each card shows its in-deck count, Shift+click previews bulk add or remove, the + button disables when a zone is full, and legend rows show Choose, Switch, and Remove labels.
- feat(Decks): **Drag champions to the chosen slot** — move a champion in and out of the chosen-champion slot, including dragging one straight from the main deck, sideboard, or overflow to replace whoever is there.
- fix(Collection): **Per-collection owned counts** — a card's owned count on a collection page now reflects copies in that collection, with the all-collections total in parentheses when it differs.
- fix(Collection): **Filters kept when switching collections** — changing collection in the sidebar now keeps your active filters instead of clearing them every time.
- fix(Cards): **Cards page stays put while you filter** — the page no longer remounts on every filter, slider, sort, or keystroke, so typing on a slow connection no longer drops focus mid-word.

### Other

- feat(Rules): **Contents button on phones** — a Contents button next to the rules search bar opens the table of contents in a bottom sheet on phones and tablets.
- feat(Rules): **Tinted collapsed rule sections** — collapsed groups on the rules page get a subtle background tint so it's easy to spot which ones have hidden content.
- fix(Rules): **Search panel fits the toolbar** — the "Search in" panel now stretches across the full toolbar on phones, so the field chips no longer wrap onto a cramped second row.
- fix(Rules): **Rules in the right order** — rules spanning multiple updates no longer appear out of sequence (such as rule 300 showing before 184.5).
- fix(Rules): **Back button after a cross-reference** — tapping a rule cross-reference then pressing back now returns you to where you were reading.
- fix(Collection): **Edit collection shows the right name** — the dialog now names the collection you're on, not the one you visited first.
- fix(Collection): **Owned-across-variants total in add mode** — the table view in add mode shows the total owned across all variants in parentheses next to the per-printing count, matching the grid.
- fix(Collection): **Steady + and - buttons** — the add and remove buttons stay put when the parenthesized total appears or disappears, instead of shifting sideways.
- fix(Cards): **Smooth variant switching** — clicking through variants on a card detail page no longer flashes a skeleton while it reloads, especially on slow connections.
- fix(Cards): **Card pages load on touch devices** — fixed a server and client mismatch in the card-tilt effect that broke the page mid-load.

## 2026-05-12

### Highlights

- feat(Collection): **Table view on collections and deck builder** — the toolbar's grid and table toggle now switches layouts on the collection and deck-builder pages too, like it already did on Cards.

### Other

- feat(Collection): **Keyboard add and remove in add mode** — pressing + or - adds or removes one of the selected card on the Cards and collection pages, matching the on-screen buttons.
- feat(Collection): **Keyboard control for variant removal** — when a card has copies of several variants, pressing - opens the variants popover, which accepts arrow keys to move the highlight and +/- to add or remove it.
- feat(Collection): **Keyboard control for "Remove from"** — the picker shown when copies span multiple collections now responds to arrow keys to move the highlight and Enter or - to choose.
- fix(Decks): **Champion in deck stays draggable** — a champion also in the main deck no longer looks already chosen, so you can still drag or click it into the chosen-champion slot.
- fix(Collection): **Remove from multiple collections** — pressing - on a card whose copies span several collections now opens the "Remove from" picker instead of doing nothing.
- fix(Collection): **Keyboard - works in table view** — the remove shortcut now works on the table view, not just the grid.

## 2026-05-11

### Highlights

- feat(Collection): **Add mode on the collection page** — the collection page now uses the same toolbar toggle as Cards, with cards going into the collection you're viewing.
- feat(Cards): **Group cards by channel, year, or marker** — the Cards page group-by dropdown now offers Distribution Channel, Year, and Marker like Promos, with trailing sections for cards that don't match.

### Other

- fix(Collection): **Quick-add respects your languages** — the Ctrl+K quick-add palette on a collection page now suggests only the languages enabled in your profile.
- fix(Collection): **Quick-add keeps the highlight in view** — the panel scrolls to keep the highlighted printing visible as you arrow up and down inside an expanded card.
- fix(Collection): **Quick-add starts fresh** — the panel opens clean each time instead of remembering last time's search and selection.
- fix(Cards): **Full channel paths in the filter** — the Distribution Channel dropdown shows each channel's full breadcrumb path, so the four "Top 8" entries are easy to tell apart.
- fix(Cards): **Sort dropdown closes on selection** — picking a sort or group-by option now closes the dropdown so you can see the result, while the asc / desc arrow still leaves it open.
- fix(App): **Firefox reloads after a deploy** — Firefox now auto-reloads to pick up a new version instead of showing a loading error.
- fix(Account): **Saving preferences works** — saving on the profile page no longer fails with a server error.
- fix(Decks): **Missing deck links show Not Found** — opening a link for a deleted or nonexistent deck now shows a Not Found page instead of a server error.

## 2026-05-09

### Other

- feat(Cards): **Arrow-key navigation in the table** — arrow keys now move through cards on the Cards page table view, scrolling the selected row into view like the grid does.
- feat(Cards): **Icons in the table columns** — the type and rarity columns on the Cards page table view show icons next to their labels.
- feat(Cards): **Full type labels in the table** — the table view shows the full type, including supertypes like "Champion Unit", with column widths retuned so longer labels fit.

## 2026-05-08

### Highlights

- feat(Cards): **Grid and Table toggle** — a new toggle on the Cards page, Promos page, and deck-builder card picker switches between the visual grid and a compact list that fits more cards on screen.
- feat(Cards): **Marker and Channel filters on more pages** — the Cards page and deck builder's card picker now expose Marker and Channel filters in the More section, so you can drill down to things like Champion-marker printings.

### Other

- feat(Cards): **Cleaner Promos section headers** — Promos sections now use a centered header style that matches the Cards page.
- feat(Cards): **Pinned Promos search and filters** — the search and filter chips on the Promos page stay pinned to the top as you scroll.
- feat(Cards): **Floating section badge on Promos** — a small badge above the Promos grid shows which section you're in and jumps back to its top when tapped.

## 2026-05-07

### Highlights

- feat(Cards): **Full filter panel on Promos** — the Promos page now has the complete filter set, a card name or code search, range sliders for energy, might, and power, and a combined sort and view control.
- feat(Cards): **Suggest an image for missing promos** — paste a URL on a promo's placeholder to submit it as a one-field GitHub pull request.
- feat(Collection): **Owned counts on Promos** — when signed in, see how many copies of each promo you own, with a toolbar toggle to turn it on or off.

### Other

- feat(Cards): **Searchable Channel filter with full paths** — the Channel filter is a searchable dropdown showing each channel's full path, so the four "Top 8" entries are easy to tell apart.
- feat(Cards): **Group Promos by card, year, or marker** — group promos by card, year, or marker alongside channel, with multi-marker cards appearing in each section and unmarked promos collecting into a trailing group.
- feat(Cards): **Pointer to the contribute form** — the Promos page points you to the contribute form when you spot a card that's missing.
- fix(Collection): **Owned-count toggle no longer crashes** — turning on the owned-count toggle on the Promos page no longer crashes the page.
- fix(Cards): **Bad card or set links show Not Found** — a mistyped or stale card or set link now shows a Not Found page instead of a server error.
- fix(Decks): **Capitalized deck thumbnail headings** — grouped card thumbnails show capitalized type headings like "Spells" instead of the lowercase slug.

## 2026-05-06

### Highlights

- feat(Rules): **Show changes on the Rules page** — a "Show changes" toggle highlights rules added, changed, or removed since the previous version, with a click-to-expand word-level diff on changed rules.
- feat(Rules): **Game terms link to their definitions** — italicized terms like Combat or Accelerate now link straight to the section that defines them.
- feat(Collection): **CSV import surfaces problems first** — the import preview puts rows needing attention at the top, with cleanly matched cards tucked into a collapsible group below.

### Other

- feat(Rules): **Tighter rules layout on mobile** — each rule fits a single row on mobile, with halved indentation so more fits on screen.
- feat(Rules): **Pinned rules search bar** — the search bar stays in view as you scroll, so you can refine your query without scrolling back up.
- feat(App): **Polished help articles** — help articles now share a consistent look with uniform cards and callouts across the section.
- feat(App): **Reading text adapts to your screen** — long-form text is slightly larger on phones and tighter on desktop for comfortable reading.
- feat(Cards): **Note about attaching photos later** — the Contribute form's image URL field notes you can leave it empty and attach photos to the pull request later.
- feat(Rules): **Compact expand control on mobile** — the Expand all / Collapse all control is a compact icon button on mobile.
- fix(Packs): **Upright battlefield cards in the simulator** — battlefield cards in the pack opener now sit upright in their slot instead of being squished into a portrait crop.
- fix(Rules): **Rules links land in the right place** — clicking a rules link now scrolls to the target cleanly instead of landing behind the sticky search bar.
- fix(Rules): **Cross-references work during a search** — clicking a cross-reference while searching now clears the filter and jumps to the target instead of doing nothing.
- fix(App): **Clearer help wording** — wording across the help articles, index, and landing page is clearer and more direct.
- fix(App): **RiftMana listed as an import source** — the Importing & Exporting help page now lists RiftMana alongside the other supported tools.

## 2026-05-05

### Highlights

- feat(Rules): **Clickable cross-references in the rules** — references like "rule 540", bare numbers like "603.7", and "CR 116" pointers all turn into clickable links.
- feat(Cards): **Promos open in a new tab** — clicking a card on the Promos page opens its detail in a new tab so you keep your place.
- feat(Cards): **One language at a time on Promos** — the Promos page shows a single language with a dropdown to switch, and the URL reflects it so each is linkable.
- feat(Rules): **Copy a direct link to any rule** — click a rule number to copy a direct link to that exact rule and share it.
- feat(Rules): **Live rules search with context** — searching updates as you type and shows each match with its enclosing section and parent rules.

### Other

- feat(Rules): **Stacked rule numbers on mobile** — each rule's number sits above its content on mobile instead of cramming onto one line.
- feat(Cards): **Correction button at the top of cards** — "Suggest a correction" now sits next to Share at the top of every card page.
- feat(Cards): **Contribute form spells out next steps** — the form lays out what to do on GitHub after you submit, so first-time contributors know what to click.
- feat(Cards): **Prev/next arrows on mobile card detail** — the mobile card detail panel now has previous and next arrows, replacing the easy-to-miss swipe gesture.
- feat(Cards): **Year field per printing** — the Contribute form has a Year field on each printing for the year stamped on the card.
- fix(Cards): **Colorless domain icon** — Colorless cards now show the correct domain icon instead of a broken-image placeholder.
- fix(Cards): **Readable detail labels** — the card detail page shows proper labels for Type, Rarity, Supertypes, and Domains instead of raw lowercase values.
- fix(Cards): **Comment box removed from Contribute** — the free-text Comment box was removed (GitHub's template overrode it), so add notes directly to the pull request description.
- fix(Cards): **Printed name always submitted** — the Contribute form always includes each printing's printed name instead of dropping it when it matched the card name.
- fix(Cards): **Printing code now required** — the form requires a printing code and shows the error inline instead of letting a code-less submission fail later.
- fix(Cards): **Uppercase language in submissions** — the form writes the language as EN so submitted files validate cleanly.
- fix(Cards): **Notes go to the pull request** — notes from the Contribute form go into the pull request description instead of the card JSON, keeping the data clean.
- fix(App): **Menus close after clicking** — the header's More menu and Feedback popover now close once you click an entry.
- fix(App): **Clean reload on new versions** — when a new version ships with a tab open, the page reloads itself instead of breaking with strange 404s.
- fix(Cards): **Free card tilt in the detail pane** — the hover tilt no longer looks clipped, so the card rotates freely within its panel.
- fix(Cards): **Correct count when grouping by set** — grouping by set now reports the right unique-card count instead of inflating it with reprints.
- fix(Cards): **No stray rarity glyph in preview** — the Contribute form's live preview no longer shows a rarity glyph before you've picked one.

## 2026-05-04

### Highlights

- feat(Rules): **Rules section is live** — the official Riftbound core rules and tournament rules are now available to everyone, linked from the More menu.
- feat(Cards): **Live preview on the Contribute form** — the form previews where each field lands on the printed card and fills in the slug as you type the name.

### Other

- feat(Cards): **Smarter contribute fields** — when contributing a card you can leave a note for the maintainer, pick markers from a dropdown, and have the printing's name pre-fill.
- feat(Cards): **Domain picker with icons** — domain pickers show an icon next to each name, cap at two domains per card, and keep Colorless on its own.
- fix(Cards): **Might-only cards show the bonus** — cards with just a Might bonus and no rules text now show the bonus on the placeholder art.
- fix(Cards): **Glyphs scale with their text** — Energy, Might, and rune glyphs scale with the surrounding text so they look right in small previews.

## 2026-05-01

### Highlights

- feat(Cards): **Contribute page** — submit a missing card or suggest a correction, which opens a prefilled pull request against the openrift-data repo for review.

### Other

- feat(Decks): **Clearer deck-builder first-time guide** — the guide reads more clearly, links to the cards-and-printings explainer, points at the + button on each row, and describes whichever format your deck uses.

## 2026-04-30

### Highlights

- feat(Cards): **Buy links on the standalone card page** — the standalone card page now shows Buy on TCGplayer, Cardmarket, and CardTrader links with the latest price for the selected printing.

### Other

- feat(Decks): **Quick guide for new deck builders** — first-timers see a four-step guide and key tips on the empty deck overview, with a link to the full help article and one-click dismiss.
- feat(Decks): **Help links on the Decks page** — the Decks page adds a help icon next to Import and New Deck, and the New Deck dialog links to the deck-building guide.
- feat(Cards): **Printed year on card detail** — card detail now shows the printed year so you can tell reprints from the original at a glance.

## 2026-04-29

### Highlights

- feat(Account): **Land on Collections after signup** — signing up now takes you to your Collections page with clear next steps instead of the public card catalog.
- fix(Account): **Land where you intended after verifying email** — after verifying your email you land on the page you were headed for and are signed in right away, instead of being dropped on the catalog and needing a refresh.
- fix(Cards): **Energy icons render at every value** — energy cost icons in card text now show for any value, including the 6 and 7 on Master Yi and Jayce, instead of a broken-image placeholder.

### Other

- feat(App): **Refreshed Why OpenRift article** — the Why OpenRift article is refreshed, and its feature comparison lays out as cards on phones instead of a squashed table.
- feat(Collection): **Import from empty Collections and Decks** — the empty Collections and Decks pages now offer an Import button so you can pull in data from another tool in one click.
- fix(Cards): **No hydration warning opening a card** — opening a card on the Cards page no longer prints a hydration warning from the owned-count badge inside the clickable row.
- fix(Account): **Quiet console on sign-out** — signing out no longer floods the console with live-query warnings as the page transitions away.

## 2026-04-28

### Highlights

- feat(Cards): **One tile per card** — the cards page and your collections now group printings of the same card under a single tile by default, with a profile setting to go back to one tile per printing.
- feat(Cards): **Filter counts that update** — filter badges on the cards page show how many cards each option matches under your other active filters, and dim options that would leave zero results.
- fix(Cards): **Cards from a fresh visit match** — the first row shown before the page finishes loading now reflects your active search and shows one English tile per card, instead of flashing other-language cards and jumping as the grid loads.
- fix(Decks): **Drop maxed-out cards back** — you can now return a card already at the 3-copy limit to its original zone or move it between main, sideboard, and overflow, instead of being forced to discard it.
- fix(Cards): **Faster image loading** — the card grid, decklist tiles, pack-opener cards, and thumbnails now pick a right-sized image for each slot, and phones skip the hover-only stacked images, so everything loads quicker.

### Other

- feat(Cards): **Per-printing owned counts** — the owned-count badge in the card detail pane now sits next to each entry in the Printings list, so you see how many of each printing you own.
- feat(Cards): **Cards listed under every set** — grouping by set now places each card under every set it was printed in rather than only the earliest, while multiple printings in one set still collapse to a single tile.
- fix(App): **Sharp logo on high-res screens** — the OpenRift logo on the homepage, header, and login flows no longer looks blurry from being scaled up on high-resolution phones.
- fix(Cards): **Reprint clicks open the right set** — clicking a reprinted card under one set now highlights and opens that set's tile instead of jumping to the set it first appeared in.
- fix(Cards): **Arrow keys after switching variant** — left and right arrow navigation in card detail now works after you switch to a non-default printing, not only on the first.
- fix(Decks): **Rune + button limit** — the + on a rune is now disabled when adding would push the count past 12 with no opposite-domain rune to swap, instead of leaving the deck stuck at 13.
- fix(Decks): **Rune removal swaps domain** — removing a rune right after a page reload now swaps in a rune of the legend's other domain instead of just lowering the count.
- fix(Decks): **Imported decks use your language** — importing from a deck code or TTS export no longer pins random non-English printings, so the deck shows in your preferred language.
- fix(Cards): **Owned popover lists each variant** — the owned-count popover now lists every printing variant with its per-collection counts, matching what the badge totals.
- fix(Cards): **Package icon stays clickable** — the package icon above each card stays clickable on hover instead of being hidden behind the variants fanning out.
- fix(Cards): **Sliders stay visible when narrowed** — the energy, might, and power sliders stay on screen as disabled rows when a filter narrows results to one shared value.
- fix(Cards): **Smooth row resizing** — resizing the browser window adjusts row heights smoothly again, so rows no longer leave large gaps when you shrink the window.
- fix(Cards): **Stable column count on wide screens** — very wide screens no longer briefly show one fewer column before settling.
- fix(Cards): **Smooth slider dragging** — the energy, might, power, and price sliders are now smooth while dragging or holding an arrow key, applying once you settle.
- fix(Cards): **Consistent warning tooltips** — the rules-deviation and banned-format warning icons now use the system tooltip, matching the rest of the icon row.
- fix(Cards): **Instant cards page from homepage** — tapping "Browse cards" opens almost instantly because the catalog quietly preloads while you're on the homepage.
- fix(Cards): **Set order from admin panel** — sets on the cards page are again grouped in the configured admin order rather than by when each was added.

## 2026-04-27

### Highlights

- feat(Decks): **Import and replace deck cards** — paste a deck code or list to overwrite the current deck in place, keeping its name and format, instead of only importing as a new deck.
- feat(Decks): **New decks page toolbar** — the decks page gains search by name, legend, or champion, sorting, filtering by format, validity, and domain, grouping options, and a compact list view.
- feat(Decks): **Pin and archive decks** — keep frequently-used decks at the top and tuck retired decks behind a toggle without deleting them.
- fix(App): **Faster homepage and cards page** — the homepage now fetches only what it shows instead of the full catalog, and the cards page shows its first row instantly on a fresh visit.

### Other

- fix(Cards): **Smaller card images on mobile** — card detail pages load faster on phones by fetching an image sized for the screen rather than the full-resolution one.
- fix(Decks): **Clearer deck stats tooltips** — chart tooltips now name the metric, show a matching gradient swatch for multi-domain bars, and adjacent segments no longer leave a hairline gap.
- fix(Account): **Display name limits** — display names are capped at 50 characters and limited to letters, digits, spaces, periods, underscores, and hyphens so they stay readable.
- fix(Collection): **Owned counts refresh on re-login** — after signing out and back in, the sidebar badges and cards page owned counts refresh straight away instead of showing the previous session's numbers.
- fix(App): **Feedback button announced** — screen readers now announce the header's Feedback button by name on mobile, where its label was hidden before.

## 2026-04-26

### Highlights

- feat(Cards): **Incomplete filter on cards** — the Owned filter gains an "Incomplete" state for cards where you don't yet own a full deck-legal playset, cycling Owned, Missing, Incomplete, off.
- feat(Collection): **Exclude collections from deck building** — each collection has an "available for deck building" toggle so display copies or lent-out cards are skipped when counting what you own.
- feat(Decks): **Unique keyword enforced** — the deck builder now flags any [Unique] card you've added more than once across the main deck or sideboard.

### Other

- feat(Collection): **Rename collections** — collections can now be renamed from the Edit collection dialog.
- fix(Collection): **Plain apostrophes in exports** — card names like "Kai'Sa" now export with a plain apostrophe in deck text, CSV, and missing-cards exports, so external tools can match them.

## 2026-04-25

### Highlights

- feat(Packs): **Realistic token slot** — the pack opener's token slot now reflects real packs: usually a basic Rune, occasionally foil or alt-art, and sometimes a Token card like Sprite or Recruit.
- fix(Packs): **No duplicate cards in a pack** — a simulated booster no longer contains the same printing twice, so the two rare-or-better slots are always different cards.

### Other

- fix(Decks): **Missing-cards prices match the deck** — the missing-cards dialog now shows the price and code of the printing the deck builder displays, not the cheapest variant in any language.

## 2026-04-24

### Other

- fix(Cards): **Hover outline during tilt** — the hover outline on card tiles is no longer cut off at the corners while the 3D tilt effect is active.
- fix(Account): **Sign-out clears preferences** — signing out now fully clears saved display preferences, so the next person on this browser starts with defaults.

## 2026-04-23

### Highlights

- feat(Collection): **One toast per batch add** — adding a burst of cards in add mode now shows a single summary toast per batch (like "Added 5 cards") instead of one per click.

### Other

- fix(Cards): **CardTrader condition filter** — CardTrader prices now exclude played-condition listings correctly so only Near Mint counts, instead of letting worse conditions show as cheapest.
- fix(Collection): **No grid flash on add or remove** — the collection grid no longer briefly grays out on each add or remove. The dim only appears when a filter or sort change is actually slow.

## 2026-04-22

### Highlights

- feat(Cards): **CardTrader Zero headline price** — CardTrader prices now lead with the cheapest CardTrader Zero (hub-fulfilled) seller you can actually order through, falling back to the overall low when no Zero seller exists.

### Other

- fix(Account): **Sign-in link keeps your email** — the sign-up page's "Sign in" link now carries the email you've typed so it stays pre-filled when you switch.
- fix(Decks): **Legend header on text import** — text import now respects an explicit "Legend:" header for a Champion card instead of auto-promoting the first Champion to the Champion zone.
- fix(Decks): **More zone headers recognized** — text import now reads "Rune Pool:" and "Main Deck:" headers (as riftdecks.com exports use) and stops dumping unknown-header cards into the prior zone.
- fix(Cards): **More accurate CardTrader lows** — cheapest CardTrader prices no longer count listings from sellers on vacation or multi-card bundles priced as a whole pack.
- fix(Cards): **Non-English CardTrader prices show** — CardTrader prices in Chinese and other non-English languages now appear alongside their English counterparts instead of being dropped.

## 2026-04-21

### Highlights

- feat(Decks): **Faster shared deck pages** — shared deck pages show the full deck and thumbnails on first paint instead of a skeleton, with the name and copy button kept in view, and repeat opens served from the edge cache.
- feat(Decks): **Build cost for logged-out viewers** — logged-out viewers of a shared deck now see its estimated build cost with a "View prices" breakdown, and a sign-in prompt that returns them to the same deck.
- fix(Collection): **Collection shows every language** — your collection now shows every card you own regardless of language, with a Language filter to narrow it yourself.

### Other

- feat(Cards): **Collapsible Promos sections** — every section on the Promos page, including language groups and card lists, can be folded to a single heading line.
- feat(Cards): **Sub-channels in Promos sidebar** — the Promos sidebar now lists sub-channels of compact sections so you can jump straight to any sub-group.
- fix(Cards): **Promos sidebar scrolls** — the Promos sidebar now scrolls independently when taller than the viewport, so the bottom entries are no longer cut off.
- fix(Account): **Instant sign-in and sign-out** — signing in and out now takes effect immediately without a page refresh, and switching accounts loads the new account's collections.
- fix(Decks): **Card preview no corner flash** — hovering a card in the deck editor or on a shared deck no longer flashes the preview in the top-left before snapping to the cursor.
- fix(Decks): **Right-click always opens printings** — right-clicking a card in the deck editor now always opens the printings menu, including for single-printing cards.
- fix(Decks): **Proxy PDF order** — the proxy PDF now prints cards in the order the deck sidebar shows them, grouped by zone and card type.
- fix(Collection): **Mixed-language CSV import** — importing a Piltover Archive CSV that mixes English and Chinese printings of one card now keeps them as separate rows.
- fix(Cards): **Cards nav keeps language filter** — clicking "Cards" in the top nav while already on the cards page no longer clears your language filter.
- fix(Account): **Sign-in form focus and tab order** — the sign-in page focuses the email field on load, auto-focuses the code input when it appears, and fixes tab order across the buttons.
- fix(Account): **Sign-up name field focus** — the sign-up page focuses the name field on load so you can start typing right away.
- fix(Account): **Password reset focus and Enter** — the password reset page focuses the email or code input as it appears, and Enter submits the form.
- fix(Collection): **Clearer Manage mode** — Manage mode labels its button "Manage cards" / "Manage printings", aligns the selection checkbox with the card edge, and enlarges the action bar.
- fix(Cards): **Ribbons clear the power pips** — the "Preview" and "Banned" ribbons now sit in the top-right corner so they no longer cover a card's power pips.
- fix(Decks): **Deck editor Back button highlight** — the Back button in the deck editor top bar now shows a proper square hover highlight matching the icon buttons next to it.

## 2026-04-20

### Highlights

- feat(Decks): **Share decks by link** — generate a link friends can view without an account and copy into their own decks in a click, with the same large hover preview and, for signed-in viewers, ownership and value tiles.
- feat(Packs): **Pack opener simulator** — open virtual Riftbound boosters at the real published pull rates, flip cards one at a time or crack a whole display at once, and see the rarity breakdown, average value, and best pulls.
- feat(Cards): **Preview and Banned ribbons** — previewed-but-unreleased cards carry a "Preview" ribbon and banned cards carry a red "Banned" ribbon everywhere they appear, not just in the deck builder.
- feat(Cards): **Printings view by default** — the cards browser and collections now open to the Printings view so each finish shows as its own tile, with a toolbar toggle and a permanent default in Display settings.

### Other

- feat(Decks): **Grouped missing-cards dialog** — the Missing cards dialog groups rows by zone with headings, shows each card's short code inline, and splits pricing into per-copy Cost and line Total columns.
- feat(Collection): **Printing picker previews** — when an Import Collection row needs a printing chosen, the dropdown shows each candidate's image and hovering one brings up a large preview.
- feat(App): **"Unofficial" badge** — the badge next to the OpenRift logo now reads "Unofficial" instead of "Beta" to make clear this is a fan project.
- feat(Cards): **Promos language totals** — each language heading on the Promos page shows how many distinct printings and cards it covers.
- fix(Decks): **Shared deck full width** — shared deck pages now fill the page width instead of collapsing into a narrow column.
- fix(Cards): **Preview ribbon not clipped** — the "Preview" ribbon on unreleased cards is no longer clipped at the card edge, so the full word is readable.
- fix(Decks): **Banned card styling** — banned cards in the deck builder now show a matching red corner ribbon over a dimmed card instead of the old big diagonal overlay.
- fix(Collection): **Unpriced note on its own line** — the "n copies unpriced" note on the Collection stats page now sits on its own line instead of wrapping mid-phrase.
- fix(Collection): **Promo CSV picks right printing** — Piltover Archive CSV imports now pick the right promo printing even when the promo type is new or unrecognized, instead of matching the non-promo card.
- fix(Cards): **Promos caret not clipped** — the collapse caret next to Promos section headings is no longer clipped off the left edge on phones.
- fix(Cards): **No double-counted promo printings** — the Promos page no longer double-counts a printing distributed through multiple channels, so the roll-up numbers match the cards below.
- fix(Decks): **Consistent printing order** — printings in the "Change printing" menu and other lists now appear in a consistent order (set, then card number, then finish).
- fix(Cards): **Battlefield thumbnails landscape** — Battlefield thumbnails in the printing picker now show in their natural landscape orientation instead of being squashed into a portrait frame.
- fix(Cards): **Comfortable promo sizing** — promo cards are sized more comfortably across screen widths, and the sidebar only appears on wider desktops so the grid can use the full width on laptops.

## 2026-04-19

### Highlights

- feat(Collection): **Starter Binder collection** — new accounts begin with a Binder alongside the Inbox, so you have somewhere to sort cards from your first booster.
- feat(Collection): **Plus/minus on owned cards** — add or remove copies of your own cards in a collection without switching into add mode.
- feat(Collection): **Variant-aware remove** — clicking minus on a card with copies of several printings lets you pick which printing to remove (in both browse and add mode), instead of silently taking from the displayed one.
- feat(Decks): **Phone deck builder gestures** — tap a card to add it to the active zone, long-press to open its detail view.
- feat(Collection): **Single-copy drag between collections** — dragging a stack moves one copy by default, Shift moves the whole stack, matching the deckbuilder.
- feat(Cards): **Promos page event hierarchy** — events are grouped into a collapsible tree with rolled-up counts and a sticky sidebar, so you can jump straight to any language, channel, or product.
- feat(Cards): **Distribution notes on card pages** — printings show their markers, channel breadcrumb, descriptions, and editor's note in one block, with a hover info icon by the rarity.
- feat(Cards): **Card detail share button** — share or copy a link to the exact printing you're viewing, which unfurls with matching art and text on Discord, Slack, and social sites.
- feat(App): **Pinned page top bar** — the back button, title, and actions stay under the global header as you scroll, keeping controls always in reach.
- fix(Collection): **Consistent owned count** — the owned count above each card stays the same when you switch between browse and add mode instead of jumping to the all-collections total.

### Other

- feat(Cards): **Close icon on mobile card detail** — the mobile card detail view now has a close (X) icon in the top right.
- feat(Cards): **Logo watermark on placeholders** — generated placeholders for imageless cards show a subtle OpenRift watermark in the art area.
- feat(Cards): **Trimmed printing info table** — the detail printing table keeps just the core attributes and gathers promo markers, channels, and the editor's note into one box.
- feat(Cards): **Metal printing icons** — metal and metal-deluxe printings get their own anvil and trophy icons, so they're no longer indistinguishable from normal printings.
- feat(Cards): **Marker chips on Promos cards** — small chips like "Promo" and "Champion" below each image show at a glance what makes each printing distinct.
- feat(Cards): **Artist and channel in variant list** — each printing shows its artist and distribution channel by the code, so you can tell variants apart without clicking each one.
- feat(Cards): **Smoother foil shimmer** — foil shimmer is off by default and, when turned on in Display settings, runs fluidly instead of in steps.
- fix(Decks): **No split hint on phones** — the deck builder printing picker drops the "shift-click to split" hint on phones, where it doesn't apply.
- fix(Decks): **Stat chart color order** — the energy and power charts now stack domain colors in the same order as the type chart and domain bar.
- fix(Cards): **Unfiltered card count** — the count by the search bar reads "407 cards" instead of "407 / 407 cards" when nothing is narrowing the list.
- fix(Cards): **Discord printing posts** — announcements of new printings now include the thumbnail and show proper finish and language names instead of raw slugs.
- fix(Collection): **Scroll badge fades on touch** — the scroll position badge fades shortly after you stop scrolling instead of lingering and blocking taps.
- fix(Collection): **Recording indicator layout** — the add-mode recording indicator sits beside the collection's card count instead of hiding it.
- fix(Cards): **Full language name** — the Language row on a card's detail page shows the full name (like "English") instead of the two-letter code.
- fix(Cards): **Firefox promo overflow** — imageless promo cards no longer spill out below the page footer on Firefox.
- fix(Cards): **Art variant labels** — art variant labels on the detail page show their display name (like "Overnumbered", "Alt Art") instead of the raw slug.
- fix(Cards): **Light-mode stat icons** — the power and might icons on a card's detail page are now visible in light mode instead of blending in.
- fix(Cards): **Finish display names** — finish labels now come from the finishes table, so non-foil finishes show their proper name instead of the raw slug.
- fix(Cards): **Matching share preview** — a shared card link's preview image and description now match the printing shown on the page.

## 2026-04-18

### Highlights

- feat(Cards): **Marketplace prices clarified** — your favorite marketplace stands out and drives the per-row price, with affiliate links noted and the profile setting explaining each market's trade-offs.
- feat(Decks): **Deck zone tiles clarified** — empty zones show a clickable dashed button with a hint, the edit pencil stays visible, and brand-new constructed decks show a muted badge instead of an amber warning.
- fix(Decks): **Export deck dialog fixes** — proxies export uses the printings shown in the deck instead of stray Chinese cards, the dialog scrolls inside itself on iPhone, and switching tabs no longer collapses it.

### Other

- feat(Collection): **Consistent add-to-collection icon** — the collection page's "Browse & add" button uses the same box icon as the cards page.
- feat(Cards): **Count/add toggle in toolbar** — the collection mode toggle now sits in the mobile toolbar instead of inside the options drawer.
- feat(App): **Mobile menu order** — the mobile menu lists Cards, Collection, and Decks first with Rules and Promos under "More", matching desktop.
- fix(Cards): **Trimmed white scan borders** — card images with a white border around the scan have it trimmed off, so every card fills its thumbnail evenly.
- fix(Collection): **Quick add icon** — the "Quick add" button uses a lightning bolt instead of a box-with-plus, so it's no longer confused with "Browse & add".
- fix(Collection): **Quick-add stepper** — each printing in the quick-add palette uses a − N + stepper, and rapid minus clicks now advance copy by copy instead of erroring.
- fix(Collection): **Session count resets** — the "new this session" count resets when you switch collections instead of carrying over.
- fix(Collection): **Browse & add stays put** — starting "Browse & add" from All Cards stays there with a "→ Inbox" hint instead of teleporting you to the Inbox.
- fix(Collection): **Centered empty message** — the "Browse the card catalog..." message on an empty collection centers when it wraps on narrow screens.
- fix(Decks): **Deck power icon spacing** — power icons on deck zone cards now have a small gap, so multi-power cards are easier to read.
- fix(Decks): **iPhone long-press menu** — long-pressing a deck card on iPhone no longer triggers iOS text selection alongside the printing menu.

## 2026-04-17

### Highlights

- feat(Decks): **Pin a printing per deck row** — right-click to pin a preferred printing so different finishes of a card show as separate entries, and Piltover deck codes round-trip your variant choices.
- feat(Decks): **Drag between zones from overview** — drag cards between zones straight from the deck overview without opening each zone first.
- feat(Decks): **Richer deck overview** — each zone shows its full card list with larger thumbnails grouped by type, plus a KPI strip and separate Energy, Power, and Types charts.
- feat(Cards): **Promo page by language** — the Promo Cards page groups by language first, then by promo type within each.
- fix(Collection): **Select mode clears on switch** — switching collections while in select mode exits select mode and clears the selection instead of carrying invisible selections.
- fix(Collection): **Deleted collection cards visible** — deleting a collection moves its cards into the Inbox visibly instead of having them seem to disappear until reload.
- fix(Cards): **Card link scrolls to card** — clicking a card link scrolls the grid to that card instead of opening the detail pane with the grid at the top.

### Other

- feat(Decks): **No language filter in deck builder** — the deck builder drops the Language filter, since language doesn't matter when picking cards.
- feat(Cards): **Missing-card links to stores** — card names in the missing-cards dialog link straight to the product page on TCGplayer, Cardmarket, or CardTrader.
- fix(Decks): **Stable deck overview order** — deck overview thumbnails no longer jump when you change quantities or drag, since they follow the sidebar's sort order.

## 2026-04-16

### Highlights

- feat(Decks): **Deck dashboard** — opening a deck shows each zone's progress, card previews, and deck-wide stats instead of a blank "pick a zone" page.
- fix(Decks): **Reliable last deck edit** — your last edit before navigating away now saves reliably instead of sometimes being dropped mid-save.
- fix(Collection): **Offline action feedback** — if your connection drops mid-action, it reverts and shows an error toast instead of silently looking like it worked.

### Other

- fix(Decks): **Smoother zones sidebar** — moving over the deck editor's zones sidebar no longer lags, since rows were being rebuilt on each hover.
- fix(Collection): **Empty collection delete** — deleting an empty collection opens the confirm dialog right away instead of silently failing.
- fix(Collection): **Friendly empty collection** — an empty collection shows a "No cards yet" prompt instead of a misleading "server may be unreachable" error.

## 2026-04-15

### Highlights

- feat(App): **Faster loading** — the card browser, collections, and decks load faster when signed in, and public pages load noticeably faster for signed-out visitors.
- feat(Cards): **Distribution on card detail** — the card detail page shows where each printing was distributed (tournaments, prerelease events, etc.) so you know how to find a copy.
- feat(Cards): **Stacked stamps as own printing** — a printing can carry multiple stamps at once, and the stack is treated as its own distinct printing with its own price.
- feat(Cards): **Promos grouped by event** — the Promo Cards page groups by distribution event, so a card given out at several tournaments shows under each one.
- fix(Cards): **Multi-filter card browser** — the card browser no longer errors when you have multiple languages or other filters selected in the URL.
- fix(Cards): **Fast search field** — the card browser search no longer drops or scrambles letters when you type quickly.

### Other

- feat(Cards): **Markdown promo descriptions** — promo type descriptions on the Promo Cards page now render markdown links and basic formatting.
- feat(Cards): **No duplicate language chips** — the active filters bar no longer repeats language chips already shown by the picker above.
- fix(Cards): **Clean filter URLs** — the Owned, Signed, Promo, Banned, and Errata chips now produce clean shareable URLs (like `errata=true`).
- fix(App): **Help page titles** — help article titles now include "OpenRift" in the browser tab even when the title already mentions the name.
- fix(Cards): **Cardmarket headline price** — Cardmarket shows its market average as the headline price with the cheapest listing on the chart, matching TCGplayer.
- fix(Decks): **Screen reader deck menus** — screen readers now announce the per-deck actions menu and the add and remove buttons on each card tile.

## 2026-04-14

### Highlights

- feat(Cards): **Promo page languages** — the Promo Cards page shows all printings, including multiple languages of one card, with a language filter to narrow the view.
- feat(App): **New landing page** — the landing page uses real card art, explains what OpenRift is, and groups sign up, browse, and sign in with three feature blocks.
- fix(Cards): **Working language filter** — the language filter now actually hides printings outside your selected languages and defaults to your preferences.
- fix(Account): **Instant account UI updates** — signing out and changing your display name, email, or account now update the UI immediately instead of needing a refresh.

### Other

- fix(Cards): **Screen reader card detail** — screen readers now announce the card detail close button and which printing is selected.
- fix(Cards): **Top cards load colored** — cards at the top of the page no longer stay gray on first load.
- fix(Cards): **No foil flash when off** — the foil effect no longer briefly flashes on cards when you've disabled it.

## 2026-04-13

### Highlights

- feat(Cards): **Promo Cards page** — a new page shows all promotional printings grouped by promo type, each type carrying an optional description.
- feat(Collection): **CSV imports** — import collections from RiftMana exports, and Piltover Archive imports now use the Language column so English imports no longer collide with Chinese or French.
- feat(Collection): **Owned cards dimmed** — cards you don't own are dimmed when showing owned counts or in add mode, making collection gaps easy to spot.
- feat(Collection): **Cost to Complete chart** — a new Statistics chart shows what you'd spend to reach 100%, cheapest cards first, so you can see where diminishing returns kick in.
- fix(Collection): **Reliable bulk loading** — collections with many cards added at once no longer risk skipping some when your collection loads.

### Other

- feat(App): **Animated landing counts** — card and printing counts on the landing page animate up from zero as the page loads.
- feat(App): **Privacy-friendly analytics** — search queries, collection actions, and filter usage are tracked with Umami so we can see which features matter most.
- feat(Cards): **Branded card placeholders** — cards without artwork show a branded placeholder image instead of a blank space.
- feat(Collection): **Add-mode minus explained** — clicking minus on a card you already own in add mode explains why it can't be removed and how to manage existing copies.
- feat(Cards): **Sticky active filters** — the active filters bar stays visible as you scroll, so you always see which filters are applied.
- fix(Cards): **Group header labels** — group header labels no longer disappear behind cards when you hover them.

## 2026-04-12

### Highlights

- feat(Collection): **Statistics page** — a new page shows completion, estimated value, domain and rarity breakdowns, and energy/power curves, with completion rows linking to your missing cards.
- feat(Cards): **Owned/Missing filter** — the card browser can show only cards you own or only those you still need.
- feat(Cards): **Rarity colors** — rarities have their own colors throughout the UI wherever rarity appears.
- fix(Collection): **Selecting all printings** — in Cards view, selecting a card stack now selects every printing's copies, not just the displayed one.
- fix(Collection): **Live disposal updates** — disposing or moving cards removes them from the view immediately instead of needing a reload.

### Other

- feat(Cards): **Sets grouped by type** — the Sets page separates main sets from supplemental ones, and the set filter shows main sets first.
- fix(Cards): **Deselect language filter** — the language filter can now be fully deselected to show all languages, matching every other filter.
- fix(Decks): **Deck violation badge on touch** — tapping the deck violation badge now opens the issue list on all devices instead of needing a hover.
- fix(Collection): **Delete after moving cards** — deleting a collection no longer fails when cards had previously been moved or removed from it.
- fix(Collection): **Collection menu width** — the 3-dot menu on collection pages no longer squishes items into a narrow column.
- fix(Cards): **Language-tagged printing rows** — multi-language printing rows are each tagged with their language code (`[EN]`, `[ZH]`, …) instead of labeling some "Standard".
- fix(Cards): **Card fan layering** — the card fan no longer hides behind its own label text or cards in the row below.
- fix(Cards): **English set covers** — set cover images on the Sets page now show English card art instead of Chinese printings.

## 2026-04-11

### Highlights

- fix(Cards): **Card link previews work** — sharing a card page on Telegram, WhatsApp, or Discord now shows the preview, using English art and a clean description instead of leaking unrendered icon shortcodes.

### Other

- fix(Cards): **English default printing** — card detail pages now default to the English printing instead of whichever happens to sort first.

## 2026-04-10

### Highlights

- feat(Cards): **Cardmarket on Chinese printings** — Cardmarket prices now show on Chinese printings (marked with a star, since Cardmarket publishes one price across all languages), and clicking through opens it pre-filtered to your language.
- feat(Cards): **CardTrader for Chinese cards** — Chinese printings now show CardTrader prices and price history, so you can track their value like English ones.
- fix(Cards): **Set page language** — set pages now show cards in your preferred language instead of randomly mixing printings.
- fix(Cards): **Price filter respects marketplace** — filtering by price uses your selected marketplace instead of always TCGplayer, with the slider and badges showing the right currency.

### Other

- feat(App): **Support page commission note** — the Support page explains that buying through TCGplayer or CardTrader links earns a small commission to help fund the site.
- fix(Decks): **Instant deck hover preview** — hovering a card in the deck editor shows the preview instantly, then crisps up once the higher-res image arrives.
- fix(Cards): **Card preview shares image** — sharing a card page on Telegram, WhatsApp, or Discord now shows the card image instead of nothing.
- fix(Decks): **Clean deck-editor drag** — dragging a card in the deck editor no longer shows the hover preview or lets text get selected.
- fix(Cards): **Smoother card scrolling** — scrolling the cards page is smoother, since it no longer makes a separate request for every card in view.

## 2026-04-09

### Highlights

- feat(Decks): **Deck ownership panel** — the deck editor sidebar shows how many cards you own, how many are missing, and the cost to complete, with a missing-cards dialog and copy-to-clipboard shopping list.
- feat(Cards): **Collection mode on the cards page** — a button cycles through owned counts and quick-add controls, and Ctrl+K adds cards straight to your Inbox.
- feat(App): **Server-side rendering** — pages load faster on first visit, navigation is smoother, and the site shows up better in search engines.
- feat(Decks): **Signature card validation** — the deck builder now caps Signatures at 3 and requires they match the Legend's Champion tag.
- feat(App): **Easier-to-find Discord and feedback** — a header Feedback button reaches Discord or opens a GitHub issue, Discord links appear across the app, and the server gets a daily changelog digest and new-printing alerts.
- fix(Cards): **Instant count updates on cards** — adding or removing cards on the cards page updates the count right away instead of after a delay.
- feat(Account): **Reorderable languages** — reorder languages in preferences, and the first one is preferred when choosing which printing to show.

### Other

- feat(Collection): **Delete collections from sidebar** — a three-dot menu deletes a collection and moves its cards to the Inbox automatically.
- feat(Collection): **Shift-click range select** — in select mode, Shift+click picks every card between the first and last one you clicked.
- feat(Decks): **Named proxy PDF files** — proxy downloads use the deck name in the filename (like "fury-aggro-proxies.pdf") instead of a generic one.
- feat(App): **Clearer help pages** — the import/export, collections, deck building, and card detail guides have been rewritten for clarity.
- fix(Decks): **Disabled languages hidden in decks** — the deck overview and deck card browser no longer show cards from languages you've turned off.
- fix(Cards): **Aligned card detail labels** — the Set, Rules, Flavor and other labels now line up consistently on mobile and desktop.
- fix(Cards): **Clean Chinese keyword badges** — keyword badges on Chinese cards no longer show trailing color suffixes or formatting noise.

## 2026-04-08

### Highlights

- feat(Cards): **Dedicated card pages** — every card has its own page at /cards/{name} with full details and a shareable link, visible to search engines with prices and breadcrumbs in Google results.
- feat(Cards): **Browsable set pages** — sets have their own pages at /sets and /sets/{name} showing every card in a responsive image grid instead of a plain list.
- feat(App): **Rich link previews** — sharing a link on social media, Discord, or Slack now shows a preview with title, description, and image.

### Other

- feat(Cards): **Chinese keyword colors and search** — keyword badges on Chinese cards show the right colors, and searching a keyword in any language finds all matching cards.
- feat(App): **Descriptive tab titles** — each page now has a meaningful browser tab title instead of a blank one.
- feat(App): **Help article breadcrumbs** — help articles now show breadcrumb navigation so you know where you are.

## 2026-04-07

### Highlights

- feat(Collection): **Re-import your own exports** — OpenRift CSV exports import back in cleanly, now with a Promo column so promo variants come back unambiguous.
- fix(Collection): **Bulk edits over 500 cards** — deleting or moving more than 500 cards at once works again.

### Other

- feat(Cards): **Search scope hint** — the search placeholder names which fields it checks when you narrow the scope.
- fix(Cards): **Copies count in search bar** — the copies view counts total copies, not unique printings.
- fix(Account): **Working password autofill** — browser password managers fill in your login again.
- fix(Collection): **Visible footer on empty collections** — the footer no longer hides off-screen when a collection is empty.

## 2026-04-06

### Highlights

- feat(Decks): **Official tournament registration PDF** — the registration PDF matches the official Piltover Archive format and lets you fill in your name, Riot ID, and event details first.
- feat(Decks): **Rename and reformat from the deck list** — rename a deck or change its format without opening it.
- feat(Cards): **Errata shown by default** — cards with errata show the corrected text, with the original behind a disclosure.
- fix(Decks): **Correct zones on text import** — importing a header-less text deck puts legends, runes, battlefields, and the first champion in their proper zones.

### Other

- feat(Decks): **Export format guidance** — the export dialog says where each format is used and links to Piltover Archive, TCG Arena, and the Tabletop Simulator mod.
- feat(Decks): **Database-ordered deck zones** — builder and import zones follow the database order, with the import preview grouped by zone.
- feat(Decks): **"Character, Title" name matching** — text import recognizes names like "Sett, The Boss" even when stored under just the title.
- feat(Collection): **Sorted import preview** — preview entries sort by card ID within each match status.
- fix(Decks): **Visible footer on the decks page** — the footer stays on screen even with only a few decks.
- fix(Account): **Disabling all languages sticks** — turning off every language no longer snaps back to English.
- fix(Decks): **Case-insensitive deck sorting** — decks sort alphabetically regardless of capitalization.
- fix(Decks): **Always-visible plus icon** — the grid's plus icon stays visible even at a card's copy limit.
- fix(Collection): **RiftCore special IDs** — RiftCore import recognizes token, rune, and signed card IDs instead of skipping them.

## 2026-04-05

### Highlights

- fix(Decks): **Correct deck export variants** — export uses the proper base variant instead of alt-art versions, and no longer duplicates the chosen champion when importing a deck code.

### Other

- feat(Cards): **Upgraded keyword arrows** — upgraded keyword abilities show the correct arrow shape.
- fix(Decks): **Sticky deck zones sidebar** — the zones sidebar stays in view as you scroll through cards.
- fix(Decks): **Hover preview clears** — the card hover preview no longer sticks after you remove a card.
- fix(Decks): **Deck export on iOS** — export no longer overflows on iOS, and copied text keeps its line breaks.

## 2026-04-02

### Highlights

- feat(Decks): **Three deck import/export formats** — import and export via Deck Code, Text, and TTS, plus printable tournament registration and proxy PDFs from the deck overview.
- feat(Cards): **Search every field by default** — one search checks name, text, keywords, tags, artist, flavor, type, and ID, with an "All" toggle and new f: and ty: shortcuts.
- feat(Decks): **Switch filled deck slots** — a "Switch" button swaps a filled Legend, Champion, or Battlefield without removing it first.

### Other

- feat(Decks): **Deck value on overview tiles** — tiles show the estimated deck value from the cheapest printing.
- feat(Decks): **Compact deck stats panel** — energy and power curves merge into one domain-colored butterfly chart.
- feat(Decks): **Reordered deck zones** — zones run Legend, Champion, Main Deck, then Battlefield and Runes.
- fix(Decks): **Dual-color type counts** — dual-color cards are no longer double-counted in the type breakdown.
- fix(Decks): **Amber for invalid decks** — the editor flags invalid decks in amber instead of gray.
- fix(Decks): **Stable minus button** — the editor's minus button stays put when a card hits its copy limit.
- fix(Decks): **No stray reset-filters bar** — the empty bar no longer appears in forced-type zones like the Legend zone.

## 2026-04-01

### Highlights

- feat(Decks): **Proxy PDF export** — print any deck as proxies with card images or text placeholders, plus optional cut lines and a watermark.
- feat(Decks): **Visual deck overview** — the overview shows a card grid with legend and champion art, domain icons, a type breakdown, and validity badges.

### Other

- feat(Cards): **Sort and group direction toggle** — an arrow by each section header in the sort/group popover flips its direction.
- feat(App): **Snappier buttons** — buttons get a subtle press effect and sharper tooltip key hints.
- fix(Decks): **Rune replacement keeps 12** — removing a rune adds one from the other domain so the total stays at 12.
- fix(Decks): **Group-by works in the builder** — the builder respects your group-by setting instead of always grouping by set.

## 2026-03-31

### Highlights

- feat(Decks): **Guided deck building** — build a deck step by step with full browser integration, drag and drop between zones (Shift to move all), and Piltover Archive deck codes for import/export.
- feat(Decks): **Live deck stats** — a panel shows domain distribution plus energy, power, and card-type curves with stacked main/sideboard bars.
- feat(Decks): **Deck list at a glance** — each deck shows its domain colors, card count, and Standard validity.

### Other

- feat(Decks): **Rename from the editor** — click a deck's name in the editor to rename it.
- feat(Decks): **Banned card overlay** — banned cards show a large diagonal "BANNED" overlay across the image.
- fix(Cards): **No duplicate cards across groups** — a card no longer appears in multiple set or rarity groups.
- fix(App): **Clean help article text** — apostrophes and dashes no longer show as garbled characters.

## 2026-03-30

### Highlights

- feat(Cards): **Multi-language printings** — see English, French, and Chinese printings, with your preferences picking which appear (English only by default).
- feat(Collection): **Full collection search and filters** — search and filter collections by name, type, rarity, and more without add mode, plus CSV export of any collection.
- feat(Cards): **Group cards your way** — group by set, type, supertype, domain, rarity, or art variant from a new Sort & Group popover.
- feat(Collection): **Collection market value** — each collection shows its total value for your preferred platform and flags unpriced cards.
- feat(Collection): **Drag and drop to collections** — drag cards onto a sidebar collection to move them, with multi-select supported.
- feat(Cards): **Banned card badges** — banned cards show a red "Banned" badge in the grid and a reason banner in detail.

### Other

- feat(App): **Active page highlight** — the nav menu highlights the page you're on.
- feat(Cards): **"None" stat filters** — energy, might, and power filters gain a "None" option for cards without that stat.
- feat(Collection): **Jump to a filtered collection** — clicking a collection in the "In your collections" popover opens it filtered to that card.
- feat(Collection): **Tappable mobile collection title** — on mobile the sidebar opens from a tappable title instead of a separate icon.
- feat(App): **Beta badge** — a "Beta" badge by the logo flags this as an early release.
- feat(Collection): **Detailed import preview** — each preview row expands to show all parsed CSV fields before you import.
- feat(Collection): **Undo in the quick add palette** — the quick add palette (⌘K) lets you undo a mistaken add via a minus button or Shift+Enter.
- feat(Collection): **Open cards from Activity** — clicking a card on Activity opens it with full details.
- feat(Collection): **Cleaner selection** — checkboxes stay hidden until you click "Select" or Ctrl+click a card.
- feat(Collection): **Dimmed unowned cards** — unowned cards dim in add mode so you can spot what you already have.
- feat(Cards): **Foil sparkle icon** — foil cards show a sparkle by the rarity badge even with the foil effect off.
- fix(Cards): **Set filter scoping** — filtering by set no longer leaks other-set variants into the fan, prices, and detail pane.
- fix(Cards): **Total owned count** — the owned badge shows the total across all printings, not just the shown variant.
- fix(Cards): **Name and price aren't clickable** — only the image selects the card now, not the name or price below it.
- fix(Cards): **Consistent owned count placement** — the owned count sits above every card instead of in a corner.
- fix(Collection): **Reliable rapid add** — rapid add clicks are all tracked and shown in the session panel.
- fix(Cards): **No flickering set header** — the set header pill no longer flashes when you jump to a section.
- fix(Cards): **Aligned detail pane** — clicking a card scrolls its row to the top so the detail pane lines up.

## 2026-03-29

### Highlights

- feat(Collection): **Import collections from other apps** — bring in your collection from Piltover Archive or RiftCore via CSV, previewing matches and resolving ambiguous printings.
- feat(Collection): **Activity timeline** — a new Activity page shows everything you've added, removed, or moved, grouped by day and filterable by action, collection, or date range.
- fix(Account): **Login without a refresh** — protected pages like Profile open right after signing in, no reload needed.

### Other

- fix(Collection): **Clearer sidebar selection** — active and hovered sidebar items are easier to tell apart.
- fix(Cards): **Stable alt art order** — alt art printings of a card keep a consistent order.
- fix(Cards): **Consistent price and rarity sorting** — price-descending puts the priciest printing first with unpriced last, and rarity sorting keeps a steady card-ID order.
- fix(Collection): **Browse & add from all-cards** — the button now opens your inbox from the all-cards view instead of doing nothing.
- fix(Collection): **Quick add keeps its search** — the quick add input no longer clears after the first add to an empty collection.

## 2026-03-28

### Highlights

- feat(Collection): **Inline browse & add** — open the full card browser inside the collection page, sidebar still showing which collection you're adding to.
- feat(Collection): **Quick-add palette** — press ⌘K in any collection to find a card by name and add it without leaving the page.

### Other

- feat(Cards): **Bring stacked variants forward** — clicking a stacked variant swaps it to the front of the stack.
- fix(Collection): **Owned count in add mode** — now shows for every card, not just ones with multiple printings.
- fix(Cards): **Only the image is clickable** — clicking above or below a card in add mode no longer opens the detail pane by accident.

## 2026-03-27

### Highlights

- feat(Cards): **Choose your marketplaces** — pick which marketplaces show and in what order, the first appearing on grid thumbnails.
- feat(Cards): **Rich placeholders for imageless cards** — cards without images now show a full text stand-in with type, tags, rules, effect, and flavor.

### Other

- fix(App): **Dark theme survives refresh** — signed-in users no longer get bounced back to light theme on reload.
- fix(Cards): **No blank marketplace rows** — preferences stop showing empty rows when stored settings drift out of sync.
- fix(Cards): **European price formatting** — EUR prices show as 1,23 € instead of €1.23.

## 2026-03-26

### Highlights

- feat(App): **Display preferences sync across devices** — theme, card images, rich effects, and visible fields follow you between devices when signed in.

### Other

- feat(Cards): **Power shown as domain icons** — imageless cards show power as repeated domain icons, matching the real card.
- fix(Cards): **Battlefield cards fill the frame** — they no longer appear as squares in the card browser.
- fix(Cards): **Keyword bracket icons** — icons inside keyword brackets like Equip costs now render instead of raw text.
- fix(Cards): **Swipe only on the image** — swiping between cards on mobile works on the image, not the whole detail pane.

## 2026-03-24

### Highlights

- feat(App): **Database size on the landing page** — the landing page shows how many cards and printings are in the database.

## 2026-03-23

### Highlights

- feat(Cards): **CardTrader prices** — CardTrader prices now appear alongside TCGPlayer and Cardmarket on card detail pages.

## 2026-03-20

### Other

- fix(Cards): **No false text-mismatch warning** — the "printed text differs" warning stays hidden when the text actually matches.

## 2026-03-16

### Highlights

- feat(Cards): **Faster price loading** — price data loads quicker thanks to browser caching.

### Other

- fix(App): **Themed not-found page** — unknown URLs now show a styled "not found" page instead of a blank one.

## 2026-03-13

### Highlights

- feat(App): **Friendly route error page** — route errors now show a helpful fallback instead of a blank screen.

## 2026-03-11

### Other

- fix(App): **Open the logo in a new tab** — middle-clicking or ctrl-clicking the logo opens the home page in a new tab, like other nav links.

## 2026-03-10

### Highlights

- feat(App): **Landing page** — OpenRift now has a landing page at / with sign-in and a quick link to browse cards (plus a hidden easter egg).
- fix(App): **Automatic updates** — updates now install on their own, fixing a crash loop where stale cached code hid the update prompt.

## 2026-03-09

### Other

- feat(App): **Legal and privacy pages** — legal notice and privacy policy pages are now reachable from the footer.
- fix(Cards): **Consistent card heights** — cards render at the same height across browsers, fixing a Safari and WebKit layout issue.

## 2026-03-08

### Highlights

- feat(App): **Streamlined menu and settings** — the profile menu now holds dark mode, what's new, and updates, and card display settings live in the card browser.
- feat(App): **Easier-to-find updates** — an "Update" badge marks "What's new", and you can check for updates inside the changelog panel.
- feat(App): **Sticky changelog dates** — date headers stick as you scroll with relative labels like "Today" or "3 days ago".

### Other

- fix(App): **Faster scrollbar fade** — the scrollbar fades out sooner on desktop after you stop scrolling.
- fix(App): **Update dot stays put** — the blue update dot no longer vanishes when you dismiss the update notification.
- fix(Cards): **Smoother grid scrolling** — scrolling up no longer stutters after jumping to a distant position.

## 2026-03-07

### Other

- feat(Cards): **Foil shimmer on stacks** — stacked cards in the grid now show a foil shimmer effect.
- fix(Cards): **Fanned sibling clicks** — clicking a fanned sibling card now opens its detail pane correctly.
- fix(Cards): **Selected card stays in view** — it no longer scrolls off when the grid resizes as the detail pane opens.

## 2026-03-06

### Other

- feat(Cards): **Mobile controls in the filter drawer** — sort, view, and column controls move into the filter drawer on mobile.
- fix(Account): **Google sign-in redirect** — signing in with Google no longer lands on a "Not Found" page on the way back.
- fix(Account): **Email carries to password reset** — the email you typed follows you to "Forgot your password?" and back.
- fix(Account): **Signup with a slow mail server** — signing up no longer hangs when the mail server is slow to respond.

## 2026-03-05

### Other

- feat(Cards): **Cardmarket price badge** — Cardmarket prices now show as a badge in the detail view and version list.
- feat(Account): **Playful reset placeholder** — the reset password page shows a random funny email placeholder.
- fix(Account): **Resend verification for unverified emails** — signing up again with an unverified email re-sends the verification code.

## 2026-03-04

### Highlights

- feat(Cards): **Price history charts** — see how a card's price has changed over time, with a trend sparkline in the detail sidebar.

### Other

- fix(Cards): **Distinct price-range colors** — each end of the price range gets its own color in stacked view.

## 2026-03-03

### Highlights

- feat(Cards): **Stacked printings view** — the browser groups printings of one card into a single tile with a price range, plus a "Printings" view for every version.
- feat(Cards): **Cardmarket prices and daily refresh** — Cardmarket prices appear alongside TCGplayer, with all prices refreshing daily.
- feat(Cards): **Versions section on card detail** — switch between finishes, art variants, and other versions, with a note when the printed text differs.
- feat(Account): **Sign in with Google or Discord** — sign in with Google or Discord, and link or unlink them from your profile.
- feat(Account): **Account and profile management** — change your email, password, or delete your account, with email and password resets handled by a secure 6-digit code.
- feat(Account): **Gravatar profile picture** — your Gravatar now appears in the header and on the profile page.
- feat(Cards): **Signed and Promo filters** — filter cards by Signed and Promo status with three-state toggles.

### Other

- fix(Cards): **Sensible minimum columns** — the column stepper won't shrink to absurdly few columns, scaling its minimum to your screen.
- fix(Cards): **Clear load-failure message** — the grid now shows "Couldn't load cards" with a retry button instead of "No cards found".
- fix(Cards): **No bare filter headings** — empty filter sections stay hidden when no cards are loaded.

## 2026-03-02

### Highlights

- feat(Account): **Email verification on signup** — new accounts must verify their email before signing in, keeping fake signups out.
- feat(Account): **Redesigned login and signup** — the login and signup pages get a fresh look with inline form validation.

### Other

- fix(Cards): **Closing detail deselects** — closing the detail panel now clears the selection instead of leaving the card highlighted.
- fix(Cards): **Variant filter accuracy** — filtering by a variant no longer shows cards that have no variant.
- fix(Cards): **Prices near $10k fit** — prices near the $10k boundary no longer overflow their space.
- fix(Cards): **Smoother sticky set header** — the sticky set header no longer stutters while scrolling.

## 2026-02-28

### Other

- fix(Cards): **Foil tilt toggle on mobile** — tapping a foil card now turns the tilt effect back off instead of staying stuck on.
- fix(Cards): **Scrollbar drag off-screen** — sliding past the screen edge now ends the drag cleanly instead of freezing on a wrong card number.
- fix(Cards): **Scrollbar handle text wrapping** — the handle label no longer breaks onto multiple lines while dragging on mobile.

## 2026-02-26

### Highlights

- feat(Account): **Email sign-up and sign-in** — create an email and password account and manage it on a profile page where you can change your display name.

### Other

- fix(App): **Browser back and forward** — moving between pages with the browser buttons now lands where you expect.

## 2026-02-25

### Highlights

- feat(Cards): **Persistent filter sidebar** — on wide screens (1600px+) filters live in an always-visible sidebar instead of a panel.
- feat(Cards): **Database-backed card data** — cards are now served from a real database instead of static files, with no loss in speed.

### Other

- feat(App): **Wider ultrawide layout** — new breakpoints let the grid use more of the screen on ultrawide monitors.
- feat(Cards): **Sharper scroll indicator** — the scroll indicator grows while you drag and snaps more precisely to set boundaries.
- fix(App): **Smoother drawer closing** — drawers now slide shut when you tap outside or release a half-swipe instead of vanishing instantly.
- fix(Cards): **Steady grid layout** — the grid no longer jumps when a sticky set header appears or the window is resized.
- fix(App): **Full-width header and footer** — the header and footer now stretch to match the content width on wide screens.
- fix(Cards): **Stable scroll indicator** — the scroll indicator no longer drifts, resizes, or disappears during and after dragging.

## 2026-02-24

### Highlights

- feat(Cards): **Color-coded prices** — prices are tinted by value (grey for bulk, green for $1 to $10, amber for $10 to $50, rose for $50+) and always show normal or foil.
- feat(Cards): **Redesigned card detail** — a fresh layout with distinct panels for descriptions and effects (tinted in the card's domain color), inline keyword styling, and compact pricing chips.
- feat(Cards): **Tap to toggle foil** — tap the card image in the detail view to switch the holographic foil effect on or off.

### Other

- feat(Cards): **Always-on scroll indicator** — the scroll indicator is always draggable, with smart positioning so it avoids overlapping other elements.
- feat(Cards): **Right-sized thumbnails** — thumbnails load at the resolution that fits their display size, saving bandwidth on smaller screens.
- fix(Cards): **Prices fit small cards** — prices no longer overflow tight spaces, using a compact format like $25 or $1.2k.
- fix(Cards): **Tidy card info row** — compact view shows IDs as #001, with ID, type, and rarity on one icon-only row so nothing gets clipped.
- fix(Cards): **Column zoom reset** — tapping the column number resets to auto, and stepping from auto snaps to the next size.
- fix(App): **Re-showing dismissed updates** — checking for updates after dismissing now re-shows it instead of claiming you're on the latest.
- fix(Cards): **Keyword tap closes detail** — tapping a keyword or tag now closes the pane on mobile so you can see the filtered results.
- fix(Cards): **Correct mobile columns** — the grid matches your screen the moment it opens instead of briefly showing 4 columns.
- fix(Cards): **iOS tilt toggle stays** — the tilt toggle on iOS no longer disappears after you deny gyroscope permission.
- fix(Cards): **No empty description box** — cards without a description no longer show an empty text box in the detail view.
- fix(Cards): **Subtler card tilt** — the 3D tilt effect on cards is now gentler and less exaggerated.
- fix(Cards): **Floating set header pills** — sticky set headers now appear as compact floating pills instead of stretching full width.

## 2026-02-23

### Highlights

- feat(Cards): **Holographic foil cards** — cards shimmer with a holographic foil effect on hover or phone tilt, and TCGPlayer prices now show on cards.
- feat(Cards): **Browse cards by swipe and arrow keys** — swipe on mobile or use arrow keys to step between cards without closing the detail view.
- feat(Cards): **Quick-jump scroll indicator** — a draggable scroll indicator lets you jump between sets, opt-in via settings.

### Other

- feat(Cards): **Cards-per-row in the filter bar** — set cards-per-row next to sort, pinch to zoom on mobile, or set the maximum from settings.
- feat(App): **Swipe-to-dismiss panels** — mobile filter and changelog panels can now be swiped away.
- feat(App): **Toast update notifications** — update and offline notifications now appear as toasts, and the settings menu shows when an update is available.
- fix(Cards): **Detail pane clears headers** — the card detail pane no longer hides behind sticky set headers.

## 2026-02-21

### Highlights

- feat(App): **Works offline and installable** — the app works offline and can be installed to your home screen.
- feat(Cards): **Grouped by set** — cards are grouped by set with the name staying visible as you scroll, and tapping a header jumps to that set's start.

### Other

- feat(App): **What's new panel** — a "What's new" panel shows recent changes, and the menu shows the current build version.
- feat(Cards): **Jump to next set** — a bottom overlay lets you jump to the next set section.
- feat(App): **Tap logo to scroll up** — tapping the header logo scrolls back to the top.
- feat(App): **Slogan in mobile header** — a short slogan now shows in the header on mobile.
- feat(Cards): **Mobile display settings** — display settings are gathered in one place, with filters sliding up for easier one-handed reach.
- feat(Cards): **Clearer active filters** — active filters stand out with icons, and you can flip the sort order with a toggle.
- feat(Cards): **Show or hide card fields** — each card can show or hide its ID, title, type, and rarity.
- feat(Cards): **Filter by Signed variant** — you can now filter for the Signed card variant.
- fix(Cards): **No accidental filter deselect** — tapping a filter quickly no longer accidentally turns it off.

## 2026-02-20

### Highlights

- feat(Cards): **Card detail sidebar** — tap any card to open its details, with real images (toggle to landscape) plus rarity, type, and domain icons in domain colors.
- feat(Cards): **Search and filter cards** — search across name, type, and text with scope chips, and filter by version (Normal, Alt Art, Overnumbered) or ID.

### Other

- feat(Cards): **Inline card count** — the card count now shows right in the filter bar.
- feat(App): **Settings menu** — a settings menu gives you dark mode and filter controls.
- feat(Cards): **Default sort by ID** — cards are sorted by ID by default.
- feat(Cards): **Official Riftbound data** — the app uses official Riftbound card data, with domain colors matching the official icons including multi-domain cards.
