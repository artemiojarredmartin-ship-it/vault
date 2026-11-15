/* Vault — League (demo). Fantasy-style habit league with friends.
 * Pure functions over a plain league object, like core.js. No DOM, no Date.now():
 * the season moves day by day via endDay(), and every random choice takes `rand`
 * (() => [0,1)) so tests are deterministic. Kept separate from the credits state:
 * leagues never touch the wallet or the money invariant.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.League = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCORING = { PROOF: 10, STREAK_STEP: 2, STREAK_CAP: 10, MISS: -5, FAKE: -20 };
  const MAX_HABITS = 3;

  const PUNISHMENTS = {
    mild: { label: 'Mild', items: [
      'Buy the winner a drink or snack',
      'Change your profile picture to one the group picks, for a week',
      'Wear an outfit the group picks for a day',
      'Post "I lost the league" in the group chat, no excuses allowed',
      'Let the winner name your next three bets'
    ] },
    medium: { label: 'Medium', items: [
      'Do the winner\'s chore of choice for a week',
      'Cold shower on video, sent to the group only',
      'Sing a song of the group\'s choice in the group chat',
      'Winner picks your next three challenges, and they must be harder',
      'Speak only in movie quotes at the next hangout'
    ] },
    spicy: { label: 'Spicy', items: [
      '5 a.m. run with proof',
      'Plain rice and water for a day',
      'Group picks a (washable) hair color for a weekend',
      'Record a dramatic apology speech for the group, minimum 60 seconds',
      'Cook dinner for the whole league'
    ] }
  };
  const TIER_ORDER = ['mild', 'medium', 'spicy'];
  // Custom punishments must stay safe, private and cheap.
  const BANNED = /\b(naked|nude|sex\w*|drunk|alcohol|shots?|drugs?|weed|vape|steal\w*|illegal|hurt|injur\w*|fight\w*|public(ly)?|stor(y|ies)|insta(gram)?|tiktok|snap(chat)?|twitter|facebook|youtube|reddit|social media|online|internet|livestream|stream|tattoo|piercing)\b/i;
  const MONEY = /\$\s?(\d+)/;
  const MONEY_CAP = 10;

  const BOTS = [
    { id: 'maya', name: 'Maya', color: '#c2413b', reliability: .88, shady: .02, habits: ['Gym 45 min', 'Up by 7am'],
      lines: { win: 'Too easy 💅', lose: 'Rematch. Next week. Be ready.', sus: 'That lighting is suspicious…' } },
    { id: 'dre', name: 'Dre', color: '#2f5fc9', reliability: .72, shady: .18, habits: ['10k steps', 'No energy drinks'],
      lines: { win: 'Built different 😤', lose: 'I was busy ok', sus: 'Bro that photo is from last week' } },
    { id: 'sam', name: 'Sam', color: '#17855a', reliability: .55, shady: .05, habits: ['Read 20 pages', 'In bed by 11'],
      lines: { win: 'Wait I actually won??', lose: 'I\'m on a "rebuild" season', sus: 'Hmm 👀' } },
    { id: 'priya', name: 'Priya', color: '#8a4fd1', reliability: .8, shady: .08, habits: ['Study 1 hour', 'Drink 2L water'],
      lines: { win: 'Discipline > motivation', lose: 'Noted. Adjusting strategy.', sus: 'Zoom in on the timestamp' } },
    { id: 'leo', name: 'Leo', color: '#c47a14', reliability: .62, shady: .28, habits: ['Run 3 km', 'Practice guitar'],
      lines: { win: 'Never doubted myself', lose: 'The app is rigged', sus: 'Nah that\'s fake' } }
  ];

  let seq = 0;
  const id = (p) => p + '_' + (++seq).toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  function assert(c, msg) { if (!c) throw new Error(msg); }
  const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

  // Circle-method round robin. Returns `rounds` weeks of pairings.
  function roundRobin(ids, rounds) {
    const list = ids.slice();
    if (list.length % 2) list.push(null); // bye
    const n = list.length, weeks = [];
    for (let r = 0; r < rounds; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a && b) pairs.push([a, b]);
      }
      weeks.push(pairs);
      list.splice(1, 0, list.pop()); // rotate all but the first
    }
    return weeks;
  }

  function create(opts) {
    const weeks = Math.max(1, Math.min(5, opts.weeks || 3));
    const tier = TIER_ORDER.includes(opts.tier) ? opts.tier : 'mild';
    const habits = (opts.habits || []).map(h => String(h || '').trim()).filter(Boolean).slice(0, MAX_HABITS);
    assert(habits.length, 'Pick at least one habit.');
    const you = { id: 'you', name: (opts.you || 'You').trim() || 'You', color: '#c99a3a', bot: false,
      habits: habits.map(title => ({ id: id('h'), title })) };
    const bots = BOTS.map(b => ({ id: b.id, name: b.name, color: b.color, bot: true, reliability: b.reliability, shady: b.shady,
      lines: b.lines, habits: b.habits.map(title => ({ id: id('h'), title })) }));
    const members = [you].concat(bots);
    return {
      v: 1,
      name: (opts.name || 'The League').trim() || 'The League',
      weeks, days: weeks * 7, day: 0, tier,
      members,
      schedule: roundRobin(members.map(m => m.id), weeks),
      custom: (opts.custom || []).slice(),
      log: [],
      finished: false,
      result: null
    };
  }

  const member = (lg, mid) => lg.members.find(m => m.id === mid);
  const weekOf = (day) => Math.floor(day / 7);
  const loggedToday = (lg, mid, hid) => lg.log.some(e => e.day === lg.day && e.member === mid && e.habit === hid && (e.kind === 'proof' || e.kind === 'miss' || e.kind === 'fake'));

  function streakBefore(lg, mid, hid, day) {
    let n = 0;
    for (let d = day - 1; d >= 0; d--) {
      const e = lg.log.find(x => x.day === d && x.member === mid && x.habit === hid && (x.kind === 'proof' || x.kind === 'miss' || x.kind === 'fake'));
      if (e && e.kind === 'proof') n++; else break;
    }
    return n;
  }

  function addProof(lg, mid, hid, fake) {
    const streak = streakBefore(lg, mid, hid, lg.day);
    const bonus = Math.min(SCORING.STREAK_CAP, streak * SCORING.STREAK_STEP);
    const e = { id: id('e'), day: lg.day, member: mid, habit: hid, kind: 'proof', points: SCORING.PROOF + bonus, streak: streak + 1, fake: !!fake, reacts: {}, sus: null };
    lg.log.push(e);
    return e;
  }

  // You prove one of your habits for today.
  function prove(lg, habitId) {
    assert(!lg.finished, 'The season is over.');
    const you = member(lg, 'you');
    assert(you.habits.some(h => h.id === habitId), 'That is not one of your habits.');
    assert(!loggedToday(lg, 'you', habitId), 'Already done today.');
    return addProof(lg, 'you', habitId, false);
  }

  // Close the day: bots play, your unproved habits become misses. Returns feed events.
  // autoYou: chance (0..1) to auto-prove your remaining habits (used by the "sim" buttons).
  function endDay(lg, rand, autoYou) {
    assert(!lg.finished, 'The season is over.');
    rand = rand || Math.random;
    const events = [];
    for (const m of lg.members) {
      for (const h of m.habits) {
        if (loggedToday(lg, m.id, h.id)) continue;
        const p = m.bot ? m.reliability : (autoYou || 0);
        if (rand() < p) addProof(lg, m.id, h.id, m.bot && rand() < m.shady);
        else lg.log.push({ id: id('e'), day: lg.day, member: m.id, habit: h.id, kind: 'miss', points: SCORING.MISS, reacts: {} });
      }
    }
    // bots react and sometimes call sus on each other or on you
    const today = lg.log.filter(e => e.day === lg.day && e.kind === 'proof');
    for (const e of today) {
      if (rand() < .35) { const r = pick(['🔥', '💪', '👀', '😂'], rand); e.reacts[r] = (e.reacts[r] || 0) + 1; }
    }
    if (today.length && rand() < .3) {
      const e = pick(today, rand);
      const accusers = lg.members.filter(m => m.bot && m.id !== e.member);
      if (accusers.length) {
        const by = pick(accusers, rand);
        const res = sus(lg, e.id, by.id, rand);
        events.push({ type: 'sus', by: by.id, entry: e, result: res });
      }
    }
    const endedWeek = (lg.day + 1) % 7 === 0;
    const week = weekOf(lg.day);
    lg.day++;
    if (endedWeek) {
      for (const [a, b] of lg.schedule[week]) {
        const pa = points(lg, a, week), pb = points(lg, b, week);
        lg.log.push({ id: id('e'), day: lg.day - 1, kind: 'result', week, a, b, pa, pb, reacts: {} });
        const winner = pa === pb ? null : pa > pb ? a : b, loser = winner === a ? b : winner === b ? a : null;
        if (winner && member(lg, winner).bot) lg.log.push({ id: id('e'), day: lg.day - 1, kind: 'chat', member: winner, text: member(lg, winner).lines.win, reacts: {} });
        if (loser && member(lg, loser).bot && rand() < .6) lg.log.push({ id: id('e'), day: lg.day - 1, kind: 'chat', member: loser, text: member(lg, loser).lines.lose, reacts: {} });
      }
      events.push({ type: 'week', week });
    }
    if (lg.day >= lg.days) { lg.finished = true; events.push({ type: 'season' }); }
    return events;
  }

  // Someone calls sus on a proof. Everyone except the accused votes; majority "fake" voids it.
  function sus(lg, entryId, voterId, rand) {
    rand = rand || Math.random;
    const e = lg.log.find(x => x.id === entryId);
    assert(e && e.kind === 'proof', 'You can only call sus on a proof.');
    assert(!e.sus, 'Already voted on.');
    assert(e.member !== voterId, 'You can\'t call sus on yourself.');
    let yes = 0, no = 0;
    for (const m of lg.members) {
      if (m.id === e.member) continue;
      if (m.id === voterId) { yes++; continue; }
      const p = e.fake ? .8 : .2;
      if (rand() < p) yes++; else no++;
    }
    const fake = yes > no;
    e.sus = { by: voterId, yes, no, verdict: fake ? 'fake' : 'legit' };
    if (fake) { e.kind = 'fake'; e.points = SCORING.FAKE; }
    return e.sus;
  }

  function react(lg, entryId, emoji) {
    const e = lg.log.find(x => x.id === entryId);
    assert(e, 'Not found.');
    e.reacts[emoji] = (e.reacts[emoji] || 0) + 1;
    return e.reacts[emoji];
  }

  function points(lg, mid, week) {
    return lg.log.filter(e => e.member === mid && (e.kind === 'proof' || e.kind === 'miss' || e.kind === 'fake') && (week == null || weekOf(e.day) === week))
      .reduce((n, e) => n + e.points, 0);
  }

  function matchup(lg, week, mid) {
    const pair = (lg.schedule[week] || []).find(p => p.includes(mid));
    if (!pair) return null;
    const opp = pair[0] === mid ? pair[1] : pair[0];
    return { week, me: mid, opp, mine: points(lg, mid, week), theirs: points(lg, opp, week) };
  }

  // Standings over finished weeks: wins, losses, ties, total points. Last place is the loser.
  function standings(lg) {
    const done = lg.finished ? lg.weeks : weekOf(lg.day);
    const rows = lg.members.map(m => ({ id: m.id, name: m.name, w: 0, l: 0, t: 0, pts: points(lg, m.id) }));
    const row = (mid) => rows.find(r => r.id === mid);
    for (let w = 0; w < done; w++) {
      for (const [a, b] of lg.schedule[w]) {
        const pa = points(lg, a, w), pb = points(lg, b, w);
        if (pa > pb) { row(a).w++; row(b).l++; } else if (pb > pa) { row(b).w++; row(a).l++; } else { row(a).t++; row(b).t++; }
      }
      // Odd number of players: whoever sits out plays "the field" (beat the week's average to win).
      const playing = new Set(lg.schedule[w].flat());
      const byes = lg.members.filter(m => !playing.has(m.id));
      if (byes.length) {
        const avg = lg.members.reduce((n, m) => n + points(lg, m.id, w), 0) / lg.members.length;
        for (const m of byes) { const p = points(lg, m.id, w); if (p > avg) row(m.id).w++; else if (p < avg) row(m.id).l++; else row(m.id).t++; }
      }
    }
    return rows.sort((x, y) => (y.w + y.t / 2) - (x.w + x.t / 2) || y.pts - x.pts || x.name.localeCompare(y.name));
  }

  function pool(lg, tier) {
    const t = tier || lg.tier;
    return PUNISHMENTS[t].items.concat(lg.custom.filter(c => c.tier === t).map(c => c.text));
  }

  // Suggest a custom punishment. The league votes; unsafe or pricey ones are auto-rejected.
  function addCustom(lg, text, tier, rand) {
    rand = rand || Math.random;
    text = String(text || '').trim();
    assert(text.length >= 4, 'Describe the punishment.');
    assert(text.length <= 120, 'Keep it under 120 characters.');
    if (BANNED.test(text)) return { approved: false, reason: 'Rejected: punishments stay safe, legal and inside the group.' };
    const money = text.match(MONEY);
    if (money && Number(money[1]) > MONEY_CAP) return { approved: false, reason: `Rejected: nothing over $${MONEY_CAP}.` };
    const t = TIER_ORDER.includes(tier) ? tier : lg.tier;
    let yes = 1, no = 0; // you voted yes
    for (const m of lg.members) if (m.bot) { if (rand() < .85) yes++; else no++; }
    const approved = yes > no;
    if (approved) lg.custom.push({ text, tier: t });
    return { approved, yes, no, reason: approved ? `Added to ${PUNISHMENTS[t].label} (${yes}–${no}).` : `Voted down ${yes}–${no}.` };
  }

  // Season over: last place spins. Returns the result (stored on lg.result).
  function finish(lg, rand) {
    assert(lg.finished, 'The season is still going.');
    rand = rand || Math.random;
    if (lg.result) return lg.result;
    const table = standings(lg);
    const loser = table[table.length - 1].id, winner = table[0].id;
    lg.result = { winner, loser, tier: lg.tier, punishment: pick(pool(lg), rand), vetoUsed: false, proved: false };
    return lg.result;
  }

  // One veto per season: re-spin from the tier below (mild re-spins mild, excluding the current one).
  function veto(lg, rand) {
    rand = rand || Math.random;
    const r = lg.result;
    assert(r, 'Nothing to veto yet.');
    assert(!r.vetoUsed, 'Veto already used.');
    const i = TIER_ORDER.indexOf(r.tier);
    const t = TIER_ORDER[Math.max(0, i - 1)];
    const options = pool(lg, t).filter(p => p !== r.punishment);
    r.tier = t; r.punishment = pick(options, rand); r.vetoUsed = true;
    return r;
  }

  function markServed(lg) { assert(lg.result, 'No punishment yet.'); lg.result.proved = true; return lg.result; }

  // ---------- real leagues ----------
  // A sus vote is decided once a majority of the other members agree either way.
  function susVerdict(votes, eligible) {
    const yes = votes.filter(v => v.fake).length, no = votes.length - yes;
    if (eligible <= 0) return { yes, no, verdict: null };
    // Voiding needs a majority AND at least 2 people, so in a 2-player league your only opponent can't wipe you out alone.
    if (yes > eligible / 2 && yes >= 2) return { yes, no, verdict: 'fake' };
    if (no >= eligible / 2) return { yes, no, verdict: 'legit' };
    return { yes, no, verdict: null };
  }

  // Build a league view (same shape the demo uses) from database rows.
  // today = the league's current day number (0 = first day; negative = not started).
  // Days before today with no proof count as misses; today is still open.
  function fromCloud(data, today, me) {
    const g = data.league;
    const days = g.weeks * 7;
    const startMs = g.starts_on ? Date.parse(g.starts_on + 'T00:00:00') : 0;
    const members = data.members.slice().sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))
      .map(m => ({ id: m.user_id, name: (m.profile && m.profile.name) || 'Player', color: (m.profile && m.profile.color) || '#888888', habits: m.habits || [], bot: false }));
    const lg = {
      v: 1, cloud: true, id: g.id, code: g.code, host: g.created_by, me,
      name: g.name, weeks: g.weeks, days, tier: g.tier,
      started: !!g.starts_on, day: Math.max(0, Math.min(today, days)), finished: !!g.starts_on && today >= days,
      members, schedule: roundRobin(members.map(m => m.id), g.weeks),
      custom: [], log: [], result: g.result || null
    };
    if (!g.starts_on) return lg;
    const byKey = {};
    for (const e of data.entries) if (e.kind === 'proof') byKey[e.user_id + '|' + e.habit_id + '|' + e.day] = e;
    const votesBy = {}, reactsBy = {};
    for (const v of data.votes || []) (votesBy[v.entry_id] = votesBy[v.entry_id] || []).push(v);
    for (const r of data.reactions || []) (reactsBy[r.entry_id] = reactsBy[r.entry_id] || []).push(r);
    const eligible = members.length - 1;
    const last = Math.min(today, days - 1);
    const streaks = {};
    for (let d = 0; d <= last; d++) {
      for (const m of members) {
        for (const h of m.habits) {
          const k = m.id + '|' + h.id;
          const e = byKey[m.id + '|' + h.id + '|' + d];
          if (e) {
            const votes = votesBy[e.id] || [];
            const sus = votes.length ? susVerdict(votes, eligible) : null;
            const fake = sus && sus.verdict === 'fake';
            const streak = fake ? 0 : (streaks[k] || 0);
            const reacts = {}, mine = {};
            for (const r of reactsBy[e.id] || []) { reacts[r.emoji] = (reacts[r.emoji] || 0) + 1; if (r.user_id === me) mine[r.emoji] = true; }
            lg.log.push({ id: e.id, day: d, member: m.id, habit: h.id, kind: fake ? 'fake' : 'proof',
              points: fake ? SCORING.FAKE : SCORING.PROOF + Math.min(SCORING.STREAK_CAP, streak * SCORING.STREAK_STEP),
              streak: streak + 1, reacts, mine, sus: sus && { by: votes[0].voter_id, yes: sus.yes, no: sus.no, verdict: sus.verdict },
              myVote: votes.find(v => v.voter_id === me) || null, photo: e.photo_path, challenge: e.challenge, t: Date.parse(e.created_at) });
            streaks[k] = fake ? 0 : streak + 1;
          } else if (d < today) {
            lg.log.push({ id: 'miss_' + k + '_' + d, day: d, member: m.id, habit: h.id, kind: 'miss', points: SCORING.MISS, reacts: {}, t: startMs + (d + 1) * 864e5 - 1 });
            streaks[k] = 0;
          }
        }
      }
      if ((d + 1) % 7 === 0 && d < today) {
        const w = Math.floor(d / 7);
        for (const [a, b] of lg.schedule[w] || []) {
          lg.log.push({ id: 'res_' + w + a + b, day: d, kind: 'result', week: w, a, b, pa: points(lg, a, w), pb: points(lg, b, w), reacts: {}, t: startMs + (d + 1) * 864e5 });
        }
      }
    }
    for (const e of data.entries) {
      if (e.kind !== 'chat') continue;
      const reacts = {}, mine = {};
      for (const r of reactsBy[e.id] || []) { reacts[r.emoji] = (reacts[r.emoji] || 0) + 1; if (r.user_id === me) mine[r.emoji] = true; }
      lg.log.push({ id: e.id, day: Math.max(0, Math.floor((Date.parse(e.created_at) - startMs) / 864e5)), kind: 'chat', member: e.user_id, text: e.body, reacts, mine, t: Date.parse(e.created_at) });
    }
    lg.log.sort((x, y) => x.t - y.t);
    for (const p of data.punishments || []) {
      const pv = (data.punishmentVotes || []).filter(v => v.punishment_id === p.id);
      const yes = pv.filter(v => v.yes).length;
      lg.custom.push({ id: p.id, text: p.text, tier: p.tier, by: p.proposed_by, yes, no: pv.length - yes,
        approved: yes > members.length / 2, myVote: (pv.find(v => v.voter_id === me) || {}).yes });
    }
    lg.custom = lg.custom.filter(c => c.approved || c.yes + c.no < members.length).map(c => c);
    return lg;
  }

  // Approved custom punishments only (pending ones show up for voting but don't enter the wheel).
  function cloudPool(lg, tier) {
    const t = tier || lg.tier;
    return PUNISHMENTS[t].items.concat(lg.custom.filter(c => c.tier === t && c.approved).map(c => c.text));
  }
  function screenPunishment(text) {
    text = String(text || '').trim();
    if (text.length < 4) return 'Describe the punishment.';
    if (text.length > 120) return 'Keep it under 120 characters.';
    if (BANNED.test(text)) return 'Punishments stay safe, legal and inside the group.';
    const money = text.match(MONEY);
    if (money && Number(money[1]) > MONEY_CAP) return `Nothing over $${MONEY_CAP}.`;
    return null;
  }

  return {
    SCORING, PUNISHMENTS, TIER_ORDER, BOTS, MAX_HABITS, MONEY_CAP,
    create, roundRobin, prove, endDay, sus, react, points, matchup, standings, pool, addCustom, finish, veto, markServed,
    fromCloud, susVerdict, cloudPool, screenPunishment,
    member, weekOf, streakBefore
  };
});
