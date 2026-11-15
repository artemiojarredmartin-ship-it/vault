# Vault — bet on yourself

> Set a goal. Stake credits. Prove it. Miss it and the stake is **locked, not
> lost**: earn it back with something harder. **We never keep your money.**

Vault is an open-source accountability app. Most stake-based apps profit when
you fail. Vault doesn't: a missed stake goes into your Vault with three chances
to earn it back by completing a challenge the app verifies is measurably harder.
If you don't, after 30 days it goes to a destination *you* chose when you placed
the bet (a charity, a friend, a pool). Never to us.

**Status: Phase 0.** Play credits, no accounts, no backend. Everything runs in
the browser and is stored there. The goal of Phase 0 is to make the loop fun and
fair before a single real dollar moves.

## The loop

1. **Place a bet** — a goal, a stake (1–50 credits depending on proof), an honest deadline. Cancel within 10 minutes; after that it's live.
2. **Prove it** — honor checkbox for tiny bets, or a live in-app photo with your one-time proof code in frame. Keep your credits.
3. **Miss it** — the stake is locked in the Vault. The app asks what got in the way, then hands you the redemption button.
4. **Earn it back** — build a challenge that's harder by at least one of: amount ×1.5, half the time window, stricter proof. Full success unlocks everything; partial success unlocks a share and uses one of three chances.
5. **Decay** — after 30 days, anything still locked goes to the destination you chose.

Win three in a row and you earn a **grace token**: spend it to push one deadline back 24 hours. Every credit movement is in the Ledger, which shows a live "Balanced" check.

## Try it

**Live:** https://jarvisagimuspicard-hub.github.io/vault/ (installable on your phone; Settings → "Put Vault on your phone" sets up a one-tap lock-screen button).

## Run it

```bash
python3 -m http.server 8765
```
Open <http://localhost:8765>. (Any static server works; double-clicking
`index.html` works too, except the camera needs `localhost` or HTTPS.)

```bash
npm test
```
Runs the rule tests (`node --test`, no dependencies).

Try it fast: **Settings → Load sample data**, then use the **Time machine** in
Settings to jump the clock forward and watch deadlines lock, chances burn, and
entries decay.

## Put it on GitHub Pages

```bash
git remote add origin https://github.com/YOUR-USER/vault.git
git push -u origin main
```
Then **Settings → Pages → Deploy from a branch → `main` / root**. GitHub Pages
is HTTPS, so the camera works there.

## Project layout

```
index.html                 app shell (tabs: Today, Bets, Vault, Ledger, Learn, Settings)
css/style.css              styles, light + dark
js/core.js                 ALL the rules, pure, tested (node + browser)
js/app.js                  UI, rendering, events, sheets
js/storage.js              localStorage + IndexedDB for proof photos
js/camera.js               live photo capture with proof-code stamp
js/content.js              Learn tab, prompts, destinations
js/feedback.js             supportive-language helper for partner messages (Phase 1)
tests/core.test.js         19 tests incl. a random fuzz on the money invariant
docs/VAULT_DESIGN.md       state machine, rules, modules
docs/BET_ON_YOURSELF_PROMPT.md  original brief + competitor research
docs/ROADMAP.md            what's done, what's next
CLAUDE.md                  notes for AI assistants picking this up
```

## Working on it with Claude (or any AI assistant)

Open the repo in Claude Code and say: *"Read CLAUDE.md, docs/VAULT_DESIGN.md
and docs/ROADMAP.md, then implement the next roadmap item."* Rules live in one
pure, tested file, so changes are safe to make.

## Roadmap, briefly

- **Phase 1** — accounts (Supabase), real partner verification, appeals, peer jury, reminders, proof photos in export.
- **Phase 2** — real money behind a flag: Stripe authorization at bet start, captured only on decay, paid straight to the chosen destination. Lawyer review before anyone but the founder uses it.
- **Phase 3** — free vs. Pro tiers, friend pools, coach mode.

See [docs/ROADMAP.md](docs/ROADMAP.md).

## History

This repo started as **Checkpoint**, a supportive-communication accountability
tracker built from a paper on Microsoft's cultural shift (Gibb's defensive vs.
supportive climates). That thinking survives in the Learn tab, the failure
screens, and `js/feedback.js`.

## License

MIT. See [LICENSE](LICENSE).
