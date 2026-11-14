# Roadmap

## Phase 0 — local loop with play credits ✅ (v0.2, Nov 2026)

- [x] Wallet of 100 credits; every movement in a Ledger with a live invariant check
- [x] Place a bet: title, stake, deadline (quick picks + custom), proof tier 0/1, measure, why, decay destination
- [x] 10-minute cooling-off cancel
- [x] Prove it: honor checkbox (tier 0), live in-app camera with stamped proof code (tier 1), IndexedDB photo storage
- [x] Deadline passes → stake locked in Vault (30-day decay, 3 chances)
- [x] Redemption builder with computed "harder by" (amount ×1.5 / window ≤50% / stricter proof)
- [x] Partial unlock proportional to amount done; chances burn on partial/fail/expiry; full success costs nothing
- [x] Decay to the chosen destination (never us)
- [x] "What got in the way?" note on every vault entry
- [x] Stats: win rate, streak, saved-by-proving, recovery rate
- [x] Sample data; Settings time machine for testing; JSON export/import (import refuses unbalanced files)
- [x] Learn tab: loss aversion, commitment devices, the Vault rationale, harder rule, proof tiers, supportive climate, competitors
- [x] 17 node tests incl. 300-step random fuzz; mobile layout; dark mode; GitHub Pages ready

## Phase 0.5 — polish (good next tasks, each ~1 session)

- [ ] Celebration moment on a win (confetti, animated wallet count-up) and a calm "It's in the Vault" moment on a lock
- [ ] Weekly review screen: bets, wins, locks, lessons, recovery
- [ ] Grace tokens: earn 1 per 7-day clean streak, spend to extend a deadline 24h once per bet
- [ ] Goal templates (study, fitness, writing, sleep, screen time) that prefill measure + sensible stake
- [ ] Include proof photos in export/import (base64) or an explicit "export photos" zip
- [ ] Inline SVG chart of wallet / vault balance over time (no library)
- [ ] Browser notifications (opt-in) at T-24h and T-1h
- [ ] Accessibility pass: focus trap in sheets, ARIA for countdowns, reduced-motion
- [ ] Perceptual hash of proof photos to flag reused shots
- [ ] Remove the "camera unavailable → self-attest" fallback once there's a desktop path (e.g., QR hand-off to phone)

## Phase 1 — accounts, partners, real proof

- [ ] Supabase: auth, Postgres mirror of the Core data model, Storage for media, RLS
- [ ] Partner invites by link; partner approve/reject with reason; tier 2 unlocks stakes to 200
- [ ] Appeals: logged, reviewed by partner or a 3-person peer jury of good-reputation users
- [ ] Reputation score (honest self-reports, timely verifications)
- [ ] Partner messages through the supportive-language composer (`js/feedback.js`)
- [ ] Integrations (tier 3): HealthKit/Google Fit, Strava, Screen Time, GitHub, Duolingo

## Phase 2 — real money (feature-flagged)

- [ ] Stripe: authorize at bet start, capture only on decay, pay out to destination via Connect / charity API
- [ ] Transparent service fee shown before staking; subscription for Pro
- [ ] Legal review: not gambling (single player, can't win more than staked, no house edge); terms, refunds, chargebacks
- [ ] Charity partner list with verified payout

## Phase 3 — business

- [ ] Free: 1 active bet, tiers 0–1, credits only. Pro: unlimited, tiers 2–3, real money, pools, analytics
- [ ] Friend pools (decay flows to whoever kept their streak)
- [ ] Coach / classroom mode (one verifier for many users)
- [ ] Landing page with the one-line promise: *We never keep your money.*

## Parked ideas

Ante-up escalation (opt-in, capped) · double-or-nothing redemption · streak
insurance bought in advance · hard mode (no grace, no appeals, higher max) ·
printable weekly report · "climate check" survey for teams.
