# Vault — notes for AI assistants working in this repo

Read this first, then `docs/VAULT_DESIGN.md`, then `docs/ROADMAP.md`.

## What this is (v1.0)
**Fantasy football for your habits.** League-first: friends start a league, vote on the loser's consequence in the lobby, split 10 chips a day across 1–3 habits, prove each habit daily (live photo challenge). Proved = chips safe, missed or voted fake = chips lost. Fewest chips at the end does the consequence (ties all do it; if everyone ties, nobody does). No real money, ever. Solo mode (Today tab, labelled Solo) is the original bet-on-yourself tracker in `settings.simple` mode: a miss just loses the stake. Nav is League / Solo / Settings; Vault, Ledger, Learn and the bot demo still exist as routes but are hidden.

New users get a 5-step setup flow first (`welcome()` in app.js: name → up to 3 goals → friends/solo/both → easy/steady/all in → personal plan). Answers live in `state.settings.profile` and drive `Content.suggestionsFor()` (league goal helper, solo bet prefill, consequence tier). Everyone answers it first (invite links too) until `settings.profile` is set or `settings.setupSkipped`; Settings → Redo setup. Then the cinematic intro (`playIntro()`, Blender video in `assets/hero/`, once per browser session) plays and fades into the League home, which always starts with the still hero (`heroStill()`, the video's last frame) — signed-in users see their leagues below it. Returning users get intro → hero on open.

### Original concept
A bet-on-yourself accountability web app. Set a goal, stake credits, prove it
before the deadline, keep the credits. Miss it and the stake is **locked in a
Vault, not lost**: three chances to earn it back with a measurably harder
challenge; after 30 days it decays to a destination the user chose. **We never
keep forfeited money.** Phase 0 (current) is play credits only, no backend.

The original build prompt with competitor research is `docs/BET_ON_YOURSELF_PROMPT.md`.

## Live site
https://artemiojarredmartin-ship-it.github.io/vault/ (GitHub Pages from `main`; pushing to main deploys). `#prove` is the one-tap proof page used by the phone lock-screen shortcut.

## Commands
```bash
npm test                        # node --test, covers js/core.js
python3 -m http.server 8765     # serve; open http://localhost:8765
```
No build step. No dependencies. Plain HTML/CSS/JS, ES2020, no modules in the
browser (scripts attach globals: Core, Storage, Camera, Feedback, Content).

## Architecture
| File | Role |
|---|---|
| `js/core.js` | **All rules.** Pure functions over a plain state object. Every time-based function takes `now` (ms). Works in node and browser. If you change a rule, change it here and add a test. |
| `js/app.js` | UI. One `state`, `render()` rebuilds the active tab from scratch; event delegation on `document`. Sheets (prove / earn-it-back) render into `#sheet-root`. Countdowns update via `data-countdown` without re-rendering. |
| `js/storage.js` | localStorage key `vault.v1`; IndexedDB `vault-media` for proof photos. Import refuses files that fail `Core.checkInvariants`. |
| `js/camera.js` | `getUserMedia` capture, stamps proof code + time, downscales to ≤640px JPEG. |
| `js/feedback.js` | Gibb supportive-vs-defensive language helper (from the Checkpoint prototype). Not wired into the Vault UI yet; intended for partner messages in Phase 1. |
| `js/content.js` | Learn content, prompts, decay destinations. |
| `js/league.js` | League demo rules (fantasy-style habit league vs 5 bot friends): round-robin matchups, scoring (+10 proof, +2/day streak capped at +10, −5 miss, −20 voted fake), sus votes, punishment tiers + vetted custom ones, finale + one veto. Pure, takes `rand`. Stored under localStorage `vault.league.demo.v1`; never touches credits. UI lives in app.js (`league()`). Tests in `tests/league.test.js`. |
| `js/cloud.js` | Real leagues via Supabase (project `yqkzpiobjjvgxakggjee`). Guest (anonymous) sign-in + name, create/join by invite code (`#join=CODE`), proofs with photos (private `proofs` bucket), sus votes, reactions, chat, punishment votes, realtime feed. The publishable key in this file is public by design; Row Level Security in `supabase/leagues.sql` does the protecting. `League.fromCloud` turns rows into scores (misses are derived, no cron). |
| `supabase/leagues.sql` | Database schema + RLS + RPCs (create/join/start league, set_result/use_veto/mark_served). Helpers live in the `private` schema. Apply changes through the Supabase connector, then copy them here. |
| `sw.js` + `manifest.webmanifest` | Installable app + offline. Network-first service worker; bump `VERSION` there together with the `?v=` tags in index.html. Manifest shortcut "Prove it now" → `#prove`. |
| `tests/core.test.js` | 22 tests incl. a 300-step random fuzz on the money invariant. |

## Invariants (tests assert these; keep them true)
- `wallet + atStake + inVault + decayed == granted` at all times (`Core.checkInvariants`).
- A redemption must be harder on ≥1 dimension (`Core.harderBy`): amount ≥1.5×, window ≤50%, or stricter proof.
- `chancesLeft` never negative; decayed entries can't be redeemed; full redemption success costs no chance.
- `Core.tick` is idempotent.
- Grace: 1 token per 3 consecutive wins, max 3 held; `extendBet` adds 24h once per bet and costs a token.
- Live challenges: photo proof starts with `Core.drawChallenge` (random text from `Content.pickChallenge`, matched to the bet title's category). The photo's `shotAt` must fall inside the 2-minute window (`RULES.CHALLENGE_WINDOW_MS`). Redrawing restarts the window; reopening the sheet keeps the live one (no rerolling for an easy one). Core only checks the window when a challenge exists; the UI always draws one first.
- Leagues: voiding a proof by sus vote needs a majority of the other players AND at least 2 votes (so a 2-player league can't be griefed). Odd player counts: the bye player plays the week's average.
- Rank (`Core.rank`) is cosmetic only: points = bets won + entries fully earned back. It never touches credits.

## Conventions
- Rules in `core.js`, never in `app.js`. UI calls Core and shows the thrown message as a toast (`tryRun`).
- `now()` in app.js includes `settings.clockOffset` (the Settings "time machine"). Never call `Date.now()` directly in Core.
- Escape all user text with `esc()` before putting it in HTML.
- Look (v0.7): dark luxury — matte black, brushed titanium/silver, Inter Tight headings, Three.js hero (`js/hero3d.js`: vault dial + chips, studio light; open with `?tweak` for sliders, paste copied settings into DEFAULTS; pure-CSS chips in `heroHtml()` are the fallback). Classy, never flashy: no odds, jackpots or slot imagery, and copy stays honest (play credits, we never keep money). Bump the `?v=` tags in index.html when CSS/JS change.
- Mobile-first; test at 375px. Dark mode via `prefers-color-scheme`.
- Keep it dependency-free until Phase 1 (Supabase) actually needs otherwise.

## Decisions already made (don't relitigate)
Play money first. We never keep forfeits. Proof tiers gate stake size. Vanilla
JS until Phase 1. Camera-only proof (no gallery uploads); the "camera
unavailable → self-attest" fallback is Phase 0 only and is flagged in the ledger.

## Manual testing recipe
Settings → Load sample data → Today. Place a bet with a "+1 hour" deadline, then
Settings → Time machine → +6 hours to watch it lock; Vault → Earn it back; Time
machine → +31 days to watch decay. Ledger should always say **Balanced**.
