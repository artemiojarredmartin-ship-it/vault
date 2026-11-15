const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

const { HOUR, DAY, MIN, RULES } = Core;
const T0 = 1_800_000_000_000; // fixed "now"

function fresh() { return Core.blank(); }
function ok(state) { assert.deepEqual(Core.checkInvariants(state), [], 'invariants'); }
function bet(state, over = {}, now = T0) {
  return Core.placeBet(state, Object.assign({
    title: 'Run 5k', stake: 10, deadline: now + 24 * HOUR, proofTier: 1,
    destination: 'Food bank', measure: { kind: 'quantity', amount: 5, unit: 'km' }
  }, over), now);
}

test('starting state is consistent', () => {
  const s = fresh();
  assert.equal(s.wallet.credits, RULES.STARTING_CREDITS);
  ok(s);
});

test('placing a bet moves credits from wallet to at-stake', () => {
  const s = fresh();
  const b = bet(s, { stake: 25 });
  assert.equal(s.wallet.credits, 75);
  assert.equal(Core.balances(s).atStake, 25);
  assert.equal(b.status, 'active');
  assert.match(b.proofCode, /^[A-Z2-9]{4}$/);
  ok(s);
});

test('stake is capped by proof tier and by wallet', () => {
  const s = fresh();
  assert.throws(() => bet(s, { stake: 11, proofTier: 0 }), /Max stake for Honor/);
  assert.throws(() => bet(s, { stake: 51, proofTier: 1 }), /Max stake for Live photo/);
  bet(s, { stake: 50 }); bet(s, { stake: 50 });
  assert.throws(() => bet(s, { stake: 1 }), /only have 0 credits/);
  ok(s);
});

test('deadline must be at least 5 minutes out', () => {
  const s = fresh();
  assert.throws(() => bet(s, { deadline: T0 + 4 * MIN }), /at least 5 minutes/);
});

test('winning returns the stake', () => {
  const s = fresh();
  const b = bet(s, { stake: 20 });
  Core.submitBetProof(s, b.id, { kind: 'photo', mediaKey: 'm1' }, T0 + HOUR);
  assert.equal(b.status, 'won');
  assert.equal(s.wallet.credits, 100);
  assert.equal(s.proofs.length, 1);
  ok(s);
});

test('tier 1 bet rejects self-report unless camera unavailable', () => {
  const s = fresh();
  const b = bet(s, { proofTier: 1 });
  assert.throws(() => Core.submitBetProof(s, b.id, { kind: 'self' }, T0 + HOUR), /needs a live photo/);
  Core.submitBetProof(s, b.id, { kind: 'self', cameraUnavailable: true }, T0 + HOUR);
  assert.equal(b.status, 'won');
  assert.match(s.ledger.at(-1).note, /camera unavailable/);
  ok(s);
});

test('cannot prove after the deadline; tick locks it into the vault', () => {
  const s = fresh();
  const b = bet(s, { stake: 30 });
  assert.throws(() => Core.submitBetProof(s, b.id, { kind: 'photo' }, T0 + 25 * HOUR), /deadline has passed/);
  const events = Core.tick(s, T0 + 25 * HOUR);
  assert.equal(events[0].type, 'locked');
  assert.equal(b.status, 'locked');
  const e = Core.entryForBet(s, b.id);
  assert.equal(e.amount, 30);
  assert.equal(e.chancesLeft, 3);
  assert.equal(e.decaysAt, b.deadline + RULES.DECAY_MS);
  assert.equal(e.destination, 'Food bank');
  const bal = Core.balances(s);
  assert.equal(bal.wallet, 70); assert.equal(bal.inVault, 30); assert.equal(bal.atStake, 0);
  ok(s);
  // idempotent
  assert.deepEqual(Core.tick(s, T0 + 26 * HOUR), []);
  ok(s);
});

test('cooling-off cancel refunds; after 10 minutes it is live', () => {
  const s = fresh();
  const b1 = bet(s, { stake: 10 });
  Core.cancelBet(s, b1.id, T0 + 9 * MIN);
  assert.equal(b1.status, 'cancelled');
  assert.equal(s.wallet.credits, 100);
  const b2 = bet(s, { stake: 10 });
  assert.throws(() => Core.cancelBet(s, b2.id, T0 + 11 * MIN), /cooling-off/);
  ok(s);
});

test('harderBy: quantity 1.5x, half window, higher proof tier', () => {
  const s = fresh();
  const b = bet(s); // 5 km, 24h window, tier 1
  const now = T0 + 25 * HOUR;
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 7 }, deadline: now + 24 * HOUR, proofTier: 1 }, now), []);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 7.5 }, deadline: now + 24 * HOUR, proofTier: 1 }, now), ['quantity']);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 5 }, deadline: now + 12 * HOUR, proofTier: 1 }, now), ['deadline']);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 5 }, deadline: now + 13 * HOUR, proofTier: 1 }, now), []);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 5 }, deadline: now + 24 * HOUR, proofTier: 2 }, now), ['proof']);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 10 }, deadline: now + 6 * HOUR, proofTier: 3 }, now), ['quantity', 'deadline', 'proof']);
});

test('harderBy on a binary bet: doing it twice counts', () => {
  const s = fresh();
  const b = bet(s, { measure: { kind: 'binary' } });
  const now = T0 + 25 * HOUR;
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'quantity', amount: 2, unit: 'times' }, deadline: now + 24 * HOUR, proofTier: 1 }, now), ['quantity']);
  assert.deepEqual(Core.harderBy(b, { measure: { kind: 'binary' }, deadline: now + 24 * HOUR, proofTier: 1 }, now), []);
});

test('redemption must be harder, and full success unlocks everything', () => {
  const s = fresh();
  const b = bet(s, { stake: 40 });
  Core.tick(s, T0 + 25 * HOUR);
  const e = Core.entryForBet(s, b.id);
  const now = T0 + 26 * HOUR;
  assert.throws(() => Core.createRedemption(s, e.id, { title: 'Same thing', measure: { kind: 'quantity', amount: 5 }, deadline: now + 24 * HOUR, proofTier: 1 }, now), /Not harder/);
  const r = Core.createRedemption(s, e.id, { title: 'Run 10k', measure: { kind: 'quantity', amount: 10, unit: 'km' }, deadline: now + 24 * HOUR, proofTier: 1 }, now);
  assert.deepEqual(r.harderBy, ['quantity']);
  assert.throws(() => Core.createRedemption(s, e.id, { title: 'Another', measure: { kind: 'quantity', amount: 10 }, deadline: now + 24 * HOUR, proofTier: 1 }, now), /already an active redemption/);
  const res = Core.submitRedemptionProof(s, r.id, { kind: 'photo', done: 10 }, now + HOUR);
  assert.equal(res.unlocked, 40);
  assert.equal(e.status, 'redeemed');
  assert.equal(e.chancesLeft, 3, 'full success does not burn a chance');
  assert.equal(s.wallet.credits, 100);
  ok(s);
});

test('partial success unlocks a fraction and burns a chance; failure burns a chance', () => {
  const s = fresh();
  const b = bet(s, { stake: 40 });
  Core.tick(s, T0 + 25 * HOUR);
  const e = Core.entryForBet(s, b.id);
  let now = T0 + 26 * HOUR;
  const r1 = Core.createRedemption(s, e.id, { title: 'Run 10k', measure: { kind: 'quantity', amount: 10, unit: 'km' }, deadline: now + 24 * HOUR, proofTier: 1 }, now);
  const res = Core.submitRedemptionProof(s, r1.id, { kind: 'photo', done: 5 }, now + HOUR);
  assert.equal(res.unlocked, 20);
  assert.equal(r1.status, 'partial');
  assert.equal(e.amount, 20);
  assert.equal(e.status, 'locked');
  assert.equal(e.chancesLeft, 2);
  assert.equal(s.wallet.credits, 80);
  ok(s);
  now += 2 * HOUR;
  const r2 = Core.createRedemption(s, e.id, { title: 'Run 10k again', measure: { kind: 'quantity', amount: 10, unit: 'km' }, deadline: now + 24 * HOUR, proofTier: 1 }, now);
  Core.submitRedemptionProof(s, r2.id, { kind: 'photo', done: 0 }, now + HOUR);
  assert.equal(r2.status, 'failed');
  assert.equal(e.chancesLeft, 1);
  assert.equal(s.wallet.credits, 80);
  ok(s);
});

test('an expired redemption burns a chance via tick; zero chances blocks new ones', () => {
  const s = fresh();
  const b = bet(s, { stake: 10 });
  Core.tick(s, T0 + 25 * HOUR);
  const e = Core.entryForBet(s, b.id);
  let now = T0 + 26 * HOUR;
  for (let i = 0; i < 3; i++) {
    const r = Core.createRedemption(s, e.id, { title: 'Try ' + i, measure: { kind: 'quantity', amount: 10 }, deadline: now + HOUR, proofTier: 1 }, now);
    const ev = Core.tick(s, now + 2 * HOUR);
    assert.equal(ev[0].type, 'redemptionFailed');
    assert.equal(r.status, 'failed');
    now += 3 * HOUR;
  }
  assert.equal(e.chancesLeft, 0);
  assert.throws(() => Core.createRedemption(s, e.id, { title: 'One more', measure: { kind: 'quantity', amount: 10 }, deadline: now + HOUR, proofTier: 1 }, now), /No chances left/);
  ok(s);
});

test('vault entry decays after 30 days to the chosen destination; money is accounted for', () => {
  const s = fresh();
  const b = bet(s, { stake: 15, destination: 'Red Cross' });
  Core.tick(s, T0 + 25 * HOUR);
  const e = Core.entryForBet(s, b.id);
  const ev = Core.tick(s, e.decaysAt + 1);
  assert.equal(ev[0].type, 'decayed');
  assert.equal(e.status, 'decayed');
  const bal = Core.balances(s);
  assert.equal(bal.decayed, 15); assert.equal(bal.inVault, 0); assert.equal(bal.total, 100);
  assert.match(s.ledger.at(-1).note, /Red Cross/);
  assert.throws(() => Core.createRedemption(s, e.id, { title: 'x', measure: { kind: 'quantity', amount: 10 }, deadline: e.decaysAt + DAY, proofTier: 1 }, e.decaysAt + 2), /not locked/);
  ok(s);
});

test('redemption deadline must land before decay', () => {
  const s = fresh();
  const b = bet(s, { stake: 15 });
  Core.tick(s, T0 + 25 * HOUR);
  const e = Core.entryForBet(s, b.id);
  const now = e.decaysAt - HOUR;
  assert.throws(() => Core.createRedemption(s, e.id, { title: 'x', measure: { kind: 'quantity', amount: 10 }, deadline: now + 2 * HOUR, proofTier: 1 }, now), /before the entry decays/);
});

test('stats: win rate, recovery rate, streak, saved', () => {
  const s = fresh();
  let now = T0;
  const w1 = bet(s, { stake: 10 }, now); Core.submitBetProof(s, w1.id, { kind: 'photo' }, now + HOUR);
  now += DAY;
  const l1 = bet(s, { stake: 20 }, now); Core.tick(s, now + 25 * HOUR);
  now += 2 * DAY;
  const w2 = bet(s, { stake: 10 }, now); Core.submitBetProof(s, w2.id, { kind: 'photo' }, now + HOUR);
  const e = Core.entryForBet(s, l1.id);
  const r = Core.createRedemption(s, e.id, { title: 'harder', measure: { kind: 'quantity', amount: 10 }, deadline: now + 5 * HOUR, proofTier: 1 }, now + 2 * HOUR);
  Core.submitRedemptionProof(s, r.id, { kind: 'photo', done: 5 }, now + 3 * HOUR);
  const st = Core.stats(s);
  assert.equal(st.won, 2); assert.equal(st.lost, 1); assert.equal(st.winRate, 67);
  assert.equal(st.recovered, 10); assert.equal(st.everLocked, 20); assert.equal(st.recoveryRate, 50);
  assert.equal(st.saved, 20); assert.equal(st.streak, 1);
  ok(s);
});

test('a long random sequence never breaks the money invariant', () => {
  const s = fresh();
  let now = T0;
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    now += Math.floor(rnd() * 12) * HOUR;
    Core.tick(s, now);
    const roll = rnd();
    try {
      if (roll < 0.4 && s.wallet.credits >= 1) {
        bet(s, { stake: Math.max(1, Math.floor(rnd() * Math.min(50, s.wallet.credits))), deadline: now + (1 + Math.floor(rnd() * 48)) * HOUR }, now);
      } else if (roll < 0.6) {
        const b = s.bets.find(x => x.status === 'active'); if (b) Core.submitBetProof(s, b.id, { kind: 'photo' }, now);
      } else if (roll < 0.8) {
        const e = s.vault.find(x => x.status === 'locked' && x.chancesLeft > 0 && !Core.activeRedemptionFor(s, x.id));
        if (e) Core.createRedemption(s, e.id, { title: 'r', measure: { kind: 'quantity', amount: 10 }, deadline: now + 6 * HOUR, proofTier: 1 }, now);
      } else {
        const r = s.redemptions.find(x => x.status === 'active'); if (r) Core.submitRedemptionProof(s, r.id, { kind: 'photo', done: rnd() * 12 }, now);
      }
    } catch (e) { /* rule violations are fine; money must still balance */ }
    ok(s);
  }
  Core.tick(s, now + 40 * DAY);
  ok(s);
});

test('grace: a token every 3 consecutive wins, capped at 3; a loss resets the streak', () => {
  const s = fresh();
  let now = T0;
  const win = () => { const b = bet(s, { stake: 5 }, now); Core.submitBetProof(s, b.id, { kind: 'photo' }, now + HOUR); now += DAY; };
  win(); win(); assert.equal(s.grace.tokens, 0);
  win(); assert.equal(s.grace.tokens, 1);
  assert.match(s.ledger.at(-1).note, /grace token/);
  win(); win(); assert.equal(s.grace.tokens, 1);
  win(); assert.equal(s.grace.tokens, 2);
  // a loss
  bet(s, { stake: 5 }, now); Core.tick(s, now + 25 * HOUR); now += 2 * DAY;
  assert.equal(Core.winStreak(s), 0);
  win(); win(); win(); assert.equal(s.grace.tokens, 3);
  win(); win(); win(); assert.equal(s.grace.tokens, 3, 'capped');
  ok(s);
});

test('grace: extending a bet pushes the deadline 24h, once, and costs a token', () => {
  const s = fresh();
  const b = bet(s, { stake: 5 });
  assert.throws(() => Core.extendBet(s, b.id, T0 + HOUR), /No grace tokens/);
  s.grace.tokens = 1;
  const dl = b.deadline;
  Core.extendBet(s, b.id, T0 + HOUR);
  assert.equal(b.deadline, dl + 24 * HOUR);
  assert.equal(s.grace.tokens, 0);
  s.grace.tokens = 1;
  assert.throws(() => Core.extendBet(s, b.id, T0 + 2 * HOUR), /already extended/);
  // the extension actually prevents a lock
  assert.deepEqual(Core.tick(s, dl + HOUR), []);
  assert.equal(b.status, 'active');
  Core.tick(s, dl + 25 * HOUR);
  assert.equal(b.status, 'locked');
  ok(s);
});

test('rank climbs with wins and full comebacks', () => {
  const s = fresh();
  let r = Core.rank(s);
  assert.equal(r.name, 'Rookie'); assert.equal(r.points, 0); assert.equal(r.toNext, 3); assert.equal(r.progress, 0);
  for (let i = 0; i < 3; i++) { const b = bet(s, { stake: 1, proofTier: 0 }); Core.submitBetProof(s, b.id, { kind: 'self', done: 1 }, T0 + HOUR); }
  r = Core.rank(s);
  assert.equal(r.name, 'Regular'); assert.equal(r.level, 2); assert.equal(r.next, 'Contender');
  assert.ok(r.progress >= 0 && r.progress < 1);
  ok(s);
});

test('challenge window: photo must be shot within 2 minutes of drawing', () => {
  const s = fresh();
  const b = bet(s, {}, T0);
  assert.throws(() => Core.drawChallenge(s, 'bet', b.id, '', T0), /instructions/);
  const ch = Core.drawChallenge(s, 'bet', b.id, '10 jumping jacks outside', T0 + MIN);
  assert.equal(ch.expiresAt, T0 + MIN + RULES.CHALLENGE_WINDOW_MS);
  assert.throws(() => Core.submitBetProof(s, b.id, { kind: 'photo', shotAt: T0 + 4 * MIN }, T0 + 5 * MIN), /challenge window/);
  assert.throws(() => Core.submitBetProof(s, b.id, { kind: 'photo' }, T0 + 2 * MIN), /challenge window/);
  // redraw restarts the window and counts draws
  const ch2 = Core.drawChallenge(s, 'bet', b.id, 'Touch grass', T0 + 10 * MIN);
  assert.equal(ch2.draws, 2);
  Core.submitBetProof(s, b.id, { kind: 'photo', shotAt: T0 + 11 * MIN }, T0 + 12 * MIN);
  assert.equal(s.bets[0].status, 'won');
  assert.equal(s.proofs[0].challenge, 'Touch grass');
  ok(s);
});

test('honor bets cannot draw challenges', () => {
  const s = fresh();
  const b = bet(s, { proofTier: 0, stake: 5 }, T0);
  assert.throws(() => Core.drawChallenge(s, 'bet', b.id, 'x', T0), /Honor/);
});
