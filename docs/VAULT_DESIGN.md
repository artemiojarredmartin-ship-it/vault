# Vault — Phase 0 design

Phase 0 is the whole bet → prove → vault → redeem loop, in the browser, with
play money ("credits"). No accounts, no backend, no real money. If this loop
isn't fun and fair with credits, real money won't fix it.

## Screens

| Tab | Purpose |
|---|---|
| **Today** | Balances (wallet, at stake, in vault), active bets with countdowns and *Prove it*, vault entries that can still be redeemed, daily prompt. |
| **Bets** | Place a bet (title, stake, deadline, proof tier, decay destination, measure), list of all bets by status. Cancel within the cooling-off window. |
| **Vault** | Every locked entry: amount, countdown to decay, chances left, destination. Redemption builder, active redemption with *Prove it*, "what got in the way" note. |
| **Ledger** | Every credit movement, running balance, and a live invariant check. |
| **Learn** | Why the Vault exists: loss aversion, commitment devices, supportive climate. |
| **Settings** | Name, export/import JSON, sample data, reset, real-money flag (disabled until Phase 2). |

## State machine

```
Bet
  active ──(proof accepted before deadline)──▶ won        stake → wallet
  active ──(cancel within 10 min)────────────▶ cancelled  stake → wallet
  active ──(deadline passes, tick)───────────▶ locked     stake → VaultEntry

VaultEntry
  locked ──(redemption full success)─────────▶ redeemed   amount → wallet
  locked ──(redemption partial success)──────▶ locked     part → wallet, chancesLeft−1
  locked ──(redemption failed / expired)─────▶ locked     chancesLeft−1
  locked ──(decaysAt passes, tick)───────────▶ decayed    amount → destination (never us)

Redemption
  active ──(proof, fraction = 1)─────────────▶ succeeded
  active ──(proof, 0 < fraction < 1)─────────▶ partial
  active ──(proof, fraction = 0 | deadline)──▶ failed
```

`Core.tick(state, now)` applies every time-based transition. It is pure and
idempotent; the UI calls it on load, on every render, and every 30 seconds.

## Rules

- **Stake limits by proof tier** (credits): Tier 0 honor = 10, Tier 1 live photo = 50, Tier 2 partner = 200, Tier 3 integration = 1000. Phase 0 offers tiers 0 and 1.
- **Cooling-off**: a bet can be cancelled for a full refund within 10 minutes of placing it. After that it's live.
- **Vault decay**: 30 days from the moment of locking. The user picked the destination when placing the bet.
- **Chances**: 3 per vault entry. A failed or partial redemption burns one. A full success closes the entry.
- **Harder rule**: a redemption must beat the original bet on at least one dimension, computed by `Core.harderBy()`:
  - `quantity`/`duration`: measure amount ≥ 1.5× the original (binary bets count as amount 1, so "do it twice" qualifies).
  - `deadline`: the redemption window ≤ 50% of the original bet's window.
  - `proof`: a higher proof tier than the original.
- **Partial unlock**: for measured redemptions the user reports how much they did; unlocked = round(amount × min(1, done/target)). The remainder stays locked.
- **Money invariant**: `wallet + atStake + inVault + decayed == starting credits + grants`. `Core.checkInvariants()` returns a list of violations; the Ledger tab shows it live; tests assert it after every operation.

## Proof (Phase 0)

- Tier 0: a checkbox and an optional note. Self-report.
- Tier 1: in-app camera only (`getUserMedia`), no gallery upload. The capture UI overlays the bet's one-time **proof code** (generated at bet time) and the current time; the user must have the code visible in frame. The frame is downscaled to ≤640px JPEG and stored in IndexedDB keyed by proof id. If the camera is unavailable, the user may self-attest, and the proof is flagged `cameraUnavailable` in the ledger reason. (Phase 1 removes this fallback.)
- Verdict in Phase 0 is automatic on submit. Phase 1 adds partner/peer verdicts; the `Proof.verdict*` fields already exist for that.

## Modules

```
js/core.js      pure logic, works in browser (window.Core) and node (module.exports)
js/storage.js   localStorage (key vault.v1) + IndexedDB for proof media
js/camera.js    getUserMedia capture → dataURL
js/feedback.js  Gibb supportive-language helper (unchanged from Checkpoint)
js/content.js   Learn content, prompts, destinations
js/app.js       state, rendering, events
tests/          node --test
```

## Out of scope for Phase 0 (see ROADMAP)

Accounts, partners as real users, grace tokens, appeals, peer jury,
integrations, real money, notifications.
