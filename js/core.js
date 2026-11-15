/* Vault — core logic.
 * Pure functions over a plain state object. No DOM, no storage, no Date.now():
 * every time-dependent function takes `now` (ms) so it can be tested.
 * Works in the browser (window.Core) and in node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  const RULES = {
    STARTING_CREDITS: 100,
    MAX_STAKE_BY_TIER: { 0: 10, 1: 50, 2: 200, 3: 1000 },
    COOLING_OFF_MS: 10 * MIN,
    DECAY_MS: 30 * DAY,
    CHANCES: 3,
    HARDER_MULTIPLIER: 1.5,
    HARDER_WINDOW_FRACTION: 0.5,
    MIN_WINDOW_MS: 5 * MIN,
    GRACE_EVERY_WINS: 3,
    GRACE_MAX: 3,
    GRACE_EXTENSION_MS: 24 * HOUR,
    CHALLENGE_WINDOW_MS: 2 * MIN
  };

  const TIERS = {
    0: { name: 'Honor', desc: 'Self-report. Small stakes only.' },
    1: { name: 'Live photo', desc: 'In-app camera with your one-time proof code in frame.' },
    2: { name: 'Partner', desc: 'A named human approves. (Phase 1)' },
    3: { name: 'Integration', desc: 'Automatic data from an app. (Phase 1)' }
  };

  const MEASURE_KINDS = ['binary', 'duration', 'quantity'];

  // ---------- helpers ----------
  let seq = 0;
  function uid(prefix) {
    seq = (seq + 1) % 1e6;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function proofCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  function round(n) { return Math.round(n * 100) / 100; }

  function blank() {
    return {
      version: 1,
      wallet: { credits: RULES.STARTING_CREDITS },
      bets: [],
      proofs: [],
      vault: [],
      redemptions: [],
      ledger: [{ id: uid('l'), at: 0, delta: RULES.STARTING_CREDITS, balanceAfter: RULES.STARTING_CREDITS, reason: 'grant', refId: null, note: 'Starting credits' }],
      partners: [],
      grace: { tokens: 0, earned: 0, spent: 0 },
      settings: { name: '', realMoneyEnabled: false }
    };
  }

  function ledger(state, at, delta, reason, refId, note) {
    state.wallet.credits = round(state.wallet.credits + delta);
    state.ledger.push({ id: uid('l'), at, delta: round(delta), balanceAfter: state.wallet.credits, reason, refId: refId || null, note: note || '' });
  }

  // ---------- lookups ----------
  const betById = (s, id) => s.bets.find(b => b.id === id);
  const entryById = (s, id) => s.vault.find(e => e.id === id);
  const redemptionById = (s, id) => s.redemptions.find(r => r.id === id);
  const entryForBet = (s, betId) => s.vault.find(e => e.betId === betId);
  const activeRedemptionFor = (s, entryId) => s.redemptions.find(r => r.vaultEntryId === entryId && r.status === 'active');

  // ---------- balances & invariants ----------
  function balances(state) {
    const atStake = state.bets.filter(b => b.status === 'active').reduce((n, b) => n + b.stake, 0);
    const inVault = state.vault.filter(e => e.status === 'locked').reduce((n, e) => n + e.amount, 0);
    const decayed = state.vault.filter(e => e.status === 'decayed').reduce((n, e) => n + e.amount, 0);
    const granted = state.ledger.filter(l => l.reason === 'grant').reduce((n, l) => n + l.delta, 0);
    const wallet = state.wallet.credits;
    return { wallet: round(wallet), atStake: round(atStake), inVault: round(inVault), decayed: round(decayed), granted: round(granted), total: round(wallet + atStake + inVault + decayed) };
  }

  function checkInvariants(state) {
    const problems = [];
    const b = balances(state);
    if (Math.abs(b.total - b.granted) > 0.005) problems.push(`Money leak: wallet+atStake+inVault+decayed = ${b.total}, granted = ${b.granted}`);
    if (b.wallet < -0.005) problems.push(`Negative wallet: ${b.wallet}`);
    for (const e of state.vault) {
      if (e.chancesLeft < 0) problems.push(`Entry ${e.id} has negative chances`);
      if (e.amount < -0.005) problems.push(`Entry ${e.id} has negative amount`);
      if (e.status === 'decayed' && state.redemptions.some(r => r.vaultEntryId === e.id && r.status === 'active')) problems.push(`Decayed entry ${e.id} has an active redemption`);
    }
    const last = state.ledger[state.ledger.length - 1];
    if (last && Math.abs(last.balanceAfter - state.wallet.credits) > 0.005) problems.push('Ledger balance does not match wallet');
    return problems;
  }

  // ---------- bets ----------
  /**
   * input: { title, why?, stake, deadline (ms), proofTier, destination, partnerId?,
   *          measure: { kind: 'binary'|'duration'|'quantity', amount, unit } }
   */
  function placeBet(state, input, now) {
    const stake = Number(input.stake);
    const tier = Number(input.proofTier);
    assert(input.title && input.title.trim(), 'Give the bet a title.');
    assert(Number.isFinite(stake) && stake > 0, 'Stake must be a positive number.');
    assert(tier in RULES.MAX_STAKE_BY_TIER, 'Unknown proof tier.');
    assert(stake <= RULES.MAX_STAKE_BY_TIER[tier], `Max stake for ${TIERS[tier].name} proof is ${RULES.MAX_STAKE_BY_TIER[tier]} credits.`);
    assert(stake <= state.wallet.credits, `You only have ${state.wallet.credits} credits in your wallet.`);
    assert(Number.isFinite(input.deadline) && input.deadline - now >= RULES.MIN_WINDOW_MS, 'Deadline must be at least 5 minutes from now.');
    assert(input.destination && input.destination.trim(), 'Pick where the money goes if it decays.');
    const measure = normalizeMeasure(input.measure);

    const bet = {
      id: uid('bet'), title: input.title.trim(), why: (input.why || '').trim(),
      stake, createdAt: now, startsAt: now, deadline: input.deadline,
      proofTier: tier, partnerId: input.partnerId || null, decayDestination: input.destination.trim(),
      measure, proofCode: proofCode(), status: 'active', proofIds: [], note: ''
    };
    state.bets.push(bet);
    ledger(state, now, -stake, 'stake', bet.id, `Staked on "${bet.title}"`);
    return bet;
  }

  function normalizeMeasure(m) {
    if (!m || !MEASURE_KINDS.includes(m.kind)) return { kind: 'binary', amount: 1, unit: 'time' };
    if (m.kind === 'binary') return { kind: 'binary', amount: 1, unit: 'time' };
    const amount = Number(m.amount);
    assert(Number.isFinite(amount) && amount > 0, 'Measure amount must be a positive number.');
    return { kind: m.kind, amount, unit: (m.unit || (m.kind === 'duration' ? 'minutes' : 'reps')).trim() };
  }

  function cancelBet(state, betId, now) {
    const bet = betById(state, betId);
    assert(bet && bet.status === 'active', 'Only active bets can be cancelled.');
    assert(now - bet.createdAt <= RULES.COOLING_OFF_MS, 'The 10-minute cooling-off window has passed. The bet is live.');
    bet.status = 'cancelled';
    ledger(state, now, bet.stake, 'cancel', bet.id, `Cancelled "${bet.title}"`);
    return bet;
  }

  /** proof: { kind: 'self'|'photo', mediaKey?, note?, cameraUnavailable? } */
  // ---------- live challenges ----------
  // A photo proof gets a random action to perform ("10 jumping jacks outside") and a short window to shoot it,
  // so a staged or old photo can't match. Drawing again replaces the challenge and restarts the window.
  function drawChallenge(state, kind, id, text, now) {
    const target = kind === 'bet' ? betById(state, id) : redemptionById(state, id);
    assert(target && target.status === 'active', 'This is not active.');
    assert(target.proofTier >= 1, 'Honor bets do not use challenges.');
    assert(typeof text === 'string' && text.trim(), 'A challenge needs instructions.');
    target.challenge = { text: text.trim(), issuedAt: now, expiresAt: now + RULES.CHALLENGE_WINDOW_MS, draws: ((target.challenge && target.challenge.draws) || 0) + 1 };
    return target.challenge;
  }
  function checkChallenge(target, proof) {
    const ch = target.challenge;
    if (proof.kind !== 'photo' || !ch) return null;
    const at = proof.shotAt;
    assert(at != null && at >= ch.issuedAt && at <= ch.expiresAt, 'That photo was taken outside the 2-minute challenge window. Draw a new challenge and try again.');
    return ch.text;
  }

  function submitBetProof(state, betId, proof, now) {
    const bet = betById(state, betId);
    assert(bet && bet.status === 'active', 'This bet is not active.');
    assert(now <= bet.deadline, 'The deadline has passed.');
    if (bet.proofTier >= 1) assert(proof.kind === 'photo' || proof.cameraUnavailable, 'This bet needs a live photo.');
    const challenge = checkChallenge(bet, proof);
    const p = { id: uid('proof'), betId, redemptionId: null, kind: proof.kind, mediaKey: proof.mediaKey || null, note: (proof.note || '').trim(),
      capturedAt: now, code: bet.proofCode, challenge, verdict: 'accepted', verdictBy: 'auto', reason: proof.cameraUnavailable ? 'cameraUnavailable' : '' };
    state.proofs.push(p);
    bet.proofIds.push(p.id);
    bet.status = 'won';
    bet.resolvedAt = now;
    ledger(state, now, bet.stake, 'won', bet.id, `Proved "${bet.title}"${proof.cameraUnavailable ? ' (camera unavailable, self-attested)' : ''}`);
    maybeAwardGrace(state, now);
    return bet;
  }

  // ---------- grace tokens ----------
  function winStreak(state) {
    const resolved = state.bets.filter(b => ['won', 'locked'].includes(b.status)).sort((a, b) => b.resolvedAt - a.resolvedAt);
    let n = 0; for (const b of resolved) { if (b.status === 'won') n++; else break; }
    return n;
  }
  function maybeAwardGrace(state, now) {
    if (!state.grace) state.grace = { tokens: 0, earned: 0, spent: 0 };
    const streak = winStreak(state);
    if (streak > 0 && streak % RULES.GRACE_EVERY_WINS === 0 && state.grace.tokens < RULES.GRACE_MAX) {
      state.grace.tokens += 1; state.grace.earned += 1;
      state.ledger.push({ id: uid('l'), at: now, delta: 0, balanceAfter: state.wallet.credits, reason: 'grace', refId: null, note: `${streak} wins in a row: earned a grace token (${state.grace.tokens}/${RULES.GRACE_MAX})` });
      return true;
    }
    return false;
  }
  /** Spend a grace token to push an active bet's deadline back 24h. Once per bet. */
  function extendBet(state, betId, now) {
    if (!state.grace) state.grace = { tokens: 0, earned: 0, spent: 0 };
    const bet = betById(state, betId);
    assert(bet && bet.status === 'active', 'Only active bets can be extended.');
    assert(now <= bet.deadline, 'The deadline has already passed.');
    assert(!bet.extended, 'This bet was already extended once.');
    assert(state.grace.tokens > 0, 'No grace tokens. Earn one with 3 wins in a row.');
    bet.deadline += RULES.GRACE_EXTENSION_MS;
    bet.extended = true;
    state.grace.tokens -= 1; state.grace.spent += 1;
    state.ledger.push({ id: uid('l'), at: now, delta: 0, balanceAfter: state.wallet.credits, reason: 'grace', refId: bet.id, note: `Spent a grace token: "${bet.title}" extended 24h` });
    return bet;
  }

  // ---------- vault ----------
  function lockBet(state, bet, now) {
    bet.status = 'locked';
    bet.resolvedAt = bet.deadline;
    const entry = {
      id: uid('v'), betId: bet.id, amount: bet.stake, originalAmount: bet.stake,
      lockedAt: bet.deadline, decaysAt: bet.deadline + RULES.DECAY_MS,
      chancesLeft: RULES.CHANCES, destination: bet.decayDestination,
      status: 'locked', whatGotInTheWay: '', redeemedTotal: 0
    };
    state.vault.push(entry);
    // No wallet change: credits move from "at stake" to "in vault".
    state.ledger.push({ id: uid('l'), at: now, delta: 0, balanceAfter: state.wallet.credits, reason: 'locked', refId: entry.id, note: `"${bet.title}" missed — ${bet.stake} locked in the Vault` });
    return entry;
  }

  function decayEntry(state, entry, now) {
    entry.status = 'decayed';
    entry.decayedAt = entry.decaysAt;
    const r = activeRedemptionFor(state, entry.id);
    if (r) { r.status = 'failed'; r.resolvedAt = now; }
    state.ledger.push({ id: uid('l'), at: now, delta: 0, balanceAfter: state.wallet.credits, reason: 'decayed', refId: entry.id, note: `${entry.amount} credits went to ${entry.destination}` });
  }

  /** Which dimensions make `challenge` harder than `bet`? Empty array = not harder. */
  function harderBy(bet, challenge, now) {
    const dims = [];
    const bm = bet.measure || { kind: 'binary', amount: 1 };
    const cm = normalizeMeasure(challenge.measure);
    if (cm.amount >= bm.amount * RULES.HARDER_MULTIPLIER) dims.push(cm.kind === 'duration' ? 'duration' : 'quantity');
    const origWindow = bet.deadline - bet.createdAt;
    const newWindow = challenge.deadline - now;
    if (newWindow > 0 && newWindow <= origWindow * RULES.HARDER_WINDOW_FRACTION) dims.push('deadline');
    if (Number(challenge.proofTier) > bet.proofTier) dims.push('proof');
    return dims;
  }

  /** challenge: { title, measure, deadline, proofTier } */
  function createRedemption(state, entryId, challenge, now) {
    const entry = entryById(state, entryId);
    assert(entry && entry.status === 'locked', 'This vault entry is not locked.');
    assert(now < entry.decaysAt, 'This entry has decayed.');
    assert(entry.chancesLeft > 0, 'No chances left on this entry.');
    assert(!activeRedemptionFor(state, entryId), 'There is already an active redemption for this entry.');
    assert(challenge.title && challenge.title.trim(), 'Give the challenge a title.');
    assert(Number.isFinite(challenge.deadline) && challenge.deadline - now >= RULES.MIN_WINDOW_MS, 'Deadline must be at least 5 minutes from now.');
    assert(challenge.deadline <= entry.decaysAt, 'The challenge must finish before the entry decays.');
    const bet = betById(state, entry.betId);
    const dims = harderBy(bet, challenge, now);
    assert(dims.length > 0, 'Not harder yet. Increase the amount by 1.5×, halve the time window, or raise the proof tier.');
    const tier = Number(challenge.proofTier);
    assert(tier in TIERS, 'Unknown proof tier.');
    const r = {
      id: uid('red'), vaultEntryId: entry.id, betId: bet.id, title: challenge.title.trim(),
      measure: normalizeMeasure(challenge.measure), deadline: challenge.deadline, proofTier: tier,
      harderBy: dims, createdAt: now, status: 'active', proofIds: [], unlocked: 0, proofCode: proofCode()
    };
    state.redemptions.push(r);
    return r;
  }

  /** proof: { kind, mediaKey?, note?, cameraUnavailable?, done (number achieved; for binary 1 or 0) } */
  function submitRedemptionProof(state, redemptionId, proof, now) {
    const r = redemptionById(state, redemptionId);
    assert(r && r.status === 'active', 'This redemption is not active.');
    assert(now <= r.deadline, 'The redemption deadline has passed.');
    const entry = entryById(state, r.vaultEntryId);
    assert(entry.status === 'locked', 'Entry is no longer locked.');
    if (r.proofTier >= 1) assert(proof.kind === 'photo' || proof.cameraUnavailable, 'This redemption needs a live photo.');
    const challenge = checkChallenge(r, proof);

    const done = Math.max(0, Number(proof.done));
    const fraction = Math.min(1, done / r.measure.amount);
    const p = { id: uid('proof'), betId: r.betId, redemptionId: r.id, kind: proof.kind, mediaKey: proof.mediaKey || null, note: (proof.note || '').trim(),
      capturedAt: now, code: r.proofCode, challenge, verdict: fraction > 0 ? 'accepted' : 'rejected', verdictBy: 'auto', reason: proof.cameraUnavailable ? 'cameraUnavailable' : '', done };
    state.proofs.push(p);
    r.proofIds.push(p.id);
    r.resolvedAt = now;

    const unlocked = round(entry.amount * fraction);
    if (unlocked > 0) {
      entry.amount = round(entry.amount - unlocked);
      entry.redeemedTotal = round(entry.redeemedTotal + unlocked);
      r.unlocked = unlocked;
      ledger(state, now, unlocked, 'redeemed', entry.id, `Redeemed ${unlocked} via "${r.title}"${fraction < 1 ? ` (${Math.round(fraction * 100)}%)` : ''}`);
    }
    if (fraction >= 1 || entry.amount <= 0) {
      r.status = 'succeeded';
      entry.status = 'redeemed';
    } else {
      r.status = fraction > 0 ? 'partial' : 'failed';
      entry.chancesLeft -= 1;
    }
    return { redemption: r, entry, unlocked, fraction };
  }

  /** Apply every time-based transition. Idempotent. */
  function tick(state, now) {
    const events = [];
    for (const bet of state.bets) {
      if (bet.status === 'active' && now > bet.deadline) { lockBet(state, bet, now); events.push({ type: 'locked', bet }); }
    }
    for (const r of state.redemptions) {
      if (r.status === 'active' && now > r.deadline) {
        r.status = 'failed'; r.resolvedAt = r.deadline;
        const e = entryById(state, r.vaultEntryId);
        if (e && e.status === 'locked') e.chancesLeft = Math.max(0, e.chancesLeft - 1);
        events.push({ type: 'redemptionFailed', redemption: r });
      }
    }
    for (const e of state.vault) {
      if (e.status === 'locked' && now > e.decaysAt) { decayEntry(state, e, now); events.push({ type: 'decayed', entry: e }); }
    }
    return events;
  }

  function setWhatGotInTheWay(state, entryId, text) {
    const e = entryById(state, entryId); assert(e, 'No such entry');
    e.whatGotInTheWay = (text || '').trim();
  }

  function grant(state, amount, now, note) {
    assert(amount > 0, 'Grant must be positive');
    ledger(state, now, amount, 'grant', null, note || 'Credits granted');
  }

  // ---------- stats ----------
  function stats(state) {
    const resolved = state.bets.filter(b => ['won', 'locked'].includes(b.status));
    const won = resolved.filter(b => b.status === 'won').length;
    const entries = state.vault;
    const recovered = entries.reduce((n, e) => n + e.redeemedTotal, 0);
    const everLocked = entries.reduce((n, e) => n + e.originalAmount, 0);
    const saved = state.bets.filter(b => b.status === 'won').reduce((n, b) => n + b.stake, 0);
    // streak: consecutive most-recent resolved bets that were won
    let streak = 0;
    for (const b of resolved.slice().sort((a, b2) => b2.resolvedAt - a.resolvedAt)) { if (b.status === 'won') streak++; else break; }
    return {
      bets: state.bets.length, won, lost: resolved.length - won,
      winRate: resolved.length ? Math.round(won / resolved.length * 100) : null,
      recovered: round(recovered), everLocked: round(everLocked),
      recoveryRate: everLocked ? Math.round(recovered / everLocked * 100) : null,
      saved: round(saved), streak
    };
  }

  // ---------- rank (cosmetic progression; points = bets won + Vault entries fully earned back) ----------
  const RANKS = [
    { name: 'Rookie', at: 0 },
    { name: 'Regular', at: 3 },
    { name: 'Contender', at: 8 },
    { name: 'High Roller', at: 15 },
    { name: 'Legend', at: 30 }
  ];
  function rank(state) {
    const points = state.bets.filter(b => b.status === 'won').length + state.vault.filter(e => e.status === 'redeemed').length;
    let i = 0;
    while (i + 1 < RANKS.length && points >= RANKS[i + 1].at) i++;
    const cur = RANKS[i], next = RANKS[i + 1] || null;
    return {
      name: cur.name, level: i + 1, points,
      next: next ? next.name : null,
      toNext: next ? next.at - points : 0,
      progress: next ? (points - cur.at) / (next.at - cur.at) : 1
    };
  }

  return {
    RULES, TIERS, RANKS, rank, drawChallenge, MEASURE_KINDS, MIN, HOUR, DAY,
    blank, uid, round,
    betById, entryById, redemptionById, entryForBet, activeRedemptionFor,
    balances, checkInvariants, stats,
    placeBet, cancelBet, submitBetProof, harderBy, createRedemption, submitRedemptionProof,
    tick, setWhatGotInTheWay, grant, normalizeMeasure,
    winStreak, maybeAwardGrace, extendBet
  };
});
