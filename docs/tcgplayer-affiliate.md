# TCGplayer Affiliate Program via Impact.com

## Status (2026-02-25)

- Partnership active — tracking links available and working
- **Vanity link:** `https://partner.tcgplayer.com/NGKP0P`
- **Tracking URL:** `partner.tcgplayer.com/c/7018965/1780961/21018`
- Deep linking works via `?u=<encoded product URL>` parameter
- Integrated into `apps/web/src/lib/affiliate.ts` — all price links route through the vanity link
- Impact.com marketplace application separately declined (reason: `RTAS_STDS_NOT_MET`), but this does not affect the direct brand partnership

## Offer Details

- **Start date:** Feb 25, 2026 09:00 CET
- **Base commission:** 3.5% of order sale amount (USD)
- **Bonus tiers (monthly performance bonus):**
  - Tier 1: $10,000–$49,999 revenue → 4% of sale amount
  - Tier 2: $50,000+ revenue → 4.5% of sale amount
- **Action locking:** 27 days after end of the month actions are tracked
- **Payout:** scheduled after locking period (~2 month delay)

## Partner Categories (TCGplayer definitions)

- **Creator:** Produces content for TCG enthusiasts (blog, YouTube, Twitch, podcast) covering news, strategies, set releases, etc.
- **Tool:** Websites/apps providing a service to TCG enthusiasts (deckbuilding, collection trackers). Any affiliate not classified as a Creator is a Tool. **OpenRift falls under this category.**

## Marketplace Decline Details

The Impact.com *marketplace* application (separate from the TCGplayer brand deal) was declined for:

- `iraccount.rejectionreason_type.RTAS_STDS_NOT_MET` — Referral Traffic and Standards Not Met
- Missing verified media properties on Impact.com profile
- Possible VPN flag during signup

## Action Items

- [x] ~~Submit support ticket to Impact.com~~ (resolved — links now available)
- [ ] Add and verify OpenRift website URL as a media property on Impact.com profile
- [x] ~~Confirm TCGplayer partnership activation and obtain tracking links~~
- [x] ~~Update `apps/web/src/lib/affiliate.ts` with the real tracking URL~~
