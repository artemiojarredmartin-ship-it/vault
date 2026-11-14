# Build prompt: "Vault" — bet on yourself, earn it back

> Copy everything below the line into a fresh Claude Code session in this repo.
> Fill in the two `[YOUR CHOICE]` blanks first. The research section explains
> why each twist exists so you (or Claude) can defend or change it later.

---

## Who you are and what we're building

You are a senior product engineer and I am a solo founder. We are building
**Vault**, a stake-based accountability app: you set a goal, put money on it,
prove you did it, and keep your money. Miss it and the money goes into a
locked **Vault**, where you get a limited number of chances to **earn it back
by doing something harder**. The long-term plan is a real business. The
short-term plan is to nail the core loop with zero real money so the loop is
fun and fair before a single dollar moves.

Work in this repository. It already contains a small vanilla-JS app
(Checkpoint) with goals, check-ins, streak math, localStorage persistence, a
JSON import/export, and a "supportive feedback" language helper. Reuse what
helps (storage layer, date/period logic, the feedback composer for partner
messages), replace what doesn't. Read `docs/DESIGN.md` first.

## What already exists, and where it falls short

Study these before designing; do not copy them.

| App | Model | Weakness we exploit |
|---|---|---|
| **stickK** (2008) | Commitment contract, stake goes to charity or "anti-charity", referee verifies | Dated UX, Trustpilot ~2.1 driven by billing disputes and unanswered support. No way to recover a lost stake. |
| **Beeminder** | Data-driven "bright line" graphs, pledge escalates each derailment, company keeps the money | Great for numeric goals, poor for everything else. The company profits when you fail: a trust problem users feel. |
| **Forfeit** | Set task, stake, deadline; photo proof judged by AI then humans; "hard mode" removes appeals | Proof review was a founder bottleneck; mixed reviews on fairness of AI photo judging; money gone forever on failure. |
| **Habi, Lockin, Stakely, Ante, Oath, Gym Bet, Euzoia** (2025–26 wave) | Variations: friend pots, charity on failure, "earn it back workout by workout" (Gym Bet) | Mostly thin clones. Gym Bet is the only one with an earn-back idea, and it's gym-only. Reviews cite bugs and weak support. |

Four problems show up everywhere:

1. **Perverse incentive.** When the app keeps forfeited money, users suspect strict judging. Trust collapses.
2. **Proof is the weak link.** AI photo checks get gamed (old photos, staged shots) or produce false failures. Manual review doesn't scale.
3. **Loss is final.** One bad day and the money is gone. People quit after their first failure instead of re-engaging.
4. **Billing and support** generate most negative reviews. Surprise charges are the #1 complaint.

## The twists (non-negotiable product principles)

1. **We never keep forfeited money.** Revenue comes from subscriptions and a transparent service fee on stakes, never from failure. Say this on the landing page. It's the trust moat.
2. **The Vault, not the void.** A failed stake is *locked*, not lost. It sits in the user's Vault with a countdown.
3. **Redemption Challenges.** While money is in the Vault, the user can attempt a limited number (default 3) of harder challenges to unlock it. Difficulty is enforced: a redemption must be measurably harder than the original goal (longer duration, higher quantity, tighter deadline, or stricter proof). Partial success unlocks partial money. Each failed attempt burns one chance.
4. **Vault decay with a destination the user chose.** If the countdown (default 30 days) runs out, the locked money goes to a destination the user picked when they placed the bet: a charity, an anti-charity, their accountability partner, or a shared pool with friends. Never us.
5. **Proof is layered and the user picks the layer when betting.** Higher proof tiers unlock higher stakes:
   - Tier 0: Honor (self-report). Max stake small.
   - Tier 1: Live photo/video captured in-app (no gallery uploads), timestamped, with an on-screen one-time code the user must include.
   - Tier 2: Partner verification. A named human approves within a window. Partner sees the proof and taps approve/reject with a reason.
   - Tier 3: Automatic integrations (HealthKit/Google Fit, Strava, Screen Time, GitHub commits, Duolingo, calendar). Highest stakes allowed.
   - AI is a *pre-screen* that flags obvious mismatches for the human, never the judge of record.
6. **Fairness mechanics.** One "grace token" earned per 7-day clean streak, spendable to extend a deadline by 24h once. Appeals exist, are logged, and are reviewed by a partner or peer jury (3 random users with good reputation), not by us.
7. **Supportive climate, not shame.** Every failure screen asks "what got in the way?" and offers a redemption, not a lecture. Partner messages go through the existing feedback composer so partners can't be jerks by accident. Streak counters show *recoveries* as proudly as streaks.
8. **No surprise charges, ever.** The user sees exactly what is at stake, when it locks, where it goes, and can cancel before the start time. Real-money mode is opt-in and off by default.

## Phased plan (build Phase 0 first, fully, before anything else)

### Phase 0 — Local loop with play money (this session)
No accounts, no backend, no real money. Everything in localStorage. Goal: the
loop is fun and the Vault mechanics are tuned.
- Wallet of **Vault Credits** (start with 100). Credits are the stand-in for dollars.
- **Place a bet**: goal, stake, deadline, proof tier (0 or 1 only in Phase 0; Tier 1 = device camera via `getUserMedia`, store a downscaled JPEG in IndexedDB), destination-on-decay (pick from a list), optional partner name.
- **Prove it**: submit proof before the deadline; bet resolves to WON, stake returns.
- **Miss it**: at deadline, bet resolves to LOCKED; stake moves to the Vault with a 30-day countdown and 3 redemption chances.
- **Redemption Challenge**: a builder that forces "harder" by at least one dimension (show the comparison), with its own deadline and proof. Win → unlock full or partial; lose → burn a chance.
- **Vault screen**: every locked entry, countdown, chances left, destination, and a "what got in the way?" note.
- **Dashboard**: active bets, wallet balance, vault balance, recovery rate, longest streak, "money saved by proving it" total.
- **History/ledger**: every credit movement with reason.
- **Settings**: name, export/import JSON, reset, load sample data.
- Keep the Learn tab, re-pointed at why the Vault exists (loss aversion, commitment devices, supportive climate).

### Phase 1 — Accounts, real proof, partners
Supabase (Auth, Postgres, Storage for proof media, Row Level Security) or an equivalent you justify. Partner invites by link; partner approve/reject UI; appeal flow; peer-jury queue; reputation score; push/email reminders at T-24h, T-1h.

### Phase 2 — Real money (behind a feature flag)
Stripe. Default pattern: **authorize at bet start, capture only on decay** (like a hotel hold), so we never hold user funds and never become a money transmitter. Decayed funds go straight to the chosen destination via Stripe Connect or a charity partner API. Service fee shown up front. Before enabling this for anyone but me: a lawyer confirms it isn't gambling (single-player, user can never win more than they staked, no house edge) and reviews terms, refunds, and chargeback handling.

### Phase 3 — Business
Free tier: 1 active bet, Tier 0–1 proof, credits only. Pro: unlimited bets, Tier 2–3, real money, partner pools, analytics. Later: team/classroom plans, API for coaches.

## Data model (Phase 0; design so it maps to Postgres later)

```ts
Wallet      { credits: number }
Bet         { id, title, why, stake, createdAt, startsAt, deadline,
              proofTier: 0|1|2|3, partnerId?, decayDestination,
              status: 'pending'|'active'|'won'|'locked'|'redeemed'|'decayed'|'cancelled',
              proofIds: string[], note? }
Proof       { id, betId, kind: 'self'|'photo'|'video'|'partner'|'integration',
              capturedAt, mediaKey?, code?, verdict?: 'accepted'|'rejected', verdictBy?, reason? }
VaultEntry  { id, betId, amount, lockedAt, decaysAt, chancesLeft, destination,
              status: 'locked'|'redeemed'|'partial'|'decayed', whatGotInTheWay? }
Redemption  { id, vaultEntryId, title, harderBy: ('duration'|'quantity'|'deadline'|'proof')[],
              deadline, proofTier, unlockFraction, status, proofIds }
Ledger      { id, at, delta, balanceAfter, reason, refId }
Partner     { id, name, contact }
Settings    { name, realMoneyEnabled: false }
```

Invariants to enforce in code and tests: credits + vault + active stakes is
constant except via explicit ledger reasons; a Redemption must be harder on at
least one dimension; chancesLeft never goes below 0; a decayed entry can't be
redeemed.

## UX principles
- Placing a bet takes under 30 seconds. Three fields visible, the rest behind "more".
- The deadline moment is a *ritual*: countdown, big "Prove it" button, confetti on win, a calm "It's in the Vault, not gone" on loss with the redemption button right there.
- Show the money. Balances animate. Vault total is visible on every screen.
- Mobile-first; this will be used on a phone at 11:58 pm.
- Dark mode, keyboard accessible, no third-party trackers.

## Anti-cheat (Phase 0 should already think about it)
- Camera only, no gallery picker, for Tier 1. Burn a per-bet one-time code into the capture UI and store it with the proof.
- Timestamps come from the device clock *and* a monotonic counter; flag clock jumps.
- Redemption "harder" is computed, not self-declared.
- Grace tokens are rate-limited and logged.
- Later: perceptual-hash proofs to catch reused photos; EXIF checks; partner reputation.

## Deliverables for this session, in order
1. Read `docs/DESIGN.md`, then write `docs/VAULT_DESIGN.md` with the final Phase 0 spec, screen list, and state machine for Bet → Vault → Redemption. Ask me at most 3 clarifying questions, then proceed.
2. Implement Phase 0 in this repo: plain HTML/CSS/JS, no build step, same conventions as the existing code. Replace the Checkpoint tabs with: Today, Bets, Vault, Ledger, Learn, Settings.
3. Unit tests for the money invariants and the "harder" rule, runnable with `node --test`.
4. Sample data that shows an active bet, a won bet, a locked entry with 2 chances left, and a redeemed entry.
5. Update `README.md`, `docs/ROADMAP.md`, and the landing copy ("We never keep your money").
6. Verify in the browser at mobile width, then commit with a clear message.

Decisions I've already made, don't relitigate: play money first; we never keep forfeits; proof tiers gate stake size; vanilla JS until Phase 1.

Blanks for me to fill: app name = `[YOUR CHOICE]` (working title "Vault"); default decay destination list = `[YOUR CHOICE]` (suggest: Red Cross, a local food bank, "my partner", "friends pool").

---

## Appendix: ideas parked for later (don't build now)
- **Ante-up**: stake grows automatically after a win streak if the user opts in (Beeminder-style escalation, but opt-in and capped).
- **Double-or-nothing redemption**: stake the locked amount again on an even harder challenge for a bonus unlock of a grace token.
- **Streak insurance**: spend credits to buy one skip day in advance (pre-commitment is healthier than appeals).
- **Friend pools**: a group stakes together; vault decay flows to whoever kept their streak (Oath-style, but with the Vault in front of it).
- **Coach mode**: a coach or teacher is the Tier 2 verifier for many users; paid plan.
- **Climate score for partners**: the feedback composer's Gibb analysis becomes a partner reputation signal.
- **"Hard mode"** like Forfeit: no grace tokens, no appeals, higher max stake.
