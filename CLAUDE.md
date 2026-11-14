# Vault — notes for AI assistants working in this repo

Read this first, then `docs/VAULT_DESIGN.md`, then `docs/ROADMAP.md`.

## What this is
A bet-on-yourself accountability web app. Set a goal, stake credits, prove it
before the deadline, keep the credits. Miss it and the stake is **locked in a
Vault, not lost**: three chances to earn it back with a measurably harder
challenge; after 30 days it decays to a destination the user chose. **We never
keep forfeited money.** Phase 0 (current) is play credits only, no backend.

The original build prompt with competitor research is `docs/BET_ON_YOURSELF_PROMPT.md`.

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
| `tests/core.test.js` | 19 tests incl. a 300-step random fuzz on the money invariant. |

## Invariants (tests assert these; keep them true)
- `wallet + atStake + inVault + decayed == granted` at all times (`Core.checkInvariants`).
- A redemption must be harder on ≥1 dimension (`Core.harderBy`): amount ≥1.5×, window ≤50%, or stricter proof.
- `chancesLeft` never negative; decayed entries can't be redeemed; full redemption success costs no chance.
- `Core.tick` is idempotent.
- Grace: 1 token per 3 consecutive wins, max 3 held; `extendBet` adds 24h once per bet and costs a token.

## Conventions
- Rules in `core.js`, never in `app.js`. UI calls Core and shows the thrown message as a toast (`tryRun`).
- `now()` in app.js includes `settings.clockOffset` (the Settings "time machine"). Never call `Date.now()` directly in Core.
- Escape all user text with `esc()` before putting it in HTML.
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
