# Changelog

## 2026-04-09

- feat: The cards page now has a toggle to show how many copies of each card you own
- feat: Keyword and language fields in the admin translations table now use dropdown selects instead of free-text inputs
- feat: Languages can now be reordered in preferences, and the first language is preferred when choosing which printing to display
- feat: Collections can now be deleted from the sidebar via a three-dot menu, with cards automatically moved to the Inbox
- feat: Shift+click in select mode now selects all cards between the first and last clicked card
- feat: Deck builder now validates Signature cards, enforcing a maximum of 3 total and requiring they match the Legend's Champion tag
- fix: Deck overview and deck card browser no longer show cards from disabled languages
- fix: Card detail labels (Set, Rules, Flavor, etc.) now align consistently on both mobile and desktop

## 2026-04-08

- feat: Card pages can now show prices and breadcrumb trails in Google search results
- feat: Keyword badges on Chinese cards now show the correct colors, and searching for a keyword in any language finds all matching cards
- feat: Each card now has its own dedicated page at /cards/{name} with full details, shareable links, and search engine visibility
- feat: The sets page now shows card images in a responsive grid instead of a plain list
- feat: Card sets now have browsable pages at /sets and /sets/{name} showing all cards in each set
- feat: The card detail pane now has a "View full page" link to open the card's dedicated page
- feat: Every page now has a descriptive browser tab title instead of a blank one
- feat: Sharing links on social media, Discord, or Slack now shows a rich preview with title, description, and image
- feat: Help articles now show breadcrumb navigation for easier orientation

## 2026-04-07

- feat: Collection import now supports re-importing your own OpenRift CSV exports
- feat: CSV exports now include a Promo column so promo variants can be imported back without ambiguity
- feat: Search bar placeholder now shows which fields are being searched when the scope is narrowed (e.g. "Search by name, artist...")
- fix: Search bar in copies view now shows the total number of copies instead of unique printings
- fix: Deleting or moving more than 500 cards at once no longer fails with a validation error
- fix: Password and email inputs now have proper autocomplete attributes, so browser password managers work correctly
- fix: Footer on the collections page is no longer hidden below the viewport when a collection is empty

## 2026-04-06

- feat: Deck registration PDF now matches the official Piltover Archive format, and you can fill in your name, Riot ID, and event details before downloading
- feat: Decks can now be renamed and have their format changed directly from the deck list via the three-dot menu
- feat: Export dialog now shows where each format is used, with links to Piltover Archive, TCG Arena, and the Tabletop Simulator mod
- feat: Cards with errata now show the corrected text by default, with the original printed text available via an expandable disclosure
- feat: Deck zones in the builder and import view are now sorted by the order configured in the database, and the import preview groups cards by zone
- feat: Deck text import now recognizes "Character, Title" names (e.g. "Sett, The Boss") even when the card is stored under just the title
- feat: Collection import preview now sorts entries by card ID within each match status group
- fix: Footer on the decks page is no longer pushed off screen when there are only a few decks
- fix: Disabling all languages on the profile page no longer snaps back to English after a moment
- fix: Decks are now sorted alphabetically regardless of capitalization
- fix: Plus icon in the deck editor card grid is now always visible, even when a card has reached its copy limit
- fix: Importing from RiftCore now correctly recognizes token, rune, and signed card IDs instead of skipping them
- fix: Importing a deck in text format without zone headers now correctly places legends, runes, battlefields, and the first champion into their proper zones instead of putting everything in main

## 2026-04-05

- feat: Upgraded keyword abilities now render with the correct arrow shape on their left edge
- fix: Deck export now uses the correct base card variant instead of sometimes picking alt-art versions
- fix: Importing a deck code no longer duplicates the chosen champion across zones
- fix: Deck zones sidebar no longer scrolls out of view when scrolling through cards in the deck editor
- fix: Card hover preview no longer stays stuck on screen after removing a card from the deck sidebar
- fix: Deck export no longer overflows its container on iOS, and copied text preserves line breaks

## 2026-04-02

- feat: You can now download a printable tournament deck registration sheet PDF from the export dialog
- feat: Deck import and export now support three formats — Deck Code, Text (human-readable list), and TTS (Tabletop Simulator) — switchable via tabs
- feat: Deck overview tiles now show the estimated deck value based on cheapest available printing
- feat: You can now export proxy PDFs directly from the deck overview without opening the editor
- feat: Deck stats panel is more compact — domain colors are shown as a bar in the header, and energy and power curves are merged into a single butterfly chart
- feat: Deck overview tiles now show a domain color bar and type counts at a glance
- feat: Deck zones are now ordered Legend, Champion, Main Deck, then Battlefield and Runes at the bottom
- feat: Power curve and card type charts in deck stats are now colored by domain
- feat: Search now checks all fields by default (name, card text, keywords, tags, artist, flavor text, type, and ID) with an "All" toggle to quickly reset scope
- feat: Flavor text and card type are now searchable fields, with prefix shortcuts f: and ty:
- feat: Cards in the deck builder now show a "Switch" button when the Legend, Champion, or Battlefield slot is already filled, making it easy to swap without removing first
- fix: Dual-color cards are no longer double-counted in the deck stats type breakdown labels
- fix: Deck editor now shows amber for invalid decks instead of gray, matching the deck overview colors
- fix: The minus button in the deck editor card grid no longer jumps position when a card reaches its copy limit
- fix: Empty "reset filters" bar no longer appears in deck zones where the card type is forced (e.g. Legend zone)

## 2026-04-01

- feat: Export any deck as a printable proxy PDF with card images or text placeholders, optional cut lines and watermark
- feat: Buttons now have a subtle press-down effect, and keyboard shortcut hints in tooltips look sharper
- feat: Deck overview now shows a visual card grid with legend and champion art previews, domain icons, card type breakdown, and validity badges
- feat: Sort and group direction can now be toggled with a small arrow icon next to each section header in the sort/group popover
- fix: Removing a rune in the deck builder now correctly adds a replacement from the other domain to keep the total at 12
- fix: Group-by setting in the deck builder now works correctly instead of always grouping by set

## 2026-03-31

- feat: Energy curve in the deck builder now shows domain colors stacked on top of each other so you can see the color distribution at each cost
- feat: Import and export decks using Piltover Archive deck codes — paste a code to import, or copy a code from the deck editor to share
- feat: Deck names can be renamed by clicking the name in the deck editor
- feat: Banned cards in the deck builder now show a large diagonal "BANNED" overlay across the card image
- feat: Build decks with a guided flow — choose a Legend, Champion, Battlefields, and Runes, then fill your main deck and sideboard with full card browser integration
- feat: Deck list shows each deck's domain colors, card count, and Standard validity at a glance
- feat: Live stats panel shows domain distribution, energy curve, power curve, and card type breakdown with stacked main/sideboard bars
- feat: Drag and drop cards between zones — drag one copy by default, hold Shift to move all
- feat: Drag cards from the browser grid directly into deck zones
- fix: Cards view no longer shows the same card multiple times across different set or rarity groups
- fix: Help articles no longer show garbled characters for apostrophes and dashes

## 2026-03-30

- feat: Cards that are banned in a format now show a red "Banned" badge in the grid and a banner with the reason in the detail panel
- feat: The active page is now highlighted in the navigation menu so you can see where you are at a glance
- feat: Cards can now have different language printings (English, French, Chinese) — your preferences control which languages appear in the card browser, defaulting to English only
- feat: Energy, might, and power range filters now have a "None" option so you can find cards without a stat (e.g. spells with no energy cost)
- feat: Cards can now be grouped by set, type, supertype, domain, rarity, art variant, or shown ungrouped — choose from the new Sort & Group popover
- feat: Clicking a collection name in the "In your collections" popover now opens that collection filtered to the card you're viewing
- feat: You can now export any collection (or all cards) as a CSV file from the Import / Export page
- feat: On mobile, the collection sidebar now opens from a tappable title instead of a separate sidebar icon, reducing visual clutter near the menu button
- feat: Drag and drop cards from the grid onto a collection in the sidebar to move them — works with multi-select too
- feat: Each collection now shows its total market value based on your preferred trading platform, with an indicator for cards that don't have price data yet
- feat: The app now shows a "Beta" badge next to the logo so it's clear this is an early release
- feat: Import preview now shows all parsed CSV fields (set, rarity, finish, condition, etc.) in an expandable detail row so you can sanity-check each entry before importing
- feat: Quick add palette (⌘K) now lets you undo cards added by mistake — each printing row shows a minus button, or press Shift+Enter to undo the selected printing
- feat: Quick add palette now always expands to show printings before adding, making the flow consistent for all cards
- feat: Clicking a card in the Activity page opens it in the card browser with full details
- feat: Collections now have full search and filters — find cards by name, type, rarity, and more without entering add mode
- feat: Selection checkboxes are hidden by default and appear when you click "Select" or Ctrl+click a card, keeping the default view clean
- feat: Unowned cards are dimmed in add mode so you can instantly see what you already have
- feat: Foil cards now show a sparkle icon next to the rarity badge in the card grid and detail view, so you can tell them apart even with the foil effect turned off
- fix: Filtering by set no longer shows card variants from other sets in the sibling fan, price ranges, and detail pane
- fix: The owned count badge in cards view now shows the total across all printings of a card, not just the displayed variant
- fix: Clicking the card name or price below the image no longer selects the card — only clicking the image does
- fix: Owned count is now shown consistently above every card instead of as a small badge in the corner
- fix: Rapidly clicking the add button no longer loses count — all clicks are now tracked immediately and show up in the "added this session" panel
- fix: Set header pill no longer briefly shows when jumping to a section
- fix: Clicking a card in the grid now scrolls its row to the top of the screen so the detail pane lines up with the selected card

## 2026-03-29

- feat: Import your collection from Piltover Archive or RiftCore — upload or paste a CSV export, preview matched cards, resolve any ambiguous printings, and import into any collection
- feat: New Activity page in the collection sidebar shows a timeline of every card you've added, removed, or moved — grouped by day with card counts and value summaries
- feat: Filter your activity by action type, collection, or date range (today, 7 days, 30 days)
- fix: Active and hovered items in the collection sidebar are now more visually distinct
- fix: Alt art printings of the same card now sort in a consistent, stable order instead of sometimes appearing shuffled
- fix: Sorting by price descending now shows the most expensive printing in each stack first, and cards without a price always appear at the end
- fix: Sorting by rarity now keeps cards in consistent card-ID order within the same rarity, regardless of sort direction
- fix: "Browse & add" button now navigates to your inbox when used from the all-cards view instead of doing nothing
- fix: Logging in no longer requires a page refresh before navigating to protected pages like Profile
- fix: Quick add search input no longer resets after adding the first card to an empty collection

## 2026-03-28

- feat: "Browse & add" now opens the full card browser inline within the collection page — the sidebar stays visible so you always know which collection you're adding to
- feat: Press ⌘K in any collection to open a quick-add palette — type a card name, pick a printing, and add it without leaving the page
- feat: Clicking a stacked variant in the card grid now swaps it to the front of the stack
- fix: Owned count now shows consistently for all cards in add mode, not just cards with multiple printings
- fix: Clicking above or below a card in add mode no longer accidentally opens the detail pane — only the card image is clickable

## 2026-03-27

- feat: You can now choose which marketplaces to show and in what order — the first one appears on card thumbnails in the grid
- feat: Cards without images now show a full placeholder with card type, tags, rules text, effect text, and flavor text — like a mini text-only version of the real card
- fix: Dark theme no longer resets to light on page refresh for signed-in users
- fix: Marketplace preferences no longer show blank rows when stored settings get out of sync
- fix: EUR prices (Cardmarket, CardTrader) now display as 1,23 € instead of €1.23

## 2026-03-26

- feat: Cards without images now show their power as repeated domain icons, matching the real card layout
- feat: Your display preferences (theme, card images, rich effects, and visible card fields) now sync across devices when you're signed in
- fix: Battlefield cards no longer appear as squares in the card browser — they now fill the full card frame
- fix: Icons inside keyword brackets (like Equip costs) now render correctly instead of showing raw text
- fix: Swiping to navigate between cards on mobile now only works on the card image, not the entire detail pane

## 2026-03-24

- feat: The landing page now shows how many cards and printings are in the database

## 2026-03-23

- feat: Card prices from CardTrader now appear alongside TCGPlayer and Cardmarket on card detail pages

## 2026-03-20

- fix: The "printed text differs" warning no longer appears when the printed text is identical to the canonical text

## 2026-03-19

- feat: Unmatched card sources now show a suggested card link based on name similarity

## 2026-03-17

- feat: Card sources with missing images now show a "missing image" badge in the admin list
- feat: After accepting a new printing, it automatically expands and scrolls into view
- feat: Image previews now start with the first image pre-selected
- feat: Manual printing links now survive when card sources are deleted and re-uploaded
- feat: Card and printing sources can be unchecked in the admin UI
- feat: Source image previews are now shown alongside printing groups in the admin
- feat: Text fields like rules text and flavor text now support multiline editing
- feat: Admin card sources can now be filtered by set, with clickable counts on the sets page
- feat: Empty sets can now be deleted from the sets admin page

## 2026-03-16

- feat: Price data now loads faster thanks to browser caching
- fix: Visiting an unknown URL now shows a themed "not found" page instead of a blank one

## 2026-03-13

- feat: Route errors now show a friendly fallback page instead of a blank screen

## 2026-03-12

- feat: Price mapping cards now show cross-set reprints together, with variant badges (Alt Art, Overnumbered) on each printing and a cleaner product card layout
- feat: Unmatched products in the price mapping admin are now grouped by their marketplace group instead of a flat list

## 2026-03-11

- fix: Middle-clicking or ctrl-clicking the logo now opens the home page in a new tab, like the other nav links

## 2026-03-10

- feat: OpenRift now has a landing page at / with sign-in and a quick link to browse cards
- feat: There's a hidden easter egg on the landing page — see if you can find it
- fix: App updates now install automatically instead of requiring a manual reload — fixes a crash loop on some devices where stale cached code prevented the update prompt from appearing

## 2026-03-09

- feat: Legal notice and privacy policy pages are now available from the footer
- fix: Card heights now render consistently across browsers, fixing a layout issue on Safari and WebKit

## 2026-03-08

- feat: The menu now shows an "Update" badge on "What's new" so you know where to go when the blue dot appears
- feat: Changelog date headers now stick as you scroll, showing relative dates like "Today" or "3 days ago"
- feat: The changelog header scrolls away to give more room for entries
- feat: Check for updates now lives inline in the changelog panel instead of taking up footer space
- feat: Profile menu now includes dark mode, what's new, and update controls — the separate settings gear icon is gone
- feat: Card display settings (show images, rich effects, visible fields) now live in the card browser next to sort and view controls
- fix: The scrollbar now fades out faster on desktop after you stop scrolling
- fix: The blue update dot no longer disappears when dismissing the update notification
- fix: Scrolling up on the card grid no longer stutters after jumping to a distant position

## 2026-03-07

- feat: Stacked cards in the grid now show a foil shimmer effect
- fix: Clicking a fanned sibling card now correctly opens the detail pane
- fix: The selected card stays in view when the grid resizes from the detail pane opening

## 2026-03-06

- feat: Sort, view, and column controls now live inside the filter drawer on mobile for a cleaner layout
- fix: Signing in with Google no longer shows a "Not Found" page on the redirect back
- fix: The email you typed on the login page now carries over when you click "Forgot your password?" or navigate back
- fix: Signing up no longer hangs when the mail server is slow to respond

## 2026-03-05

- feat: Cardmarket prices now show as a badge in the card detail view and version list
- feat: The reset password page now shows a random funny email placeholder
- fix: Signing up with an email that was already registered but not yet verified now correctly re-sends the verification code

## 2026-03-04

- feat: Price history charts show how a card's price has changed over time
- feat: The card detail sidebar now shows a compact price trend sparkline
- fix: Each end of the price range now has its own color in stacked view

## 2026-03-03

- feat: Cardmarket prices now appear alongside TCGplayer prices, with all prices refreshing daily
- feat: Card detail now shows the official card text, with a note when the printed version differs
- feat: Price chips now show a TCGplayer icon instead of a text label
- feat: The card browser now groups printings of the same card into one tile by default, with a price range and fan preview on hover — switch to "Printings" view to see every version individually
- feat: You can now link or unlink Google and Discord accounts from your profile page
- feat: You can now sign in with your Google or Discord account
- feat: You can now filter cards by Signed and Promo status using three-state toggles in the filter panel
- feat: Your Gravatar profile picture now appears in the header and on the profile page
- feat: The card detail view now shows a "Versions" section when a card has multiple printings, letting you switch between finishes, art variants, and other versions
- feat: You can now reset a forgotten password from the login page using a 6-digit email code
- feat: Changing your email on the profile page now uses a secure two-step code verification instead of email links
- feat: The profile page now lets you change your email, update your password, and delete your account
- feat: Profile page has a new card-based layout with separate sections for each setting
- fix: The column stepper no longer lets you shrink to absurdly few columns on wide screens — the minimum now scales with your screen size
- fix: The card grid now shows a "Couldn't load cards" message with a retry button when data fails to load, instead of "No cards found"
- fix: Empty filter sections no longer show bare headings when no cards are loaded
- fix: The column plus/minus buttons no longer start disabled when you first open the page

## 2026-03-02

- feat: New accounts now require email verification before signing in, keeping fake signups out
- feat: The login and signup pages have a fresh design with inline form validation
- fix: Closing the card detail panel now deselects the card instead of leaving it highlighted
- fix: The variant filter no longer shows cards that have no variant when filtering by a specific one
- fix: Prices near the $10k boundary no longer overflow their display space
- fix: The sticky set header no longer caused a rendering stutter while scrolling

## 2026-02-28

- fix: Tapping a foil card on mobile now properly toggles the tilt effect off again instead of getting stuck
- fix: Scrollbar drag now ends correctly when your finger slides off the screen edge, instead of getting stuck showing a wrong card number
- fix: Scrollbar handle text no longer wraps to multiple lines on mobile when dragging

## 2026-02-26

- feat: Your profile page shows your account info and lets you update your display name
- feat: You can now sign up and sign in with email and password — your account is ready for upcoming collection features
- feat: Browser back and forward buttons now work correctly between pages

## 2026-02-25

- feat: Filters now show in a persistent sidebar on wide screens (1600px+), so you don't need to open a panel to change them
- feat: The grid now uses more screen space on ultrawide monitors with new wider layout breakpoints
- feat: The scroll indicator grows while dragging and snaps more precisely to set boundaries
- feat: Card data is now served from a real database instead of static files — everything should feel just as fast
- fix: Drawers now smoothly slide closed when tapping outside or releasing a half-swipe, instead of instantly disappearing
- fix: The grid no longer jumps when a sticky set header pill appears or when the window is resized
- fix: The header and footer now stretch to match the content width on wide screens
- fix: The scroll indicator no longer drifts, resizes, or disappears unexpectedly during and after dragging

## 2026-02-24

- feat: Prices are now color-coded by value — grey for bulk, green for $1–10, amber for $10–50, and rose for $50+
- feat: Card prices in the grid now always show whether they're normal or foil, even when only one variant exists
- feat: Tap the card image in the detail view to toggle the holographic foil effect on or off
- feat: The scroll indicator is now always draggable — no need to enable it in settings
- feat: The scroll indicator now has an accent dot, a glowing ring, and smartly avoids overlapping other elements
- feat: Card descriptions and effects now sit in distinct styled panels, with effects tinted in the card's domain color
- feat: Pricing is now shown as compact chips at the bottom of the card detail instead of a separate block
- feat: Card thumbnails now load at the right resolution for their display size, saving bandwidth on smaller screens
- feat: Keywords are now styled inline within card descriptions, with reminder text in italics and proper line breaks
- feat: The card detail sidebar has a fresh layout with card-accurate keyword styling and clearer type info
- fix: Prices no longer burst out of small cards — they now wrap, drop labels when narrow, and use a compact format ($25, $1.2k) to fit tight spaces
- fix: Card IDs in compact view now show as #001 instead of OGS-001, so they fit without clipping
- fix: Card info below thumbnails no longer gets cut off on narrow columns — the ID, type, and rarity now share a compact row with icons only, and the title gets its own line
- fix: The column zoom control now resets to auto when you tap the number, and stepping from auto snaps to the next size up or down
- fix: Dismissing the update popup and then checking for updates again now correctly re-shows the update instead of saying you're on the latest version
- fix: Tapping a keyword or tag in the card detail now closes the detail pane on mobile so you can see the filtered results
- fix: The card grid no longer shows 4 columns on mobile when first opened — it now matches your screen size immediately
- fix: The tilt effect toggle on iOS no longer disappears after denying gyroscope permission
- fix: Cards without a description no longer show an empty text box in the detail view
- fix: The 3D tilt effect on cards is now subtler and less exaggerated
- fix: Sticky set headers now appear as compact floating pills instead of stretching the full width

## 2026-02-23

- feat: Dragging the scroll indicator is now opt-in via "Draggable scroll indicator" in settings
- feat: Swipe left or right on mobile to browse between cards without closing the detail view
- feat: Arrow keys navigate between cards when one is selected, and the grid scrolls to keep it in view
- feat: Mobile filter and changelog panels now support swipe gestures to dismiss
- feat: Update and offline notifications now appear as toast popups instead of fixed overlays
- feat: Cards shimmer with a holographic foil effect when you hover them on desktop, or tilt your phone in the detail view
- feat: The cards-per-row control now lives in the filter bar next to sort, and you can pinch to zoom on mobile
- feat: You can now set the maximum number of cards per row from the settings menu
- feat: TCGPlayer price data now shows on cards
- feat: A draggable scroll indicator with a ghost badge lets you quickly jump between sets
- feat: The settings menu now shows when an update is available
- fix: The card detail pane no longer hides behind sticky set headers

## 2026-02-21

- feat: The app works offline and can be installed to your home screen
- feat: A "What's new" panel in the settings menu shows recent changes
- feat: A bottom overlay lets you jump to the next set section
- feat: The settings menu now shows the current build version
- feat: Tapping the header logo scrolls back to the top
- feat: A short slogan now shows in the header on mobile
- feat: Display settings are now in one place on mobile
- feat: Active filters show with a distinct background and icons
- feat: You can now flip the sort order with a toggle
- feat: Tapping a set header scrolls back to the start of that set
- feat: Each card can show or hide specific fields — ID, title, type, rarity
- feat: Filters slide up from the bottom on mobile — easier to reach with one hand
- feat: Cards are grouped by set, with the set name staying visible as you scroll
- feat: You can now filter by the Signed card variant
- fix: Tapping a filter quickly no longer accidentally deselects it

## 2026-02-20

- feat: You can filter by card version (Normal, Alt Art, Overnumbered) and search by ID
- feat: Search works across name, type, and card text — scope chips let you choose which fields to search
- feat: The card count shows inline in the filter bar
- feat: Card detail opens as a sidebar — tap any card to see more
- feat: Cards show rarity, type, and domain icons with domain-based coloring
- feat: A settings menu gives you access to dark mode and filter controls
- feat: Cards are sorted by ID by default
- feat: Cards show real images, with a toggle to rotate to landscape
- feat: The app uses official Riftbound card data
- feat: Domain colors match the official icons, including multi-domain cards
