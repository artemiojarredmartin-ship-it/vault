const test = require('node:test');
const assert = require('node:assert/strict');
const League = require('../js/league.js');

// tiny seeded RNG so seasons are reproducible
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const always = (v) => () => v;

function league(over = {}) {
  return League.create(Object.assign({ name: 'Test', weeks: 2, tier: 'medium', habits: ['Up by 7am', 'Read 20 pages'] }, over));
}

test('round robin: everyone plays once per week, no repeats in 5 rounds', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const weeks = League.roundRobin(ids, 5);
  const seen = new Set();
  for (const pairs of weeks) {
    const inWeek = pairs.flat();
    assert.equal(new Set(inWeek).size, 6);
    for (const [a, b] of pairs) { const k = [a, b].sort().join('-'); assert.ok(!seen.has(k), 'repeat ' + k); seen.add(k); }
  }
});

test('create validates habits and clamps settings', () => {
  assert.throws(() => League.create({ habits: [] }), /at least one habit/);
  const lg = League.create({ habits: ['a', 'b', 'c', 'd'], weeks: 99, tier: 'nope' });
  assert.equal(lg.members[0].habits.length, League.MAX_HABITS);
  assert.equal(lg.weeks, 5);
  assert.equal(lg.tier, 'mild');
  assert.equal(lg.members.length, 6);
});

test('proving scores 10, streaks add +2 per day up to the cap, misses cost 5', () => {
  const lg = league();
  const h = lg.members[0].habits[0].id;
  const e1 = League.prove(lg, h);
  assert.equal(e1.points, 10);
  assert.throws(() => League.prove(lg, h), /Already done/);
  League.endDay(lg, always(.99)); // bots miss everything (rand >= reliability), your other habit misses
  const e2 = League.prove(lg, h);
  assert.equal(e2.points, 12);
  for (let i = 0; i < 8; i++) { League.endDay(lg, always(.99)); if (!lg.finished) League.prove(lg, h); }
  const last = lg.log.filter(e => e.member === 'you' && e.habit === h).pop();
  assert.equal(last.points, 10 + League.SCORING.STREAK_CAP);
  const misses = lg.log.filter(e => e.member === 'you' && e.kind === 'miss');
  assert.ok(misses.every(e => e.points === -5));
});

test('week results and standings: winner gets the W', () => {
  const lg = league({ weeks: 1 });
  const you = lg.members[0];
  for (let d = 0; d < 7; d++) { you.habits.forEach(h => League.prove(lg, h.id)); League.endDay(lg, always(.99)); }
  assert.equal(lg.finished, true);
  const table = League.standings(lg);
  assert.equal(table[0].id, 'you');
  assert.equal(table[0].w, 1);
  assert.ok(lg.log.some(e => e.kind === 'result'));
});

test('sus: majority fake voids a proof to -20; cannot sus yourself or twice', () => {
  const lg = league();
  const dre = lg.members.find(m => m.id === 'dre');
  // force a fake proof for Dre
  League.endDay(lg, always(0)); // rand 0 → everyone proves, every bot proof is "fake" (0 < shady)
  const e = lg.log.find(x => x.member === 'dre' && x.kind === 'proof' && !x.sus);
  assert.ok(e && e.fake);
  assert.throws(() => League.sus(lg, e.id, 'dre'), /yourself/);
  const res = League.sus(lg, e.id, 'you', always(0)); // everyone votes fake
  assert.equal(res.verdict, 'fake');
  assert.equal(e.points, League.SCORING.FAKE);
  assert.throws(() => League.sus(lg, e.id, 'you'), /Only|only|Already/);
  assert.ok(dre);
});

test('honest proof survives a sus vote', () => {
  const lg = league();
  const e = League.prove(lg, lg.members[0].habits[0].id);
  const res = League.sus(lg, e.id, 'leo', always(.99)); // others vote legit
  assert.equal(res.verdict, 'legit');
  assert.equal(e.points, 10);
});

test('custom punishments: unsafe or over $10 rejected, others voted in', () => {
  const lg = league();
  assert.equal(League.addCustom(lg, 'Post it on your story', 'mild', always(0)).approved, false);
  assert.equal(League.addCustom(lg, 'Post an embarrassing video on your story', 'mild', always(0)).approved, false);
  assert.equal(League.addCustom(lg, 'Upload a cringe dance to TikTok', 'mild', always(0)).approved, false);
  assert.equal(League.addCustom(lg, 'Take 5 shots', 'spicy', always(0)).approved, false);
  assert.equal(League.addCustom(lg, 'Buy everyone pizza ($40)', 'mild', always(0)).approved, false);
  const ok = League.addCustom(lg, 'Wear a cape to class', 'mild', always(0));
  assert.equal(ok.approved, true);
  assert.ok(League.pool(lg, 'mild').includes('Wear a cape to class'));
});

test('finale: last place gets a punishment; one veto drops a tier', () => {
  const lg = league({ weeks: 1, tier: 'spicy' });
  assert.throws(() => League.finish(lg), /still going/);
  const r = rng(7);
  for (let d = 0; d < 7; d++) League.endDay(lg, r, 0); // you never prove → likely last
  const res = League.finish(lg, r);
  const table = League.standings(lg);
  assert.equal(res.loser, table[table.length - 1].id);
  assert.ok(League.pool(lg, 'spicy').includes(res.punishment));
  const before = res.punishment;
  League.veto(lg, r);
  assert.equal(res.tier, 'medium');
  assert.notEqual(res.punishment, before);
  assert.ok(League.pool(lg, 'medium').includes(res.punishment));
  assert.throws(() => League.veto(lg, r), /already used/);
});

test('a full random season always finishes with a loser', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const r = rng(seed);
    const lg = league({ weeks: 3 });
    while (!lg.finished) League.endDay(lg, r, .7);
    const res = League.finish(lg, r);
    assert.ok(lg.members.some(m => m.id === res.loser));
    assert.equal(lg.day, 21);
  }
});
