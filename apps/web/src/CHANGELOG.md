# Changelog

## 2026-02-28

- fix: Scrollbar drag now ends correctly when your finger slides off the screen edge, instead of getting stuck showing a wrong card number
- fix: Scrollbar handle text no longer wraps to multiple lines on mobile when dragging

## 2026-02-26

- feat: Your profile page shows your account info and lets you update your display name
- feat: You can now sign up and sign in with email and password — your account is ready for upcoming collection features
- feat: Browser back and forward buttons now work correctly between pages

## 2026-02-25

- fix: Drawers now smoothly slide closed when tapping outside or releasing a half-swipe, instead of instantly disappearing
- feat: Filters now show in a persistent sidebar on wide screens (1600px+), so you don't need to open a panel to change them
- feat: The grid now uses more screen space on ultrawide monitors with new wider layout breakpoints
- feat: The scroll indicator grows while dragging and snaps more precisely to set boundaries
- feat: Card data is now served from a real database instead of static files — everything should feel just as fast
- fix: The grid no longer jumps when a sticky set header pill appears or when the window is resized
- fix: The header and footer now stretch to match the content width on wide screens
- fix: The scroll indicator no longer drifts, resizes, or disappears unexpectedly during and after dragging

## 2026-02-24

- fix: Prices no longer burst out of small cards — they now wrap, drop labels when narrow, and use a compact format ($25, $1.2k) to fit tight spaces
- feat: Prices are now color-coded by value — grey for bulk, green for $1–10, amber for $10–50, and rose for $50+
- fix: Card IDs in compact view now show as #001 instead of OGS-001, so they fit without clipping
- fix: Card info below thumbnails no longer gets cut off on narrow columns — the ID, type, and rarity now share a compact row with icons only, and the title gets its own line
- fix: The column zoom control now resets to auto when you tap the number, and stepping from auto snaps to the next size up or down
- feat: Card prices in the grid now always show whether they're normal or foil, even when only one variant exists
- fix: Dismissing the update popup and then checking for updates again now correctly re-shows the update instead of saying you're on the latest version
- feat: Tap the card image in the detail view to toggle the holographic foil effect on or off
- fix: Tapping a keyword or tag in the card detail now closes the detail pane on mobile so you can see the filtered results
- feat: The scroll indicator is now always draggable — no need to enable it in settings
- fix: The card grid no longer shows 4 columns on mobile when first opened — it now matches your screen size immediately
- feat: The scroll indicator now has an accent dot, a glowing ring, and smartly avoids overlapping other elements
- fix: The tilt effect toggle on iOS no longer disappears after denying gyroscope permission
- feat: Card descriptions and effects now sit in distinct styled panels, with effects tinted in the card's domain color
- feat: Pricing is now shown as compact chips at the bottom of the card detail instead of a separate block
- feat: Card thumbnails now load at the right resolution for their display size, saving bandwidth on smaller screens
- fix: Cards without a description no longer show an empty text box in the detail view
- fix: The 3D tilt effect on cards is now subtler and less exaggerated
- feat: Keywords are now styled inline within card descriptions, with reminder text in italics and proper line breaks
- feat: The card detail sidebar has a fresh layout with card-accurate keyword styling and clearer type info
- fix: Sticky set headers now appear as compact floating pills instead of stretching the full width

## 2026-02-23

- feat: Dragging the scroll indicator is now opt-in via "Draggable scroll indicator" in settings
- fix: The scroll indicator drag handle no longer jumps around — it follows your finger directly
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
- fix: A gap that appeared below the header when scrolling is now gone
- fix: Tapping a filter quickly no longer accidentally deselects it
- fix: Filter badges no longer run off the edge on small screens
- fix: App updates now show up faster on iOS
- fix: The "clear all" button stays put while scrolling through active filters

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
- fix: Search scope chips appear directly below the search box on mobile
