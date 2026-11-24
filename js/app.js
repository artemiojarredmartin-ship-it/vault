/* Vault — app logic.
 * One state object (see js/core.js for the rules), one render() per change,
 * event delegation on document. Time-based transitions run through Core.tick.
 */
(function () {
  'use strict';

  const { HOUR, DAY, MIN, RULES, TIERS } = Core;

  let state = Storage.load();
  const ui = {
    tab: 'today',
    sheet: null,            // { kind: 'prove-bet'|'prove-redemption'|'redeem', id, shot?, cameraError? }
    vaultHistory: false,
    betFilter: 'active',
    deadlinePick: '24h',
    away: []            // locks/decays that happened since the last visit
  };

  const app = document.getElementById('app');
  const sheetRoot = document.getElementById('sheet-root');
  const TABS = ['league', 'today', 'prove', 'bets', 'vault', 'ledger', 'learn', 'settings'];

  // ---------- time (supports the testing "time machine") ----------
  function now() { return Date.now() + (state.settings.clockOffset || 0); }

  function commit() { Storage.save(state); render(); }

  function tickAndMaybeRender() {
    const events = Core.tick(state, now());
    if (events.length) {
      Storage.save(state);
      handleEvents(events);
      render();
    }
    return events;
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtCredits(n) { return (Math.round(n * 100) / 100).toLocaleString(); }
  function fmtWhen(ms) {
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date(now()).getFullYear();
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', year: sameYear ? undefined : 'numeric' });
  }
  function fmtDur(ms) {
    const neg = ms < 0; ms = Math.abs(ms);
    const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN), s = Math.floor((ms % MIN) / 1000);
    let out;
    if (d > 0) out = `${d}d ${h}h`;
    else if (h > 0) out = `${h}h ${m}m`;
    else if (m > 0) out = `${m}m ${s}s`;
    else out = `${s}s`;
    return neg ? out + ' ago' : out;
  }
  function countdown(deadline, label = 'left') {
    const left = deadline - now();
    const cls = left < HOUR ? 'urgent' : left < 6 * HOUR ? 'soon' : '';
    return `<span class="countdown ${cls}" data-countdown="${deadline}" data-label="${esc(label)}">${left < 0 ? 'overdue' : fmtDur(left) + ' ' + label}</span>`;
  }
  function measureText(m) {
    if (!m || m.kind === 'binary') return 'once';
    return `${m.amount} ${m.unit}`;
  }
  function tierPill(t) { return `<span class="pill ${t >= 1 ? 'accent' : ''}">${esc(TIERS[t].name)} proof</span>`; }
  function chances(n, total = RULES.CHANCES) {
    let s = '<span class="chances" title="' + n + ' of ' + total + ' chances left">';
    for (let i = 0; i < total; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
    return s + '</span>';
  }
  function toLocalInput(ms) {
    const d = new Date(ms); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function endOfToday() { const d = new Date(now()); d.setHours(23, 59, 0, 0); return d.getTime(); }
  function quickDeadline(key) {
    const t = now();
    return ({ tonight: endOfToday(), '1h': t + HOUR, '24h': t + 24 * HOUR, '3d': t + 3 * DAY, '7d': t + 7 * DAY })[key];
  }
  function todaysPrompt() { return Content.PROMPTS[Math.floor(now() / DAY) % Content.PROMPTS.length]; }

  let toastTimer;
  function toast(msg, kind = '') {
    const el = document.getElementById('toast');
    el.hidden = true; void el.offsetWidth; // restart the slide-in
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }

  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------- chips ----------
  function chipIco(cls = 'chip-ico') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1c1e22" stroke="#4a4f56" stroke-width=".6"/><circle cx="12" cy="12" r="9.6" fill="none" stroke="#c9ced5" stroke-width="2.6" stroke-dasharray="2.5 5.04"/><circle cx="12" cy="12" r="6.4" fill="#26292e" stroke="#8e949c" stroke-width=".7"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#c9ced5" stroke-width=".9"/></svg>`;
  }
  function amt(n, small) { return `<span class="amt${small ? ' small' : ''}">${chipIco()}${fmtCredits(n)}</span>`; }
  function chipstack(n, color) {
    if (!(n > 0)) return '<div class="chipstack empty" aria-hidden="true"></div>';
    const count = Math.min(6, Math.max(1, Math.ceil(Math.log2(n + 1))));
    return `<div class="chipstack" aria-hidden="true" style="--c:${color}">${'<i></i>'.repeat(count)}</div>`;
  }

  // ---------- animated numbers ----------
  const shownCounts = {};
  function countUp(el, from, to, dur) {
    if (reducedMotion() || from === to) { el.textContent = fmtCredits(to); return; }
    const t0 = performance.now();
    el.textContent = fmtCredits(from);
    (function step(t) {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? fmtCredits(Math.round(from + (to - from) * e)) : fmtCredits(to);
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    })(t0);
  }
  function animateCounts() {
    const next = {};
    document.querySelectorAll('[data-count-key]').forEach(el => {
      const key = el.dataset.countKey, to = Number(el.dataset.count);
      const from = key in shownCounts ? shownCounts[key] : to;
      if (from !== to) { el.classList.add(to > from ? 'up' : 'down'); countUp(el, from, to, 800); }
      next[key] = to;
    });
    Object.assign(shownCounts, next);
  }

  // ---------- sound (quiet, synthesized, only after a tap) ----------
  const Sfx = (() => {
    let ctx = null;
    function ac() {
      if (state.settings.sound === false) return null;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { if (!ctx) ctx = new C(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { return null; }
      return ctx;
    }
    function blip(c, freq, at, dur, type, vol) {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function clack(c, at, vol) {
      const len = Math.floor(c.sampleRate * 0.03), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 1.3; g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(c.destination); src.start(c.currentTime + at);
    }
    return {
      chip() { const c = ac(); if (c) { clack(c, 0, .45); clack(c, .04, .3); } },
      stake() { const c = ac(); if (c) [0, .06, .12, .17].forEach((t, i) => clack(c, t, .45 - i * .08)); },
      win() { const c = ac(); if (!c) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(c, f, i * .09, .55, 'triangle', .06)); [0, .07, .14, .21, .28, .35].forEach(t => clack(c, .3 + t, .28)); },
      lock() { const c = ac(); if (!c) return; clack(c, 0, .5); blip(c, 170, 0, .2, 'sine', .12); blip(c, 104, .14, .45, 'sine', .14); clack(c, .14, .4); },
      rankUp() { const c = ac(); if (!c) return; [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => blip(c, f, i * .07, .6, 'sine', .05)); }
    };
  })();

  // ---------- big moments ----------
  const DIAL = `<svg class="vault-dial" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="#e0b85c" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="#e0b85c"/><path d="M32 6v12M32 46v12M6 32h12M46 32h12" stroke="#e0b85c" stroke-width="4" stroke-linecap="round"/></svg>`;
  function payout({ kicker, amount, sub, kind = 'win' }) {
    document.querySelectorAll('.payout').forEach(p => p.remove());
    const el = document.createElement('div');
    el.className = 'payout ' + kind; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="payout-card">${kind === 'lock' ? DIAL : ''}<div class="payout-kicker">${esc(kicker)}</div>
      <div class="payout-amt">${kind === 'win' ? '+' : ''}${chipIco()}<span>${fmtCredits(amount)}</span></div>
      <div class="payout-sub">${esc(sub)}</div></div>`;
    document.body.appendChild(el);
    countUp(el.querySelector('.payout-amt span'), 0, amount, 900);
    const close = () => { if (!el.isConnected || el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 350); };
    el.addEventListener('click', close);
    setTimeout(close, kind === 'lock' ? 2600 : 2200);
  }

  function handleEvents(events) {
    let shown = false;
    for (const ev of events) {
      if (ev.type === 'locked') {
        if (!shown) { payout({ kind: 'lock', kicker: 'Locked, not lost', amount: ev.bet.stake, sub: `"${ev.bet.title}" missed. ${RULES.CHANCES} chances to earn it back.` }); Sfx.lock(); shown = true; }
        else toast(`"${ev.bet.title}" missed. ${ev.bet.stake} chips are in the Vault, not gone.`, 'lock');
      }
      if (ev.type === 'lost') { toast(`"${ev.bet.title}" missed. ${ev.bet.stake} chips lost.`, 'lock'); Sfx.lock(); }
      if (ev.type === 'decayed') toast(`${fmtCredits(ev.entry.amount)} chips went to ${ev.entry.destination}.`, 'lock');
    }
  }

  // ---------- routing ----------
  function setTab(tab) {
    const jm = /^join=([A-Za-z0-9]{4,8})$/.exec(tab || '');
    if (jm) { cloud.joinCode = jm[1].toUpperCase(); ui.lgMode = null; tab = 'league'; if (cloud.ready) loadPreview(); }
    ui.tab = TABS.includes(tab) ? tab : 'today';
    if (location.hash !== '#' + ui.tab) history.replaceState(null, '', '#' + ui.tab);
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.nav === ui.tab));
    if (ui.tab === 'prove' && !ui.sheet) {
      Core.tick(state, now());
      const due = dueItems();
      if (due.length === 1) ui.sheet = { kind: due[0].kind, id: due[0].item.id };
    }
    render(); window.scrollTo({ top: 0 });
  }

  // Everything that can be proved right now, soonest deadline first.
  function dueItems() {
    const bets = state.bets.filter(b => b.status === 'active').map(item => ({ kind: 'prove-bet', item }));
    const reds = state.redemptions.filter(r => r.status === 'active').map(item => ({ kind: 'prove-redemption', item }));
    return bets.concat(reds).sort((a, b) => a.item.deadline - b.item.deadline);
  }
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  // ---------- render ----------
  function render() {
    Core.tick(state, now());
    const views = { today, prove, bets, league, vault, ledger, learn, settings };
    const onboarding = needsSetup();
    document.body.classList.toggle('onboarding', onboarding);
    if (onboarding) { app.innerHTML = welcome(); sheetRoot.innerHTML = ''; afterRender(); return; }
    if (ui.tab !== 'league' && cloud.current) { Cloud.unsubscribe(); cloud.current = null; cloud.data = null; }
    app.innerHTML = views[ui.tab]();
    sheetRoot.innerHTML = ui.sheet ? sheet() : '';
    document.body.style.overflow = ui.sheet ? 'hidden' : '';
    const w = state.wallet.credits;
    document.getElementById('wallet-pill').innerHTML = `${chipIco()}<span class="num" data-count="${w}" data-count-key="hdr">${fmtCredits(w)}</span>`;
    const r = Core.rank(state);
    if (ui.lastLevel && r.level > ui.lastLevel) { toast(`Rank up: ${r.name}`, 'win'); Sfx.rankUp(); }
    ui.lastLevel = r.level;
    afterRender();
  }

  function balancesBlock(extra = '') {
    const b = Core.balances(state);
    const slot = (cls, key, v, label, color) => `<div class="slot ${cls}">${chipstack(v, color)}
      <div class="num" data-count="${v}" data-count-key="${key}">${fmtCredits(v)}</div><div class="label">${label}</div></div>`;
    return `<div class="felt"><div class="balances">
      ${slot('wallet', 'wallet', b.wallet, 'Wallet', '#c9ced5')}
      ${slot('stake', 'stake', b.atStake, 'On the table', '#5a6068')}
      ${slot('vault', 'vault', b.inVault, 'In the Vault', '#b89b6a')}
    </div>${extra}</div>`;
  }

  function rankBar() {
    const r = Core.rank(state);
    return `<div class="rankbar">
      <div class="top"><span><span class="rank-lvl">Lv ${r.level}</span><span class="rank-name">${esc(r.name)}</span></span>
        <span class="label">${r.next ? `${r.toNext} win${r.toNext === 1 ? '' : 's'} to ${esc(r.next)}` : 'Top rank'}</span></div>
      <div class="xp" role="progressbar" aria-label="Progress to next rank" aria-valuenow="${Math.round(r.progress * 100)}" aria-valuemin="0" aria-valuemax="100"><div data-xp="${Math.round(r.progress * 100)}"></div></div>
    </div>`;
  }

  function betCard(b, opts = {}) {
    const t = now();
    const canCancel = b.status === 'active' && t - b.createdAt <= RULES.COOLING_OFF_MS;
    const proof = b.proofIds.length ? state.proofs.find(p => p.id === b.proofIds[b.proofIds.length - 1]) : null;
    const entry = Core.entryForBet(state, b.id);
    const stampText = { won: 'Kept', locked: 'Locked', cancelled: 'Void' }[b.status];
    const foot = b.status === 'active' ? `
        <button class="primary" data-action="open-prove-bet" data-id="${b.id}">Prove it</button>
        ${canCancel ? `<button class="ghost" data-action="cancel-bet" data-id="${b.id}">Cancel (${fmtDur(RULES.COOLING_OFF_MS - (t - b.createdAt))} left)</button>` : ''}
        ${!canCancel && !b.extended && state.grace.tokens > 0 ? `<button class="ghost" data-action="extend-bet" data-id="${b.id}" title="Spend a grace token">+24h grace</button>` : ''}
        ${b.extended ? '<span class="pill">extended</span>' : ''}`
      : entry && entry.status === 'locked' && opts.redeemButton !== false ? `<button data-action="nav" data-tab="vault">Open in Vault</button>` : '';
    return `<div class="card bet-card ${b.status}" data-bet="${b.id}">
      <div class="slip-body">
        <div class="top">
          <div><div class="title">${esc(b.title)}</div>${b.why ? `<div class="small muted">${esc(b.why)}</div>` : ''}</div>
          ${amt(b.stake)}
        </div>
        <div class="meta">
          ${b.status === 'active' ? '<span class="pill accent"><span class="status-dot"></span>Live</span>' : ''}
          ${tierPill(b.proofTier)}
          <span>${esc(measureText(b.measure))}</span>
          ${b.status === 'active' ? `<span>· due ${esc(fmtWhen(b.deadline))} · ${countdown(b.deadline)}</span>` : `<span>· ${esc(fmtWhen(b.resolvedAt || b.deadline))}</span>`}
          ${stampText ? `<span class="stamp ${b.status}">${stampText}</span>` : ''}
        </div>
        ${b.status === 'active' && b.proofTier >= 1 ? `<div class="small muted">Proof: a live photo of a random ${esc(Content.challengeCategory(b.title).label.toLowerCase())} challenge, revealed when you tap Prove it.</div>` : ''}
        ${proof && proof.mediaKey ? `<img class="thumb" data-media="${proof.mediaKey}" alt="proof photo">` : ''}
        ${entry && b.status === 'locked' ? `<div class="small muted">Vault: ${fmtCredits(entry.amount)} locked · ${chances(entry.chancesLeft)} · ${entry.status === 'locked' ? 'decays ' + countdown(entry.decaysAt, 'from now') : entry.status}</div>` : ''}
      </div>
      ${foot ? `<div class="slip-foot">${foot}</div>` : ''}
    </div>`;
  }

  function entryCard(e, full = true) {
    const bet = Core.betById(state, e.betId);
    const red = Core.activeRedemptionFor(state, e.id);
    const past = state.redemptions.filter(r => r.vaultEntryId === e.id && r.status !== 'active');
    const canRedeem = e.status === 'locked' && e.chancesLeft > 0 && !red;
    return `<div class="card entry-card ${e.status}" data-entry="${e.id}">
      <div class="top row spread">
        <div><div class="title"><strong>${esc(bet.title)}</strong></div>
          <div class="small muted">Locked ${esc(fmtWhen(e.lockedAt))} · originally ${fmtCredits(e.originalAmount)} cr</div></div>
        ${amt(e.amount)}
      </div>
      <div class="meta mt">
        <span class="pill ${e.status === 'locked' ? 'partial' : e.status === 'redeemed' ? 'done' : 'missed'}">${e.status}</span>
        ${e.status === 'locked' ? `<span>${chances(e.chancesLeft)} ${e.chancesLeft} chance${e.chancesLeft === 1 ? '' : 's'}</span><span>· decays in ${countdown(e.decaysAt, '')}</span>` : ''}
        <span>· to ${esc(e.destination)}</span>
      </div>
      ${red ? `<div class="card soft mt">
        <div class="row spread"><strong>Redemption: ${esc(red.title)}</strong>${amt(e.amount, true)}</div>
        <div class="meta"><span>${esc(measureText(red.measure))}</span>${tierPill(red.proofTier)}<span>· harder by ${red.harderBy.join(', ')}</span><span>· ${countdown(red.deadline)}</span></div>

        <div class="row mt"><button class="primary" data-action="open-prove-redemption" data-id="${red.id}">Prove it</button></div>
      </div>` : ''}
      ${canRedeem ? `<div class="row mt"><button class="primary" data-action="open-redeem" data-id="${e.id}">Earn it back</button></div>` : ''}
      ${e.status === 'locked' && e.chancesLeft === 0 && !red ? `<p class="small muted mt">No chances left. ${fmtCredits(e.amount)} chips go to ${esc(e.destination)} when the timer ends.</p>` : ''}
      ${full ? `
        ${past.length ? `<details class="mt"><summary>${past.length} past attempt${past.length === 1 ? '' : 's'}</summary>
          ${past.map(r => `<div class="small mt"><span class="pill ${r.status === 'succeeded' ? 'done' : r.status === 'partial' ? 'partial' : 'missed'}">${r.status}</span> ${esc(r.title)} · ${esc(measureText(r.measure))}${r.unlocked ? ` · unlocked ${fmtCredits(r.unlocked)}` : ''}</div>`).join('')}
        </details>` : ''}
        <label class="mt">What got in the way? <span class="hint">Describe, don't judge. This is for you.</span>
          <textarea data-action="wgitw" data-id="${e.id}" rows="2" placeholder="e.g. Practice ran late and I didn't have a shorter version planned.">${esc(e.whatGotInTheWay)}</textarea>
        </label>` : ''}
    </div>`;
  }

  // ---------- cinematic intro ----------
  // The Blender film plays INSIDE the home hero, start to finish, untouched. When its last
  // frame lands it simply stays there (that frame is the hero), and only the headline,
  // button and cards fade in around it. No overlay, no swap, so nothing can jump.
  const HERO_V = 8;
  const intro = { video: null, phase: 'off' }; // off | playing | done
  function playIntro() {
    let seen = false; try { seen = sessionStorage.getItem('vault.intro') === '1'; } catch (e) { /* private mode */ }
    if (seen || reducedMotion() || ui.tab !== 'league' || needsSetup()) return;
    try { sessionStorage.setItem('vault.intro', '1'); } catch (e) { /* ignore */ }
    window.scrollTo({ top: 0 });
    const big = (screen.width * (devicePixelRatio || 1)) >= 2200 && !(navigator.connection && navigator.connection.saveData);
    const v = document.createElement('video');
    v.className = 'hstill-film'; v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.src = `assets/hero/${big ? 'intro-4k' : 'intro-1080'}.mp4?v=${HERO_V}`;
    intro.video = v; intro.phase = 'playing';
    document.body.classList.add('intro-on');
    const skip = document.createElement('button');
    skip.className = 'intro-skip'; skip.type = 'button'; skip.textContent = 'Skip';
    document.body.appendChild(skip);
    let safety;
    const done = (jump) => {
      if (intro.phase !== 'playing') return; intro.phase = 'done'; clearTimeout(safety);
      if (jump && v.duration) { v.pause(); v.currentTime = v.duration; } // Skip: jump to the final frame
      skip.remove();
      document.body.classList.remove('intro-on'); document.body.classList.add('intro-reveal');
      setTimeout(() => document.body.classList.remove('intro-reveal'), 5000);
    };
    v.addEventListener('ended', () => done(false));
    v.addEventListener('error', () => done(true));
    skip.addEventListener('click', () => done(true));
    safety = setTimeout(() => done(true), 15000); // very slow network: never trap anyone
    // start only once it can play straight through, so every frame is shown
    v.addEventListener('canplaythrough', () => {
      if (intro.phase !== 'playing') return;
      clearTimeout(safety); safety = setTimeout(() => done(true), ((v.duration || 4) + 3) * 1000);
      const p = v.play(); if (p && p.catch) p.catch(() => done(true));
    }, { once: true });
    mountIntro();
  }
  // Called after every render: keep the one film element inside whatever hero is on screen
  function mountIntro() {
    const v = intro.video; if (!v) return;
    const box = app.querySelector('.hstill-media');
    if (!box) { if (intro.phase === 'playing') { v.pause(); } return; }
    if (v.parentNode !== box) {
      box.appendChild(v);
      if (intro.phase === 'playing' && v.readyState >= 4) v.play().catch(() => {});
      else if (intro.phase === 'done' && v.duration && !v.ended && v.paused) v.currentTime = v.duration;
    }
  }

  // Home hero: the intro's final frame, so the fade-in is seamless
  function heroStill() {
    const solo = (state.settings.profile || {}).mode === 'solo';
    const cta = solo ? 'data-action="hero-solo"' : 'data-action="hero-start"';
    const label = solo ? 'Place my first bet' : 'Start a league';
    const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const card = (d, icon, title, text) => `<div class="glass anim" style="--d:${d}s">${ico(icon)}<strong>${title}</strong><span>${text}</span></div>`;
    return `<section class="hstill" aria-label="Vault">
      <div class="hstill-media" aria-hidden="true"><img class="hstill-bg" srcset="assets/hero/final-1920.jpg?v=${HERO_V} 1920w, assets/hero/final-4k.jpg?v=${HERO_V} 3840w" sizes="100vw" src="assets/hero/final-1920.jpg?v=${HERO_V}" alt=""></div>
      <div class="hstill-copy">
        <div class="eyebrow anim" style="--d:.15s">Fantasy football for your habits</div>
        <h1 class="hero-title anim" style="--d:.25s">Bet on your habits.<br>Don’t finish last.</h1>
        <p class="hero-sub anim" style="--d:.37s">Start a league with friends, put chips on the habits you want to stick to, and prove it every day. Fewest chips at the end does the consequence you all agreed on.</p>
        <div class="anim" style="--d:.49s"><button class="hero-cta" ${cta}>${label}</button></div>
        <p class="no-money anim" style="--d:.6s">Chips only. No real money. Ever.</p>
      </div>
      <div class="hstill-cards">
        ${card(0.7, '<path d="M8 11V6a4 4 0 0 1 8 0v5"/><rect x="5" y="11" width="14" height="10" rx="2"/>', 'Agree on the stakes', 'Your group votes on the loser’s consequence before day one.')}
        ${card(0.82, '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v4c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 11v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/>', 'Bet your chips', '10 chips a day across your habits. Miss one, lose its chips.')}
        ${card(0.94, '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 'Prove it daily', 'A live photo challenge each day. Friends can call sus.')}
      </div>
    </section>`;
  }

  // ---------- hero (pure CSS 3D chips) ----------
  function heroHtml(cta, alt) {
    const chip3 = (top) => `<div class="c3" style="top:${top}px"><div class="bot"></div><div class="side"></div><div class="top"></div></div>`;
    const layers = Array.from({ length: 9 }, (_, i) => `<div class="hc-layer" style="transform:translateZ(${-(i + 1) * 1.6}px)"></div>`).join('');
    const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const card = (d, icon, title, text) => `<div class="glass anim" style="--d:${d}s">${ico(icon)}<strong>${title}</strong><span>${text}</span></div>`;
    return `<section class="hero-card" aria-label="Vault">
      <div class="hero-copy">
        <div class="eyebrow anim" style="--d:.4s">Fantasy football for your habits</div>
        <h1 class="hero-title anim" style="--d:.5s">Bet on your habits.<br>Don’t finish last.</h1>
        <p class="hero-sub anim" style="--d:.62s">Start a league with friends, put chips on the habits you want to stick to, and prove it every day. Fewest chips at the end does the consequence you all agreed on.</p>
        <div class="anim" style="--d:.74s"><button class="hero-cta" ${cta}>Start a league</button>${alt || ''}</div>
        <p class="no-money anim" style="--d:.86s">Chips only. No real money. Ever.</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="spot"></div>
        <div class="chipstack3d">${chip3(54)}${chip3(36)}${chip3(18)}${chip3(0)}</div>
        <div class="hc-drop"><div class="hc-bob"><div class="hc-tilt"><div class="hc-spin">${layers}<div class="hc-face"></div><div class="hc-shine"></div></div></div></div></div>
      </div>
      <div class="hero-cards">
        ${card(1.0, '<path d="M8 11V6a4 4 0 0 1 8 0v5"/><rect x="5" y="11" width="14" height="10" rx="2"/>', 'Agree on the stakes', 'Your group votes on the loser’s consequence before day one.')}
        ${card(1.15, '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v4c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 11v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/>', 'Bet your chips', '10 chips a day across your habits. Miss one, lose its chips.')}
        ${card(1.3, '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 'Prove it daily', 'A live photo challenge each day. Friends can call sus.')}
      </div>
    </section>`;
  }

  // ---------- setup flow (new users) ----------
  const ob = { step: 0, name: '', goals: [], mode: null, level: null };
  function myIdeas() { const p = state.settings.profile || {}; return Content.suggestionsFor(p.goals || [], p.level || 'steady'); }
  function welcome() {
    const steps = 5, dots = Array.from({ length: steps }, (_, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('');
    const top = `<div class="ob-top"><div class="ob-dots" aria-hidden="true">${dots}</div>${ob.step ? '<button class="ghost sm" data-action="ob-back">Back</button>' : '<span></span>'}</div>`;
    const opt = (action, value, label, sub, on) => `<button class="ob-opt ${on ? 'on' : ''}" data-action="${action}" data-v="${value}"><strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}</button>`;
    let body = '';
    if (ob.step === 0) body = `<div class="eyebrow">Welcome to Vault</div><h1 class="ob-q">What should we call you?</h1>
      <form data-form="ob-name" class="ob-form"><input name="name" maxlength="30" autocomplete="given-name" placeholder="Your first name" value="${esc(ob.name || state.settings.name || '')}" required>
      <button class="primary big-cta" type="submit">Continue</button></form>`;
    else if (ob.step === 1) body = `<div class="eyebrow">Hey ${esc(ob.name)}</div><h1 class="ob-q">What do you want to get better at?</h1><p class="muted">Pick up to 3.</p>
      <div class="ob-grid">${Content.GOALS.map(g => opt('ob-goal', g.id, g.label, '', ob.goals.includes(g.id))).join('')}</div>
      <button class="primary big-cta" data-action="ob-next" ${ob.goals.length ? '' : 'disabled'}>Continue</button>`;
    else if (ob.step === 2) body = `<div class="eyebrow">Your style</div><h1 class="ob-q">How do you want to play?</h1>
      <div class="ob-list">${opt('ob-mode', 'friends', 'With friends', 'A league. Weekly matchups. Fewest chips does the consequence.', ob.mode === 'friends')}
        ${opt('ob-mode', 'solo', 'Solo', 'Just me. Bet chips on myself and keep my streak.', ob.mode === 'solo')}
        ${opt('ob-mode', 'both', 'Both', 'A league with friends, plus my own solo bets.', ob.mode === 'both')}</div>`;
    else if (ob.step === 3) body = `<div class="eyebrow">Intensity</div><h1 class="ob-q">How hard should it hit?</h1>
      <div class="ob-list">${Content.LEVELS.map(l => opt('ob-level', l.id, l.label, l.sub, ob.level === l.id)).join('')}</div>`;
    else {
      const ideas = Content.suggestionsFor(ob.goals, ob.level).slice(0, Math.min(3, ob.goals.length + 1));
      body = `<div class="eyebrow">Your plan</div><h1 class="ob-q">Here's where you start, ${esc(ob.name)}.</h1>
        <div class="ob-plan">${ideas.map((h, i) => `<div class="ob-habit anim" style="--d:${0.1 + i * 0.12}s"><span>${esc(h)}</span><span class="chips-tag">daily</span></div>`).join('')}</div>
        <p class="muted small">You can change these anytime. ${ob.mode === 'solo' ? 'Bet chips on yourself and prove it before the deadline.' : 'Your league splits 10 chips a day across habits like these.'}</p>
        <button class="primary big-cta" data-action="ob-finish">${ob.mode === 'solo' ? 'Place my first bet' : 'Start my league'}</button>
        <p class="no-money">Chips only. No real money. Ever.</p>`;
    }
    return `<section class="ob" aria-live="polite">${top}<div class="ob-body anim" style="--d:0s" key="${ob.step}">${body}</div>
      <button class="ob-skip" data-action="ob-skip">Skip setup</button></section>`;
  }
  function needsSetup() { return !state.settings.profile && !state.settings.setupSkipped; }
  function finishSetup(skip) {
    state.settings.onboarded = true;
    if (skip) state.settings.setupSkipped = true;
    if (!skip) {
      state.settings.profile = { goals: ob.goals.slice(), mode: ob.mode || 'friends', level: ob.level || 'steady' };
      if (ob.name) state.settings.name = ob.name;
    }
    Storage.save(state);
    ui.lgMode = null; cloud.current = null;
    setTab('league');
    window.scrollTo({ top: 0 });
    playIntro(); // the cinematic reveal, straight after the setup questions
  }

  // ---------- views ----------
  function today() {
    const t = now();
    const active = state.bets.filter(b => b.status === 'active').sort((a, b) => a.deadline - b.deadline);
    const locked = state.vault.filter(e => e.status === 'locked');
    const st = Core.stats(state);
    const name = state.settings.name;
    const h = new Date(t).getHours();
    const greet = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (name ? ', ' + esc(name) : '');

    const promptCard = `<div class="card soft mt prompt-card"><span class="suit" aria-hidden="true">♦</span><div><div class="eyebrow">Today's prompt</div><p class="mb0">${esc(todaysPrompt())}</p></div></div>`;

    if (!state.bets.length) {
      return `<div class="page-head"><div><h1>${greet}</h1><p class="muted">${fmtCredits(state.wallet.credits)} chips. Bet on yourself.</p></div></div>
        <div class="card solo-intro"><h2>Solo mode</h2>
          <p class="muted">Bet chips on yourself. Prove it before the deadline and keep them. Miss it and they're gone.</p>
          <div class="row"><button class="primary" data-action="nav" data-tab="bets">Place a bet</button><button class="ghost" data-action="nav" data-tab="league">Play with friends instead</button></div></div>
        ${promptCard}`;
    }

    const score = (k, v, hot) => `<div class="score${hot ? ' hot' : ''}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    const tokens = `<span class="tokens" title="Earn one every 3 wins in a row. Spend one to extend a bet 24h.">${Array.from({ length: RULES.GRACE_MAX }, (_, i) => `<i class="${i < state.grace.tokens ? 'on' : ''}"></i>`).join('')}</span>`;

    return `<div class="page-head"><div><h1>${greet}</h1><p class="muted">${esc(new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p></div>
        <button class="primary" data-action="nav" data-tab="bets">New bet</button></div>
      ${balancesBlock(rankBar())}
      ${state.wallet.credits < 5 && !active.length ? `<div class="card mt row spread"><span>Out of chips. They're free, so start fresh.</span><button class="primary sm" data-action="refill">Refill to 100</button></div>` : ''}
      <div class="scoreboard">
        ${score('Win rate', st.winRate == null ? '—' : st.winRate + '%')}
        ${score(st.streak >= 3 ? 'Hot streak' : 'Streak', st.streak >= 3 ? '×' + st.streak : st.streak, st.streak >= 3)}
        ${score('Grace', tokens)}
        ${score('Kept', amt(st.saved, true))}
        ${st.everLocked ? score('Won back', st.recoveryRate + '%') : ''}
      </div>
      ${ui.away.length ? `<div class="card mt" style="border-color:var(--partial)">
        <div class="row spread"><h2 class="mb0">While you were away</h2><button class="sm ghost" data-action="dismiss-away">Dismiss</button></div>
        ${ui.away.map(a => a.type === 'locked'
          ? `<p class="mb0 mt">"<strong>${esc(a.title)}</strong>" missed. <strong>${fmtCredits(a.amount)}</strong> chips are in the Vault, not gone. ${a.chances} chances to earn them back.</p>`
          : `<p class="mb0 mt">"<strong>${esc(a.title)}</strong>" decayed. ${fmtCredits(a.amount)} chips went to ${esc(a.destination)}.</p>`).join('')}
        ${ui.away.some(a => a.type === 'locked') ? `<div class="row mt"><button class="primary" data-action="nav" data-tab="vault">Earn it back</button></div>` : ''}
      </div>` : ''}
      <div class="section-title"><h2>On the table</h2><span class="count-badge">${active.length}</span></div>
      ${active.length ? `<div class="stack">${active.map(b => betCard(b)).join('')}</div>` : `<div class="card soft"><p class="mb0">No active bets. ${locked.length ? 'Your Vault has something to earn back.' : 'Place one while you mean it.'}</p></div>`}

      ${locked.length ? `<div class="section-title"><h2>In the Vault</h2>${amt(locked.reduce((n, e) => n + e.amount, 0), true)}</div>
        <div class="stack">${locked.map(e => entryCard(e, false)).join('')}</div>` : ''}

      ${promptCard}`;
  }

  function clearPrefill() { ui.prefillBet = null; }
  function prove() {
    const due = dueItems();
    if (!due.length) {
      return `<div class="page-head"><div><h1>Prove it</h1><p class="muted">Nothing due right now.</p></div></div>
        <div class="felt intro"><h2>All clear</h2><p class="muted">No active bets or comebacks. Put something on the table.</p>
          <button class="primary big-cta" data-action="nav" data-tab="bets">Place a bet</button></div>`;
    }
    return `<div class="page-head"><div><h1>Prove it</h1><p class="muted">Pick one. Follow the challenge. Done.</p></div></div>
      <div class="stack">${due.map(({ kind, item }) => `<button class="quick-prove" data-action="${kind === 'prove-bet' ? 'open-prove-bet' : 'open-prove-redemption'}" data-id="${item.id}">
          <span class="qp-main"><span class="qp-title">${esc(item.title)}</span>
            <span class="small muted">${kind === 'prove-bet' ? 'Bet' : 'Comeback'} · ${countdown(item.deadline)}</span></span>
          ${kind === 'prove-bet' ? amt(item.stake) : ''}
          <span class="qp-go" aria-hidden="true">›</span>
        </button>`).join('')}</div>`;
  }

  function bets() {
    const t = now();
    const filters = ['active', 'won', 'locked', 'cancelled', 'all'];
    const list = state.bets.filter(b => ui.betFilter === 'all' || b.status === ui.betFilter).sort((a, b) => (b.createdAt - a.createdAt));
    const dl = ui.deadlinePick === 'custom' ? (ui.customDeadline || t + 24 * HOUR) : quickDeadline(ui.deadlinePick);
    const defaultTier = 1;
    return `<div class="page-head"><div><h1>Bets</h1><p class="muted">Small enough to do on a bad day. Clear enough to prove.</p></div></div>
      ${balancesBlock()}
      <div class="card mt">
        <h2>Place a bet</h2>
        <div class="quick" style="margin-bottom:.75rem">${Content.TEMPLATES.map((tpl, i) => `<button type="button" class="sm" data-action="template" data-i="${i}">${esc(tpl.label)}</button>`).join('')}</div>
        <form data-form="bet">
          <label>What will you do? <input name="title" required maxlength="120" placeholder="e.g. Run 5 km" autocomplete="off" value="${esc(ui.prefillBet || '')}"></label>
          <label>Proof
            <select name="proofTier" data-action="tier-change">
              <option value="0">Honor · max ${RULES.MAX_STAKE_BY_TIER[0]}</option>
              <option value="1" selected>Live photo · max ${RULES.MAX_STAKE_BY_TIER[1]}</option>
              <option value="2" disabled>Partner · max ${RULES.MAX_STAKE_BY_TIER[2]} (Phase 1)</option>
              <option value="3" disabled>Integration · max ${RULES.MAX_STAKE_BY_TIER[3]} (Phase 1)</option>
            </select></label>
          <div class="stake-picker">
            <label for="bet-stake">Stake <span class="hint" id="stake-hint">max ${RULES.MAX_STAKE_BY_TIER[defaultTier]} for this proof · tap chips to add</span></label>
            <div class="stake-input-wrap">${chipIco()}<input id="bet-stake" name="stake" type="number" min="1" step="1" required value="10" inputmode="numeric"></div>
            <div class="chip-row">
              ${[1, 5, 10, 25].map(v => `<button type="button" class="chip-btn c${v}" data-action="add-chip" data-v="${v}" aria-label="Add ${v} chips">${v}</button>`).join('')}
              <button type="button" class="sm ghost" data-action="clear-chips">Clear</button>
            </div>
          </div>
          <label>Deadline
            <div class="quick">
              ${[['tonight', 'Tonight 11:59'], ['1h', '+1 hour'], ['24h', '+24 hours'], ['3d', '+3 days'], ['7d', '+1 week'], ['custom', 'Custom']].map(([k, l]) =>
                `<button type="button" class="sm ${ui.deadlinePick === k ? 'active' : ''}" data-action="deadline-pick" data-k="${k}">${l}</button>`).join('')}
            </div>
            <input type="datetime-local" name="deadline" value="${toLocalInput(dl)}" ${ui.deadlinePick === 'custom' ? '' : 'readonly'}>
          </label>
          <details>
            <summary>More: how it's measured, why, where it goes if it decays</summary>
            <div class="stack mt">
              <div class="form-row">
                <label>Measured as
                  <select name="measureKind">
                    <option value="binary">Did it / didn't</option>
                    <option value="quantity">A quantity</option>
                    <option value="duration">A duration</option>
                  </select></label>
                <label>Amount &amp; unit
                  <div class="row" style="flex-wrap:nowrap"><input name="measureAmount" type="number" min="0.1" step="any" placeholder="5" style="max-width:40%"><input name="measureUnit" placeholder="km / pages / minutes"></div></label>
              </div>
              <label>Why it matters <input name="why" maxlength="200" placeholder="Shown on hard days."></label>
              <label>If it decays, chips go to
                <select name="destination">${Content.DESTINATIONS.map(d => `<option>${esc(d)}</option>`).join('')}</select></label>
            </div>
          </details>
          <p class="small muted mb0">You can cancel within 10 minutes. After that it's live. Missed stakes are locked for 30 days, not lost.</p>
          <div><button class="primary big-cta" type="submit">Place bet</button></div>
        </form>
      </div>

      <div class="section-title"><h2>Your bets</h2>
        <div class="quick">${filters.map(f => `<button class="sm ${ui.betFilter === f ? 'active' : ''}" data-action="bet-filter" data-f="${f}">${f}</button>`).join('')}</div></div>
      ${list.length ? `<div class="stack">${list.map(b => betCard(b)).join('')}</div>` : `<div class="empty"><div class="big">🎯</div>No ${ui.betFilter === 'all' ? '' : ui.betFilter + ' '}bets.</div>`}`;
  }

  function vault() {
    const locked = state.vault.filter(e => e.status === 'locked').sort((a, b) => a.decaysAt - b.decaysAt);
    const history = state.vault.filter(e => e.status !== 'locked').sort((a, b) => b.lockedAt - a.lockedAt);
    const st = Core.stats(state);
    return `<div class="page-head"><div><h1>Vault</h1><p class="muted">Locked, not lost. Earn it back with something harder.</p></div></div>
      ${balancesBlock()}
      ${st.everLocked ? `<p class="small muted mt">Over time: ${fmtCredits(st.everLocked)} locked, ${fmtCredits(st.recovered)} recovered (${st.recoveryRate}%).</p>` : ''}
      <div class="section-title"><h2>Locked</h2><span class="count-badge">${locked.length}</span></div>
      ${locked.length ? `<div class="stack">${locked.map(e => entryCard(e, true)).join('')}</div>` : `<div class="card soft"><p class="mb0">Nothing in the Vault. That's the goal.</p></div>`}
      ${history.length ? `<div class="section-title"><h2>History</h2><button class="sm ghost" data-action="toggle-vault-history">${ui.vaultHistory ? 'Hide' : 'Show'} ${history.length}</button></div>
        ${ui.vaultHistory ? `<div class="stack">${history.map(e => entryCard(e, true)).join('')}</div>` : ''}` : ''}
      <div class="card soft mt"><h3>The harder rule</h3><p class="small mb0">A redemption must beat the original on at least one of: amount ×1.5, half the time window, or a stricter proof. The app checks, so you can't talk yourself into an easy one. Partial success unlocks a share and uses a chance; full success unlocks everything and costs nothing.</p></div>`;
  }

  function ledger() {
    const problems = Core.checkInvariants(state);
    const b = Core.balances(state);
    const rows = state.ledger.slice().reverse();
    return `<div class="page-head"><div><h1>Ledger</h1><p class="muted">Every credit, accounted for.</p></div>
        <span class="pill ${problems.length ? 'bad-badge' : 'ok-badge'}">${problems.length ? 'Imbalance' : 'Balanced'}</span></div>
      ${balancesBlock()}
      <p class="small muted mt">wallet ${fmtCredits(b.wallet)} + at stake ${fmtCredits(b.atStake)} + in vault ${fmtCredits(b.inVault)} + decayed ${fmtCredits(b.decayed)} = ${fmtCredits(b.total)} · granted ${fmtCredits(b.granted)}</p>
      ${problems.length ? `<div class="card" style="border-color:var(--missed)"><strong>Problems</strong><ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <div class="card mt ledger-card">
        <table class="ledger"><thead><tr><th>When</th><th>What</th><th class="n">Δ</th><th class="n">Wallet</th></tr></thead><tbody>
          ${rows.map(l => `<tr><td class="muted">${l.at ? esc(fmtWhen(l.at)) : '—'}</td><td><span class="pill">${l.reason}</span> ${esc(l.note)}</td>
            <td class="n ${l.delta > 0 ? 'pos' : l.delta < 0 ? 'neg' : 'muted'}">${l.delta > 0 ? '+' : ''}${l.delta ? fmtCredits(l.delta) : '·'}</td><td class="n">${fmtCredits(l.balanceAfter)}</td></tr>`).join('')}
        </tbody></table>
      </div>`;
  }

  function learn() {
    return `<div class="page-head"><div><h1>Learn</h1><p class="muted">Why Vault works the way it does.</p></div></div>
      <div class="stack">${Content.LEARN.map(s => `<section class="card learn-section" id="learn-${s.id}">
        <h2>${esc(s.title)}</h2>${s.body.map(p => `<p>${esc(p)}</p>`).join('')}
        ${s.quote ? `<blockquote>${esc(s.quote)}</blockquote>` : ''}
        ${s.table ? `<table class="gibb"><thead><tr><th>Defensive</th><th>Supportive</th><th>Rewrite</th></tr></thead><tbody>${s.table.map(r => `<tr><td>${esc(r[0])}</td><td><strong>${esc(r[1])}</strong></td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>` : ''}
      </section>`).join('')}</div>`;
  }

  // ---------- install / phone setup ----------
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (ui.tab === 'settings') render(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; toast('Vault installed. Long-press its icon for "Prove it now".', 'win'); });
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const appUrl = () => location.origin + location.pathname;

  function phoneCard() {
    const proveUrl = appUrl() + '#prove';
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    const ios = isIOS();
    return `<div class="card phone-card" id="phone">
      <h2>Put Vault on your phone</h2>
      <p class="small muted">One tap from your lock screen to a live challenge.</p>
      ${local ? `<p class="small" style="color:var(--partial)">You're on a local preview. Open the live site on your phone to set this up.</p>` : ''}
      <label>Quick prove link <span class="hint">opens straight to the camera for whatever is due</span>
        <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(proveUrl)}" id="prove-url"><button type="button" data-action="copy-prove-url">Copy</button></div></label>
      ${installPrompt ? `<button class="primary big-cta mt" data-action="install">Install Vault</button>` : ''}
      <div class="setup-tabs mt">
        <details ${ios ? 'open' : ''}><summary><strong>iPhone</strong></summary>
          <p class="small mt"><strong>Lock screen button</strong> (iOS 18+)</p>
          <ol class="steps small">
            <li>Tap <strong>Copy</strong> above.</li>
            <li>Open the <strong>Shortcuts</strong> app → <strong>+</strong> → add the action <strong>Open URLs</strong> → paste the link. Name it <strong>Prove it</strong>.</li>
            <li>Lock your phone, then long-press the lock screen → <strong>Customize</strong> → <strong>Lock Screen</strong>.</li>
            <li>Tap the flashlight or camera button at the bottom → remove it → <strong>+</strong> → <strong>Shortcut</strong> → <strong>Prove it</strong>.</li>
          </ol>
          <p class="small mt"><strong>Home screen icon:</strong> in the shortcut's menu, tap <strong>Add to Home Screen</strong>.</p>
          <p class="small muted">Heads up: on iPhone, Safari and a Safari "Add to Home Screen" app keep separate data. The shortcut opens Safari, so use Safari (or the shortcut icon) for everything and your bets stay in one place.</p>
        </details>
        <details ${ios ? '' : 'open'}><summary><strong>Android</strong></summary>
          <ol class="steps small mt">
            <li>Open this site in <strong>Chrome</strong> → menu <strong>⋮</strong> → <strong>Install app</strong> (or tap Install above).</li>
            <li>Long-press the Vault icon → drag <strong>Prove it now</strong> onto your home screen for a one-tap button.</li>
          </ol>
        </details>
      </div>
      ${isStandalone() ? '<p class="small mb0 mt" style="color:var(--done)">✓ Running as an installed app.</p>' : ''}
    </div>`;
  }

  function settings() {
    const off = state.settings.clockOffset || 0;
    return `<div class="page-head"><div><h1>Settings</h1><p class="muted">Your data lives in this browser only.</p></div></div>
      <div class="stack">
        ${phoneCard()}
        <div class="card"><h2>Profile</h2>
          <form data-form="settings"><label>Your name <input name="name" maxlength="60" value="${esc(state.settings.name)}" placeholder="e.g. Sam"></label>
          <div><button class="primary" type="submit">Save</button></div></form></div>
        <div class="card row spread"><div><h2 class="mb0">Your setup</h2><p class="small muted mb0">Goals, play style and intensity shape your suggestions.</p></div><button class="sm" data-action="redo-setup">Redo setup</button></div>
        <div class="card"><h2>Sound</h2>
          <label class="toggle-row"><span>Chip sounds and win chimes <span class="hint">quiet, and only after you tap something</span></span>
            <input type="checkbox" data-action="sound-toggle" ${state.settings.sound !== false ? 'checked' : ''}></label></div>
        <div class="card"><h2>Real money</h2>
          <p class="small muted">Off, and not available yet (Phase 2). When it ships it will be opt-in, with a Stripe hold that is only captured if a stake decays, so we never hold your funds and never keep them.</p>
          <label class="row" style="font-weight:400"><input type="checkbox" disabled style="width:auto"> Enable real money (coming later)</label></div>
        <div class="card"><h2>Backup &amp; move</h2>
          <p class="small muted">${state.bets.length} bets · ${state.vault.length} vault entries · ${state.ledger.length} ledger lines. Export to move to another computer. Proof photos are included.</p>
          <div class="row"><button data-action="export">Export JSON</button><button data-action="import">Import JSON…</button>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden"></div></div>
        <div class="card"><h2>Try it</h2>
          <p class="small muted">Adds an active bet, a won bet, a locked entry with 2 chances left, and a redeemed entry.</p>
          <button data-action="sample">Load sample data</button></div>
        <div class="card"><h2>Time machine <span class="pill">testing</span></h2>
          <p class="small muted">Jump the app's clock forward to watch deadlines pass, chances burn, and entries decay without waiting. Current offset: <strong>${off ? '+' + fmtDur(off) : 'none'}</strong>.</p>
          <div class="quick">
            <button class="sm" data-action="time" data-ms="${HOUR}">+1 hour</button>
            <button class="sm" data-action="time" data-ms="${6 * HOUR}">+6 hours</button>
            <button class="sm" data-action="time" data-ms="${DAY}">+1 day</button>
            <button class="sm" data-action="time" data-ms="${7 * DAY}">+1 week</button>
            <button class="sm" data-action="time" data-ms="${31 * DAY}">+31 days</button>
            <button class="sm ghost" data-action="time" data-ms="0" ${off ? '' : 'disabled'}>Reset clock</button>
          </div></div>
        <div class="card"><h2>Danger zone</h2>
          <p class="small muted">Delete everything Vault stored in this browser, including proof photos. Cannot be undone.</p>
          <button class="danger" data-action="reset">Delete all data</button></div>
        <div class="card soft"><h3>About</h3><p class="small mb0">Vault is open source (MIT). No accounts, no tracking, no server in Phase 0. Rules live in <code>js/core.js</code> and are covered by tests.</p></div>
      </div>`;
  }

  // ---------- League (demo) ----------
  // Rules live in js/league.js. This demo keeps its own storage key and never touches chips.
  const LKEY = 'vault.league.demo.v1';
  let lg = (() => { try { return JSON.parse(localStorage.getItem(LKEY)) || null; } catch (e) { return null; } })();
  function saveLeague() { try { if (lg) localStorage.setItem(LKEY, JSON.stringify(lg)); else localStorage.removeItem(LKEY); } catch (e) { /* private mode */ } }
  function ava(m, big) { return `<span class="ava${big ? ' big' : ''}" style="--ava:${m.color}" aria-hidden="true">${esc(m.name[0])}</span>`; }
  function habitTitle(mid, hid) { const m = League.member(lg, mid); const h = m && m.habits.find(x => x.id === hid); return h ? h.title : ''; }
  const nm = (mid) => mid === 'you' ? 'You' : esc(League.member(lg, mid).name);

  function demoLeague() {
    const you = League.member(lg, 'you');
    const wk = Math.min(lg.weeks - 1, League.weekOf(lg.day));
    const mu = League.matchup(lg, wk, 'you');
    const opp = League.member(lg, mu.opp);
    const diff = mu.mine - mu.theirs;
    const table = League.standings(lg);
    const tierLabel = League.PUNISHMENTS[lg.tier].label;
    return `<div class="page-head"><div><h1>${esc(lg.name)}</h1>
        <p class="muted">${lg.finished ? 'Season over' : `Week ${wk + 1} of ${lg.weeks} · Day ${lg.day % 7 + 1} of 7`} · ${tierLabel} punishments</p></div>
        <button class="ghost sm" data-action="lg-mode" data-m="">‹ Real leagues</button></div>
      ${lg.finished ? finaleCard(table) : ''}
      <div class="felt matchup">
        <div class="eyebrow" style="color:var(--gold-hi)">Week ${wk + 1} matchup${lg.finished ? ' · final' : ''}</div>
        <div class="vs">
          <div class="side">${ava(you, true)}<div class="who">You</div><div class="num" data-count="${mu.mine}" data-count-key="mu-you">${mu.mine}</div></div>
          <div class="vs-mid">VS</div>
          <div class="side">${ava(opp, true)}<div class="who">${esc(opp.name)}</div><div class="num" data-count="${mu.theirs}" data-count-key="mu-opp">${mu.theirs}</div></div>
        </div>
        <div class="mu-status">${diff > 0 ? `You're up by ${diff}` : diff < 0 ? `${esc(opp.name)} is up by ${-diff}` : 'Dead even'}</div>
      </div>
      ${lg.finished ? '' : `<div class="card mt">
        <div class="row spread"><h3 class="mb0">Your habits today</h3><span class="small muted">prove it to keep your chips</span></div>
        <div class="lg-habits">${you.habits.map(h => {
          const done = lg.log.find(e => e.day === lg.day && e.member === 'you' && e.habit === h.id && (e.kind === 'proof' || e.kind === 'fake'));
          const streak = League.streakBefore(lg, 'you', h.id, lg.day);
          return `<div class="lg-habit"><span class="t">${esc(h.title)}${streak ? ` <span class="streak-chip">🔥${streak}</span>` : ''}</span>
            ${done ? `<span class="pill done">✓ +${done.points}</span>` : `<button class="primary sm" data-action="lg-prove" data-id="${h.id}">Prove it</button>`}</div>`;
        }).join('')}</div>
        <div class="sim-row">
          <button data-action="lg-end-day">End day ▸</button>
          <button class="ghost" data-action="lg-sim" data-n="week">Sim week ⏩</button>
          <button class="ghost" data-action="lg-sim" data-n="season">Sim season ⏭</button>
        </div>
        <p class="hint mb0">Demo: your friends are bots. In the real app, Prove it opens the live challenge camera and days end on their own. Sim buttons auto-play you about 75% of the time.</p>
      </div>`}

      <div class="section-title"><h2>Standings</h2><span class="small muted">fewest chips does it</span></div>
      <div class="card ledger-card"><table class="ledger standings">
        <thead><tr><th>#</th><th>Player</th><th>W–L${table.some(r => r.t) ? '–T' : ''}</th><th class="n">Pts</th></tr></thead>
        <tbody>${table.map((r, i) => `<tr class="${r.id === 'you' ? 'me' : ''} ${i === table.length - 1 ? 'zone' : ''}">
          <td>${i === 0 ? '🏆' : i === table.length - 1 ? '🔻' : i + 1}</td>
          <td><span class="who-cell">${ava(League.member(lg, r.id))}${r.id === 'you' ? 'You' : esc(r.name)}</span></td>
          <td>${r.w}–${r.l}${table.some(x => x.t) ? '–' + r.t : ''}</td><td class="n">${r.pts}</td></tr>`).join('')}</tbody>
      </table></div>

      <div class="section-title"><h2>Group feed</h2><span class="small muted">call sus on shady proofs</span></div>
      <div class="card feed">${feedHtml()}</div>

      <details class="card mt punish-list"><summary><strong>Punishment list</strong> · ${tierLabel}</summary>
        <ul class="small">${League.pool(lg).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <form data-form="lg-custom" class="mt">
          <label>Suggest your own <span class="hint">the league votes; nothing unsafe, public or over $${League.MONEY_CAP}</span>
            <div class="row" style="flex-wrap:nowrap"><input name="text" maxlength="120" placeholder="e.g. Wear a cape to class" required>
            <select name="tier" style="max-width:8.5rem">${League.TIER_ORDER.map(t => `<option value="${t}" ${t === lg.tier ? 'selected' : ''}>${League.PUNISHMENTS[t].label}</option>`).join('')}</select></div></label>
          <div><button type="submit">Put it to a vote</button></div>
        </form>
      </details>
      <div class="row mt"><button class="ghost sm danger" data-action="lg-reset">End demo league</button></div>`;
  }

  function feedHtml() {
    const items = lg.log.slice(-40).reverse();
    if (!items.length) return '<p class="muted small mb0">Nothing yet. Prove a habit or end the day to get things going.</p>';
    let lastDay = null;
    return items.map(e => {
      const head = e.day !== lastDay ? `<div class="feed-day">Day ${e.day + 1}</div>` : '';
      lastDay = e.day;
      const reacts = ['🔥', '😂', '👀', '💪'].map(r => `<button class="react ${e.reacts && e.reacts[r] ? 'on' : ''}" data-action="lg-react" data-id="${e.id}" data-r="${r}" aria-label="React ${r}">${r}${e.reacts && e.reacts[r] ? ' ' + e.reacts[r] : ''}</button>`).join('');
      let body = '';
      if (e.kind === 'proof' || e.kind === 'fake') {
        const m = League.member(lg, e.member);
        const canSus = !lg.finished && e.member !== 'you' && !e.sus && e.kind === 'proof' && e.day >= lg.day - 1;
        body = `${ava(m)}<div class="fb"><div><strong>${nm(e.member)}</strong> ${e.kind === 'fake' ? '<s>proved</s>' : 'proved'} <em>${esc(habitTitle(e.member, e.habit))}</em>${e.streak > 1 ? ` <span class="streak-chip">🔥${e.streak}</span>` : ''}</div>
          ${e.sus ? `<div class="small ${e.sus.verdict === 'fake' ? 'neg' : 'pos'}">${nm(e.sus.by)} called sus · vote ${e.sus.yes}–${e.sus.no} · ${e.sus.verdict === 'fake' ? 'FAKE' : 'legit ✓'}</div>` : ''}
          <div class="reacts">${reacts}${canSus ? `<button class="sus" data-action="lg-sus" data-id="${e.id}">Sus?</button>` : ''}</div></div>
          <span class="pts ${e.points >= 0 ? 'pos' : 'neg'}">${e.points > 0 ? '+' : ''}${e.points}</span>`;
      } else if (e.kind === 'miss') {
        body = `${ava(League.member(lg, e.member))}<div class="fb muted"><strong>${nm(e.member)}</strong> missed <em>${esc(habitTitle(e.member, e.habit))}</em></div><span class="pts neg">${e.points}</span>`;
      } else if (e.kind === 'result') {
        const w = e.pa === e.pb ? null : e.pa > e.pb ? e.a : e.b;
        body = `<span class="ava trophy" aria-hidden="true">⚑</span><div class="fb"><strong>Week ${e.week + 1} final:</strong> ${nm(e.a)} ${e.pa} – ${e.pb} ${nm(e.b)}${w ? ` · <span class="gold-text">${nm(w)} win${w === 'you' ? '' : 's'}</span>` : ' · tie'}</div>`;
      } else if (e.kind === 'chat') {
        body = `${ava(League.member(lg, e.member))}<div class="fb"><strong>${nm(e.member)}:</strong> “${esc(e.text)}”<div class="reacts">${reacts}</div></div>`;
      }
      return `${head}<div class="feed-item ${e.kind}">${body}</div>`;
    }).join('');
  }

  function finaleCard(table) {
    const r = lg.result;
    if (!r) {
      return `<div class="felt finale"><div class="eyebrow" style="color:var(--gold-hi)">Season over</div>
        <h2>Who finished last?</h2><p class="muted">🏆 ${nm(table[0].id)} ${table[0].id === 'you' ? 'win' : 'wins'} the season.</p>
        <button class="primary big-cta" data-action="lg-reveal">Reveal the loser</button></div>`;
    }
    const loser = League.member(lg, r.loser), isYou = r.loser === 'you';
    return `<div class="felt finale"><div class="eyebrow" style="color:var(--gold-hi)">Season over · last place</div>
      <div class="loser">${ava(loser, true)}<h2 class="mb0">${isYou ? 'You' : esc(loser.name)}</h2></div>
      <div class="reel-wrap"><div class="reel-label">${isYou ? 'You have to' : esc(loser.name) + ' has to'}</div>
        <div class="reel" data-reel>${esc(r.punishment)}</div>
        <div class="small muted">${League.PUNISHMENTS[r.tier].label}${r.vetoUsed ? ' · veto used' : ''}</div></div>
      ${r.proved ? `<p class="mb0" style="color:#8dffc6">✓ Punishment served. Proof is in the group feed.</p>` : `<div class="row" style="justify-content:center">
        ${isYou && !r.vetoUsed ? `<button class="ghost" data-action="lg-veto">Use my veto (1 left)</button>` : ''}
        <button class="primary" data-action="lg-served">${isYou ? 'Upload proof I did it' : 'Demand proof'}</button></div>`}
      <div class="row mt" style="justify-content:center"><button class="ghost sm" data-action="lg-new">Start a new season</button></div>
    </div>`;
  }

  function leagueSetup() {
    return `<div class="page-head"><div><h1>League demo</h1><p class="muted">Play a season against 5 pretend friends.</p></div><button class="ghost sm" data-action="lg-mode" data-m="">‹ Real leagues</button></div>
      <div class="felt intro">
        <div class="eyebrow" style="color:var(--gold-hi)">How it works</div>
        <h2>Your friends. Your habits. One loser.</h2>
        <div class="how-grid">
          <div><b>1</b>Everyone picks daily habits</div>
          <div><b>2</b>Face one friend each week</div>
          <div><b>3</b>Prove it for points, call sus on fakes</div>
          <div><b>4</b>Last place spins the punishment wheel</div>
        </div>
      </div>
      <div class="card mt">
        <form data-form="league-create">
          <label>League name <input name="name" value="The Grind House" maxlength="40" required></label>
          <div class="form-row">
            <label>Your habit 1 <input name="h1" value="Up by 7am" maxlength="60" required></label>
            <label>Your habit 2 <input name="h2" value="Read 20 pages" maxlength="60"></label>
          </div>
          <label>Season length <select name="weeks"><option value="2">2 weeks</option><option value="3" selected>3 weeks</option><option value="4">4 weeks</option></select></label>
          <fieldset class="tier-pick"><legend>Consequence vibe</legend>
            ${League.TIER_ORDER.map(t => `<label class="tier-opt"><input type="radio" name="tier" value="${t}" ${t === 'medium' ? 'checked' : ''}>
              <span><strong>${League.PUNISHMENTS[t].label}</strong><small>${esc(League.PUNISHMENTS[t].items[0])}</small><small>${esc(League.PUNISHMENTS[t].items[1])}</small></span></label>`).join('')}
          </fieldset>
          <div class="card soft small"><strong>House rules.</strong> Everyone sees the punishment list before joining. Punishments stay inside the group. Each loser gets one veto. Nothing dangerous, illegal, sexual or over $${League.MONEY_CAP}. You can suggest your own once the league starts.</div>
          <div class="invite"><span class="small muted">Invite link</span><code>vault.app/join/GRIND-7Q2</code><span class="pill">demo</span></div>
          <button class="primary big-cta" type="submit">Start the season with 5 demo friends</button>
        </form>
      </div>`;
  }

  function animateReel() {
    const el = app.querySelector('[data-reel]');
    if (!el || !ui.lgSpin) return;
    const real = ui.lgMode !== 'demo' && cloud.data && cloud.data.league.result;
    const res = real ? cloud.data.league.result : lg && lg.result;
    if (!res) return;
    ui.lgSpin = false;
    const final = res.punishment;
    if (reducedMotion()) { el.textContent = final; return; }
    const options = real ? League.cloudPool(League.fromCloud(cloud.data, Cloud.today(cloud.data.league), me()), res.tier) : League.pool(lg, res.tier);
    let i = 0, delay = 50;
    el.classList.add('spinning');
    (function step() {
      if (!el.isConnected) return;
      if (delay > 420) { el.textContent = final; el.classList.remove('spinning'); el.classList.add('landed'); Sfx.lock(); return; }
      el.textContent = options[i++ % options.length]; Sfx.chip();
      delay *= 1.16; setTimeout(step, delay);
    })();
  }

  function leagueEvents(evs) {
    for (const ev of evs) {
      if (ev.type === 'sus' && ev.entry.member === 'you') toast(`${League.member(lg, ev.by).name} called sus on your proof · vote ${ev.result.yes}–${ev.result.no} · ${ev.result.verdict === 'fake' ? 'ruled FAKE' : 'legit ✓'}`, ev.result.verdict === 'fake' ? 'lock' : 'win');
      if (ev.type === 'week') {
        const mu = League.matchup(lg, ev.week, 'you');
        const won = mu.mine > mu.theirs, tie = mu.mine === mu.theirs;
        toast(`Week ${ev.week + 1}: You ${mu.mine} – ${mu.theirs} ${League.member(lg, mu.opp).name}. ${tie ? 'Tie.' : won ? 'W 🏆' : 'L'}`, won ? 'win' : 'lock');
        if (won) { Sfx.win(); celebrate(); } else if (!tie) Sfx.lock();
      }
      if (ev.type === 'season') toast('Season over. Who finished last?', 'win');
    }
  }

  // ---------- Real leagues (Supabase) ----------
  const cloud = { ready: false, booting: false, leagues: null, current: null, data: null, photos: {}, joinCode: null, preview: null, previewErr: null, busy: false };
  const me = () => (Cloud.me() || {}).id;
  const GOAL_IDEAS = ['Up by 7am', 'Gym 45 min', '8k steps', 'Read 20 pages', 'Study 1 hour', 'No phone after 11pm', 'Drink 2L water', 'In bed by 11', 'Practice 30 min'];
  // Goal helper: up to 3 habits, 10 chips a day split across them.
  const habitInputs = () => {
    const mine = myIdeas(), p = state.settings.profile;
    const first = p ? mine.slice(0, Math.min(2, (p.goals || []).length || 1)) : ['Up by 7am'];
    const split = League.splitChips(first.length);
    const row = (i, title, chips) => `<div class="goal-row"><input name="t${i}" value="${esc(title)}" maxlength="60" placeholder="${i === 1 ? 'e.g. Up by 7am' : 'Add another (optional)'}" ${i === 1 ? 'required' : ''}>
      <label class="chip-step"><input name="c${i}" type="number" min="${i === 1 ? 1 : 0}" max="10" value="${chips}" inputmode="numeric" aria-label="Chips on habit ${i}"><span>chips</span></label></div>`;
    return `<div class="goal-helper">
      <div class="label-like">Your habits <span class="hint">specific and provable with a photo · 10 chips a day split across them</span></div>
      ${row(1, first[0], split[0])}${row(2, first[1] || '', split[1] || 0)}${row(3, '', 0)}
      <div class="idea-row">${(p ? mine.slice(0, 9) : GOAL_IDEAS).map(g => `<button type="button" class="idea" data-action="goal-idea" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
      <div class="chip-total small muted" data-chip-total>10 of 10 chips placed</div>
    </div>`;
  };
  function readHabits(f) {
    const list = [1, 2, 3].map(i => ({ title: (f['t' + i] || '').trim(), chips: Number(f['c' + i]) || 0 })).filter(h => h.title);
    if (!list.length) throw new Error('Add at least one habit.');
    if (list.some(h => h.chips < 1)) throw new Error('Put at least 1 chip on every habit.');
    const sum = list.reduce((n, h) => n + h.chips, 0);
    if (sum !== 10) throw new Error(`Your chips add up to ${sum}. Split exactly 10.`);
    return list;
  }
  function rebalance(form) {
    const rows = [1, 2, 3].filter(i => form.elements['t' + i].value.trim());
    const split = League.splitChips(rows.length || 1);
    [1, 2, 3].forEach(i => { form.elements['c' + i].value = 0; });
    rows.forEach((i, k) => { form.elements['c' + i].value = split[k]; });
    updateChipTotal(form);
  }
  function updateChipTotal(form) {
    const el = form.querySelector('[data-chip-total]'); if (!el) return;
    const sum = [1, 2, 3].reduce((n, i) => n + (form.elements['t' + i].value.trim() ? Number(form.elements['c' + i].value) || 0 : 0), 0);
    el.textContent = `${sum} of 10 chips placed`; el.classList.toggle('neg', sum !== 10);
  }
  const tierPicker = (sel = 'medium') => `<fieldset class="tier-pick"><legend>Consequence vibe</legend>
      ${League.TIER_ORDER.map(t => `<label class="tier-opt"><input type="radio" name="tier" value="${t}" ${t === sel ? 'checked' : ''}>
        <span><strong>${League.PUNISHMENTS[t].label}</strong><small>${esc(League.PUNISHMENTS[t].items[0])}</small><small>${esc(League.PUNISHMENTS[t].items[1])}</small></span></label>`).join('')}
    </fieldset>`;
  const inviteUrl = (code) => appUrl() + '#join=' + code;

  async function cloudBoot() {
    if (cloud.ready || cloud.booting) return;
    cloud.booting = true;
    try { if (Cloud.available()) { await Cloud.restore(); if (Cloud.profile()) cloud.leagues = await Cloud.myLeagues(); } }
    catch (err) { toast(err.message, 'lock'); }
    cloud.ready = true; cloud.booting = false;
    if (cloud.joinCode) loadPreview();
    if (ui.tab === 'league') render();
  }
  async function loadPreview() {
    cloud.preview = null; cloud.previewErr = null;
    if (!Cloud.profile()) return;
    try { cloud.preview = await Cloud.preview(cloud.joinCode); if (!cloud.preview) cloud.previewErr = 'No league with that code.'; }
    catch (err) { cloud.previewErr = err.message; }
    if (ui.tab === 'league') render();
  }
  async function cloudDo(fn, ok) {
    if (cloud.busy) return null;
    cloud.busy = true;
    try { const r = await fn(); if (ok) toast(ok, 'win'); return r; }
    catch (err) { toast(err.message, 'lock'); return null; }
    finally { cloud.busy = false; }
  }
  async function openLeague(id) {
    cloud.current = id; cloud.data = null; render();
    await refreshLeague();
    Cloud.subscribe(id, refreshLeague);
  }
  function closeLeague() { Cloud.unsubscribe(); cloud.current = null; cloud.data = null; Cloud.myLeagues().then(l => { cloud.leagues = l; render(); }).catch(() => {}); render(); }
  async function refreshLeague() {
    const id = cloud.current; if (!id) return;
    try {
      const d = await Cloud.load(id);
      if (cloud.current !== id) return;
      cloud.data = d;
      const need = d.entries.map(e => e.photo_path).filter(p => p && !cloud.photos[p]);
      if (need.length) Object.assign(cloud.photos, await Cloud.photoUrls(need));
    } catch (err) { toast(err.message, 'lock'); }
    if (ui.tab === 'league' && !(ui.sheet && ui.sheet.kind === 'prove-league')) render();
  }

  function league() {
    if (ui.lgMode === 'demo') return lg ? demoLeague() : leagueSetup();
    cloudBoot();
    const head = (sub) => `<div class="page-head"><div><h1>League</h1><p class="muted">${sub}</p></div></div>`;
    if (!cloud.ready) return heroStill() + '<div class="card"><p class="mb0 muted">Loading your leagues…</p></div>';
    if (!Cloud.available()) return head('Play with real friends') + `<div class="card"><p>Can't reach the league server right now. Check your connection and reload.</p><button data-action="lg-mode" data-m="demo">Try the demo instead</button></div>`;
    if (!Cloud.profile()) return realSignup();
    if (cloud.joinCode) return realJoin();
    if (cloud.current) return realLeague();
    return realHome();
  }

  function realSignup() {
    return `${heroStill()}
      <div class="card mt"><form data-form="cloud-signup">
        <label>Your name <span class="hint">what your friends will see</span><input name="name" maxlength="30" required autocomplete="nickname" placeholder="e.g. Jarred" value="${esc(state.settings.name || '')}"></label>
        <p class="small muted mb0">No email or password. Your spot is saved on this phone, so use the same phone and browser each time.</p>
        <button class="primary big-cta" type="submit">${cloud.joinCode ? 'Continue to the invite' : 'Let\'s go'}</button>
      </form></div>
      <div class="row mt" style="justify-content:center"><button class="ghost" data-action="nav" data-tab="today">Or just track habits solo</button></div>`;
  }

  function realJoin() {
    const p = cloud.preview;
    return `<div class="page-head"><div><h1>Join a league</h1><p class="muted">Code <span class="code">${esc(cloud.joinCode)}</span></p></div>
        <button class="ghost sm" data-action="cl-cancel-join">Cancel</button></div>
      ${cloud.previewErr ? `<div class="card"><p class="mb0">${esc(cloud.previewErr)}</p></div>` : !p ? '<div class="card"><p class="mb0 muted">Looking up the league…</p></div>' : p.started ? `<div class="card"><p class="mb0">"${esc(p.name)}" already started. Ask them to invite you next season.</p></div>` : `
        <div class="felt intro"><div class="eyebrow" style="color:var(--gold-hi)">You're invited to</div><h2>${esc(p.name)}</h2>
          <p class="muted mb0">${p.members} player${p.members === 1 ? '' : 's'} so far · ${p.weeks}-week season · ${League.PUNISHMENTS[p.tier].label} consequences</p></div>
        <div class="card mt"><h3>How it works</h3><p class="small muted">You get 10 chips a day to split across your habits. Prove a habit and its chips are safe; miss it and they're gone. Fewest chips at the end does the consequence your group votes on in the lobby. Options include:</p>
          <ul class="small">${League.PUNISHMENTS[p.tier].items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="card mt"><form data-form="cloud-join">${habitInputs()}

          <button class="primary big-cta" type="submit">I'm in</button></form></div>`}`;
  }

  function realHome() {
    const ls = cloud.leagues || [];
    const status = (g) => !g.starts_on ? 'Lobby · waiting to start' : g.result ? 'Season over' : 'In season';
    return `${heroStill()}<div class="page-head" id="league-home"><div><h1>Your leagues</h1><p class="muted">Signed in as <strong>${esc(Cloud.profile().name)}</strong></p></div></div>
      ${ls.length ? `<div class="stack">${ls.map(g => `<button class="quick-prove" data-action="cl-open" data-id="${g.id}">
          <span class="qp-main"><span class="qp-title">${esc(g.name)}</span><span class="small muted">${status(g)} · ${League.PUNISHMENTS[g.tier].label}</span></span>
          <span class="qp-go" aria-hidden="true">›</span></button>`).join('')}</div>` : ''}
      <div class="card mt"><h2>Join with a code</h2>
        <form data-form="cloud-code"><div class="row" style="flex-wrap:nowrap"><input name="code" maxlength="6" placeholder="ABC123" autocapitalize="characters" required style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em"><button type="submit">Join</button></div></form></div>
      <div class="card mt"><h2>Start a league</h2>
        <form data-form="cloud-create">
          <label>League name <input name="name" value="The Grind House" maxlength="40" required></label>
          ${habitInputs()}
          <label>Season length <select name="weeks"><option value="1">1 week (quick test)</option><option value="2">2 weeks</option><option value="3" selected>3 weeks</option><option value="4">4 weeks</option></select></label>
          ${tierPicker((Content.LEVELS.find(l => l.id === (state.settings.profile || {}).level) || {}).tier || 'medium')}
          <p class="small muted mb0">Your group votes on the exact consequence before day one. Nothing dangerous, illegal, public or over $${League.MONEY_CAP}. No real money, ever.</p>
          <button class="primary big-cta" type="submit">Create league &amp; get invite link</button>
        </form></div>
`;
  }

  function realLeague() {
    const d = cloud.data;
    const back = `<button class="ghost sm" data-action="cl-back">‹ Leagues</button>`;
    if (!d) return `<div class="page-head"><div><h1>League</h1><p class="muted">Loading…</p></div>${back}</div>`;
    const myId = me();
    const v = League.fromCloud(d, Cloud.today(d.league), myId);
    const isHost = d.league.created_by === myId;
    const nameOf = (id) => id === myId ? 'You' : esc((League.member(v, id) || {}).name || 'Player');
    const tierLabel = League.PUNISHMENTS[v.tier].label;
    const punish = punishmentsCard(v, nameOf);
    const headerHtml = `<div class="page-head"><div><h1>${esc(v.name)}</h1>
        <p class="muted">${!v.started ? 'Lobby' : v.finished ? 'Season over' : `Week ${Math.floor(v.day / 7) + 1} of ${v.weeks} · Day ${v.day % 7 + 1} of 7`} · ${tierLabel} consequences</p></div>${back}</div>`;

    if (!v.started) {
      const url = inviteUrl(d.league.code);
      return headerHtml + `<div class="felt intro">
          <div class="eyebrow" style="color:var(--gold-hi)">Invite your friends</div>
          <div class="invite-code">${esc(d.league.code)}</div>
          <p class="small muted">Send this link. They tap it, type their name, pick habits, done.</p>
          <div class="row" style="justify-content:center"><button class="primary" data-action="cl-share" data-url="${esc(url)}" data-name="${esc(v.name)}">Share invite link</button><button class="ghost" data-action="cl-copy" data-url="${esc(url)}">Copy link</button></div>
        </div>
        <div class="section-title"><h2>Players</h2><span class="count-badge">${v.members.length}</span></div>
        <div class="card">${v.members.map(m => `<div class="lobby-row">${ava(m)}<div><strong>${nameOf(m.id)}</strong>${m.id === d.league.created_by ? ' <span class="pill">host</span>' : ''}<div class="small muted">${m.habits.map(h => `${esc(h.title)} <span class="chips-tag">${h.chips || ''}</span>`).join(' · ')}</div></div></div>`).join('')}</div>
        ${consequenceVote(v)}
        ${(() => { const voted = v.votes.length >= v.members.length; return isHost ? `<button class="primary big-cta mt" data-action="cl-start" ${v.members.length < 2 || !voted ? 'disabled' : ''}>${v.members.length < 2 ? 'Waiting for at least one friend…' : !voted ? `Waiting on votes (${v.votes.length} of ${v.members.length})` : `Start the season (${v.members.length} players)`}</button>
          <p class="hint">Day 1 is today. Once it starts, nobody else can join and the consequence is locked.</p>`
        : `<div class="card soft mt"><p class="mb0">Waiting for the host to start the season.</p></div>`; })()}
        <div class="row mt"><button class="ghost sm danger" data-action="cl-leave">Leave league</button></div>`;
    }

    const wk = Math.min(v.weeks - 1, Math.floor(v.day / 7));
    const mu = League.matchup(v, wk, myId);
    const you = League.member(v, myId);
    const table = League.standings(v);
    let board;
    if (mu) {
      const opp = League.member(v, mu.opp), diff = mu.mine - mu.theirs;
      board = `<div class="felt matchup"><div class="eyebrow" style="color:var(--gold-hi)">Week ${wk + 1} matchup${v.finished ? ' · final' : ''}</div>
        <div class="vs"><div class="side">${ava(you, true)}<div class="who">You</div><div class="num" data-count="${mu.mine}" data-count-key="cmu-you">${mu.mine}</div></div>
          <div class="vs-mid">VS</div>
          <div class="side">${ava(opp, true)}<div class="who">${esc(opp.name)}</div><div class="num" data-count="${mu.theirs}" data-count-key="cmu-opp">${mu.theirs}</div></div></div>
        <div class="mu-status">Chips lost this week · ${diff > 0 ? `you're ahead by ${diff}` : diff < 0 ? `${esc(opp.name)} is ahead by ${-diff}` : 'dead even'}</div></div>`;
    } else {
      const avg = Math.round(v.members.reduce((n, m) => n + League.points(v, m.id, wk), 0) / v.members.length);
      const mine = League.points(v, myId, wk);
      board = `<div class="felt matchup"><div class="eyebrow" style="color:var(--gold-hi)">Week ${wk + 1} · bye week</div>
        <div class="vs"><div class="side">${ava(you, true)}<div class="who">You</div><div class="num">${mine}</div></div><div class="vs-mid">VS</div>
          <div class="side"><span class="ava big" style="--ava:#555">≈</span><div class="who">League average</div><div class="num">${avg}</div></div></div>
        <div class="mu-status">Odd number of players: beat the average to get the W.</div></div>`;
    }
    const today = v.finished ? '' : `<div class="card mt">
        <div class="row spread"><h3 class="mb0">Your habits today</h3><span class="small muted">prove it to keep your chips</span></div>
        <div class="lg-habits">${you.habits.map(h => {
          const done = v.log.find(e => e.day === v.day && e.member === myId && e.habit === h.id && (e.kind === 'proof' || e.kind === 'fake'));
          const prev = v.log.filter(e => e.member === myId && e.habit === h.id && e.day < v.day);
          let streak = 0; for (let i = prev.length - 1; i >= 0 && prev[i].kind === 'proof'; i--) streak++;
          return `<div class="lg-habit"><span class="t">${esc(h.title)}${streak ? ` <span class="streak-chip">🔥${streak}</span>` : ''}</span>
            <span class="chips-tag">${h.chips || ''} chips</span>
            ${done ? `<span class="pill done">✓ safe</span>` : `<button class="primary sm" data-action="cl-prove" data-h="${esc(h.id)}" data-title="${esc(h.title)}" data-day="${v.day}">Prove it</button>`}</div>`;
        }).join('')}</div>
        <p class="hint mb0">Proof only counts today. Miss it and those chips are gone.</p></div>`;

    const onLine = v.consequence ? `<div class="on-line"><span class="eyebrow">On the line</span><strong>${esc(v.consequence)}</strong><span class="small muted">Fewest chips at the end does it.</span></div>` : '';
    return headerHtml + (v.finished ? realFinale(v, nameOf) : onLine) + board + today + `
      <div class="section-title"><h2>Standings</h2><span class="small muted">fewest chips does it</span></div>
      <div class="card ledger-card"><table class="ledger standings">
        <thead><tr><th>#</th><th>Player</th><th>W–L${table.some(r => r.t) ? '–T' : ''}</th><th class="n">Chips</th></tr></thead>
        <tbody>${table.map((r, i) => `<tr class="${r.id === myId ? 'me' : ''} ${i === table.length - 1 && table.length > 1 ? 'zone' : ''}">
          <td>${i === 0 ? '🏆' : i === table.length - 1 ? '🔻' : i + 1}</td>
          <td><span class="who-cell">${ava(League.member(v, r.id))}${nameOf(r.id)}</span></td>
          <td>${r.w}–${r.l}${table.some(x => x.t) ? '–' + r.t : ''}</td><td class="n">${League.chipsLeft(v, r.id)}</td></tr>`).join('')}</tbody></table></div>
      <div class="section-title"><h2>Group feed</h2><span class="small muted">live</span></div>
      <div class="card feed">
        <form data-form="cloud-chat" class="chat-form"><div class="row" style="flex-wrap:nowrap"><input name="body" maxlength="280" placeholder="Talk your trash…" autocomplete="off" required><button type="submit">Send</button></div></form>
        ${realFeed(v, nameOf)}</div>`;
  }

  function consequenceVote(v) {
    const myId = me(), mine = (v.votes.find(x => x.user === myId) || {}).choice;
    const tally = League.consequenceTally(v.votes);
    const count = (c) => (tally.find(t => t.choice === c) || { n: 0 }).n;
    const options = League.PUNISHMENTS[v.tier].items.concat(tally.map(t => t.choice)).filter((c, i, a) => a.indexOf(c) === i);
    return `<div class="section-title"><h2>The consequence</h2><span class="count-badge">${v.votes.length} of ${v.members.length} voted</span></div>
      <div class="card"><p class="small muted">Whoever ends with the fewest chips does this. Everyone votes; the top pick gets locked in when the season starts.</p>
        <div class="cons-list">${options.map(c => `<button class="cons-opt ${mine === c ? 'on' : ''}" data-action="cl-vote-cons" data-c="${esc(c)}">
          <span>${esc(c)}</span><span class="cons-n">${count(c) ? count(c) : ''}</span></button>`).join('')}</div>
        <form data-form="cloud-cons" class="mt"><div class="row" style="flex-wrap:nowrap"><input name="text" maxlength="120" placeholder="Or propose your own…" required><button type="submit">Propose</button></div></form>
      </div>`;
  }

  function realFeed(v, nameOf) {
    const myId = me();
    const items = v.log.filter(e => e.kind !== 'miss' || e.day >= v.day - 2).slice(-60).reverse();
    if (!items.length) return '<p class="muted small mb0">Nothing yet. Be the first to prove it.</p>';
    let lastDay = null;
    return items.map(e => {
      const head = e.day !== lastDay ? `<div class="feed-day">Day ${e.day + 1}</div>` : '';
      lastDay = e.day;
      const reacts = e.id.startsWith('miss_') || e.id.startsWith('res_') ? '' : ['🔥', '😂', '👀', '💪'].map(r => `<button class="react ${e.mine && e.mine[r] ? 'on' : ''}" data-action="cl-react" data-id="${e.id}" data-r="${r}" data-on="${e.mine && e.mine[r] ? 0 : 1}" aria-label="React ${r}">${r}${e.reacts[r] ? ' ' + e.reacts[r] : ''}</button>`).join('');
      let body = '';
      const m = e.member && League.member(v, e.member);
      if (e.kind === 'proof' || e.kind === 'fake') {
        const url = e.photo && cloud.photos[e.photo];
        const canVote = !v.finished && e.member !== myId && !e.myVote && (!e.sus || !e.sus.verdict) && e.day >= v.day - 1;
        body = `${ava(m)}<div class="fb"><div><strong>${nameOf(e.member)}</strong> ${e.kind === 'fake' ? '<s>proved</s>' : 'proved'} <em>${esc((m.habits.find(h => h.id === e.habit) || {}).title || '')}</em>${e.streak > 1 ? ` <span class="streak-chip">🔥${e.streak}</span>` : ''}</div>
          ${e.challenge ? `<div class="small muted">Challenge: ${esc(e.challenge)}</div>` : ''}
          ${url ? `<button class="proof-pic" data-action="cl-photo" data-src="${esc(url)}" aria-label="View proof photo"><img src="${esc(url)}" alt="Proof photo" loading="lazy"></button>` : e.photo ? '' : '<div class="small" style="color:var(--partial)">No photo (camera unavailable)</div>'}
          ${e.sus ? `<div class="small ${e.sus.verdict === 'fake' ? 'neg' : e.sus.verdict === 'legit' ? 'pos' : ''}">Sus vote ${e.sus.yes} fake – ${e.sus.no} legit · ${e.sus.verdict === 'fake' ? 'FAKE' : e.sus.verdict === 'legit' ? 'legit ✓' : e.sus.yes + e.sus.no >= v.members.length - 1 ? 'flagged (voiding needs 2 votes)' : 'voting…'}</div>` : ''}
          <div class="reacts">${reacts}${canVote ? `<button class="sus" data-action="cl-vote" data-id="${e.id}" data-fake="1">Sus</button><button class="react" data-action="cl-vote" data-id="${e.id}" data-fake="0">Legit</button>` : e.myVote ? `<span class="small muted">You voted ${e.myVote.fake ? 'sus' : 'legit'}</span>` : ''}</div></div>
          <span class="pts ${e.points >= 0 ? 'pos' : 'neg'}">${e.points < 0 ? e.points : 'safe'}</span>`;
      } else if (e.kind === 'miss') {
        body = `${ava(m)}<div class="fb muted"><strong>${nameOf(e.member)}</strong> missed <em>${esc((m.habits.find(h => h.id === e.habit) || {}).title || '')}</em></div><span class="pts neg">${e.points}</span>`;
      } else if (e.kind === 'result') {
        const w = e.pa === e.pb ? null : e.pa > e.pb ? e.a : e.b;
        body = `<span class="ava trophy" aria-hidden="true">⚑</span><div class="fb"><strong>Week ${e.week + 1} final:</strong> ${nameOf(e.a)} ${e.pa} · ${e.pb} ${nameOf(e.b)}${w ? ` · <span class="gold-text">${nameOf(w)} win${w === myId ? '' : 's'}</span>` : ' · tie'}</div>`;
      } else if (e.kind === 'chat') {
        body = `${ava(m || { name: '?', color: '#888' })}<div class="fb"><div><strong>${nameOf(e.member)}:</strong> ${esc(e.text)}</div><div class="reacts">${reacts}</div></div>`;
      }
      return `${head}<div class="feed-item ${e.kind}">${body}</div>`;
    }).join('');
  }

  function punishmentsCard(v, nameOf) {
    const myId = me();
    const pending = v.custom.filter(c => !c.approved);
    return `<details class="card mt punish-list" ${pending.some(c => c.myVote == null) ? 'open' : ''}><summary><strong>Punishment list</strong> · ${League.PUNISHMENTS[v.tier].label}${pending.length ? ` · ${pending.length} to vote on` : ''}</summary>
      <ul class="small">${League.cloudPool(v).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      ${pending.length ? `<h3 class="mt">Suggested</h3>${pending.map(c => `<div class="lobby-row"><div style="flex:1"><strong>${esc(c.text)}</strong>
          <div class="small muted">${League.PUNISHMENTS[c.tier].label} · by ${nameOf(c.by)} · ${c.yes} yes – ${c.no} no (needs ${Math.floor(v.members.length / 2) + 1})</div></div>
          ${c.myVote == null ? `<button class="sm" data-action="cl-pvote" data-id="${c.id}" data-yes="1">Yes</button><button class="sm ghost" data-action="cl-pvote" data-id="${c.id}" data-yes="0">No</button>` : `<span class="small muted">voted ${c.myVote ? 'yes' : 'no'}</span>`}</div>`).join('')}` : ''}
      ${v.finished ? '' : `<form data-form="cloud-suggest" class="mt">
        <label>Suggest your own <span class="hint">the group votes; nothing unsafe, public or over $${League.MONEY_CAP}</span>
          <div class="row" style="flex-wrap:nowrap"><input name="text" maxlength="120" placeholder="e.g. Wear a cape to class" required>
          <select name="tier" style="max-width:8.5rem">${League.TIER_ORDER.map(t => `<option value="${t}" ${t === v.tier ? 'selected' : ''}>${League.PUNISHMENTS[t].label}</option>`).join('')}</select></div></label>
        <div><button type="submit">Put it to a vote</button></div></form>`}
    </details>`;
  }

  function realFinale(v, nameOf) {
    const myId = me(), lose = League.losers(v), served = (v.result && v.result.served) || [];
    if (!lose.length) return `<div class="felt finale"><div class="eyebrow" style="color:var(--gold-hi)">Season over</div>
      <h2>Everyone survived.</h2><p class="muted mb0">Nobody finished last. Nobody does it. Run it back?</p></div>`;
    const names = lose.map(nameOf).join(' & ');
    const iLost = lose.includes(myId), done = lose.every(id => served.includes(id));
    return `<div class="felt finale"><div class="eyebrow" style="color:var(--gold-hi)">Season over · fewest chips</div>
      <div class="loser">${lose.map(id => ava(League.member(v, id), true)).join('')}<h2 class="mb0">${names}</h2></div>
      <div class="reel-wrap"><div class="reel-label">${lose.length > 1 || iLost ? (iLost && lose.length === 1 ? 'You have to' : 'They have to') : 'Has to'}</div>
        <div class="reel landed">${esc(v.consequence || 'the agreed consequence')}</div></div>
      ${done ? '<p class="mb0" style="color:var(--done)">✓ Done. Respect.</p>' : iLost && !served.includes(myId) ? '<button class="primary" data-action="cl-served">I did it</button><p class="small muted mb0">Post the proof in the feed first.</p>' : '<p class="small muted mb0">Waiting on proof…</p>'}
    </div>`;
  }

  // Live challenge for a league proof: stored per habit + day so closing the sheet can't reroll it.
  const chKey = (s) => `vault.lgch.${s.league}.${s.habit}.${s.day}`;
  function getCh(s) { try { return JSON.parse(localStorage.getItem(chKey(s))) || null; } catch (e) { return null; } }
  function setCh(s, ch) { try { localStorage.setItem(chKey(s), JSON.stringify(ch)); } catch (e) { /* private mode: lives in memory */ } s.ch = ch; }

  function leagueProveSheet(s) {
    const ch = s.ch || getCh(s);
    const t = Date.now();
    const chLive = !!(ch && t <= ch.expiresAt);
    const camOk = Camera.available() && !s.cameraError;
    const cat = Content.challengeCategory(s.title);
    let photo;
    if (!camOk) photo = `<div class="card soft"><p class="mb0 small">Camera unavailable${s.cameraError ? ': ' + esc(s.cameraError) : ''}. You can still post, but the group will see there's no photo and may call sus.</p></div>`;
    else if (s.shot) photo = `<div class="challenge-card done"><span class="eyebrow">Challenge done</span><div class="ch-text">${esc(ch ? ch.text : '')}</div></div>
        <div class="cam-wrap"><img class="shot" src="${s.shot}" alt="your proof photo"></div>
        <div class="row">${chLive ? '<button type="button" data-action="retake">Retake</button>' : '<span class="small muted">Photo taken in time. It counts.</span>'}</div>`;
    else if (!chLive) photo = `<div class="challenge-card sealed"><div class="seal" aria-hidden="true">?</div>
        <span class="eyebrow">Live challenge · ${esc(cat.label)}</span>
        <p class="mb0">${ch ? 'Time ran out. Draw a new one when you\'re ready.' : 'A random action to do on camera. Your league sees the photo and can call sus.'}</p>
        <p class="small muted">You'll have <strong>2 minutes</strong> to take the photo.</p>
        <button type="button" class="primary big-cta" data-action="cl-reveal">${ch ? 'Draw a new challenge' : 'I\'m ready, reveal it'}</button></div>`;
    else photo = `<div class="challenge-card live">
          <div class="row spread"><span class="eyebrow">Your challenge</span><span class="ch-timer" data-chtimer="${ch.expiresAt}">${fmtClock(ch.expiresAt - t)}</span></div>
          <div class="ch-text">${esc(ch.text)}</div>
          <div class="ch-bar"><div data-chbar="${ch.issuedAt}|${ch.expiresAt}" style="width:${Math.max(0, (ch.expiresAt - t) / (ch.expiresAt - ch.issuedAt) * 100)}%"></div></div></div>
        <div class="cam-wrap"><video class="cam" id="cam" playsinline muted></video>
          <button type="button" class="cam-flip" data-action="flip-cam" aria-label="Switch between front and back camera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg></button></div>
        <button type="button" class="primary big-cta" data-action="cl-capture">Take photo</button>`;
    const ready = !camOk || !!s.shot;
    return `<div class="sheet-backdrop" data-action="close-sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="Prove it">
      <button class="ghost close" data-action="close-sheet" aria-label="Close">✕</button>
      <h2>Prove it</h2><p><strong>${esc(s.title)}</strong> · today only</p>
      <form data-form="cloud-proof">${photo}
        ${ready ? `<button class="primary big-cta" type="submit" ${cloud.busy ? 'disabled' : ''}>Post to the league</button>` : ''}
      </form></div></div>`;
  }

  // ---------- sheets (prove / redeem) ----------
  function sheet() {
    const s = ui.sheet;
    if (s.kind === 'prove-bet' || s.kind === 'prove-redemption') return proveSheet(s);
    if (s.kind === 'redeem') return redeemSheet(s);
    if (s.kind === 'prove-league') return leagueProveSheet(s);
    return '';
  }

  function sheetTarget(s) { return s.kind === 'prove-bet' ? Core.betById(state, s.id) : Core.redemptionById(state, s.id); }
  function fmtClock(ms) { ms = Math.max(0, ms); const sec = Math.ceil(ms / 1000); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

  function proveSheet(s) {
    const isBet = s.kind === 'prove-bet';
    const target = sheetTarget(s);
    if (!target || target.status !== 'active') { ui.sheet = null; return ''; }
    const tier = target.proofTier;
    const measured = target.measure && target.measure.kind !== 'binary';
    const camOk = Camera.available() && !s.cameraError;
    const t = now();
    const ch = target.challenge;
    const chLive = !!(ch && t <= ch.expiresAt);
    const cat = Content.challengeCategory(target.title);
    let photo = '';
    if (tier >= 1) {
      if (!camOk) {
        photo = `<div class="card soft"><p class="mb0 small">Camera unavailable${s.cameraError ? ': ' + esc(s.cameraError) : ''}. You can self-attest; it will be marked "camera unavailable" in the ledger.</p></div>`;
      } else if (s.shot) {
        photo = `<div class="challenge-card done"><span class="eyebrow">Challenge done</span><div class="ch-text">${esc(ch ? ch.text : '')}</div></div>
          <div class="cam-wrap"><img class="shot" src="${s.shot}" alt="your proof photo"></div>
          <div class="row">${chLive ? `<button type="button" data-action="retake">Retake</button><span class="small muted">You can retake until the timer ends.</span>` : '<span class="small muted">Photo taken in time. It counts.</span>'}</div>`;
      } else if (!chLive) {
        photo = `<div class="challenge-card sealed">
          <div class="seal" aria-hidden="true">?</div>
          <span class="eyebrow">Live challenge · ${esc(cat.label)}</span>
          <p class="mb0">${ch ? 'Time ran out. Draw a new one when you\'re ready.' : 'A random action to do on camera, so an old or staged photo won\'t work. It stays hidden until you\'re ready.'}</p>
          <p class="small muted">You'll have <strong>2 minutes</strong> to take the photo.</p>
          <button type="button" class="primary big-cta" data-action="reveal-challenge">${ch ? 'Draw a new challenge' : 'I\'m ready, reveal it'}</button>
        </div>`;
      } else {
        photo = `<div class="challenge-card live">
            <div class="row spread"><span class="eyebrow">Your challenge</span><span class="ch-timer" data-chtimer="${ch.expiresAt}">${fmtClock(ch.expiresAt - t)}</span></div>
            <div class="ch-text">${esc(ch.text)}</div>
            <div class="ch-bar"><div data-chbar="${ch.issuedAt}|${ch.expiresAt}" style="width:${Math.max(0, (ch.expiresAt - t) / (ch.expiresAt - ch.issuedAt) * 100)}%"></div></div>
          </div>
          <div class="cam-wrap"><video class="cam" id="cam" playsinline muted></video>
            <div class="cam-overlay">${target.proofCode}</div>
            <button type="button" class="cam-flip" data-action="flip-cam" aria-label="Switch between front and back camera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg></button>
          </div>
          <button type="button" class="primary big-cta" data-action="capture">Take photo</button>`;
      }
    }
    const ready = tier < 1 || !camOk || !!s.shot;
    return `<div class="sheet-backdrop" data-action="close-sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="Prove it">
      <button class="ghost close" data-action="close-sheet" aria-label="Close">✕</button>
      <h2>Prove it</h2>
      <p><strong>${esc(target.title)}</strong> · ${esc(measureText(target.measure))} · ${countdown(target.deadline)}</p>
      <form data-form="proof" data-kind="${s.kind}" data-id="${target.id}">
        ${tier >= 1 ? photo : `<label class="row" style="font-weight:500"><input type="checkbox" name="attest" required style="width:auto"> I did this. On my honor.</label>`}
        ${ready ? `
          ${!isBet && measured ? `<label>How much did you do? <span class="hint">target ${target.measure.amount} ${esc(target.measure.unit)}; less than the target unlocks a share and uses a chance</span>
            <input name="done" type="number" min="0" step="any" value="${target.measure.amount}" required></label>` : ''}
          <label>Note <span class="hint">optional</span><input name="note" maxlength="200" placeholder="How did it go?"></label>
          <button class="primary big-cta" type="submit">${isBet ? 'Submit proof, keep my ' + fmtCredits(target.stake) + ' chips' : 'Submit proof'}</button>` : ''}
      </form></div></div>`;
  }

  function redeemSheet(s) {
    const e = Core.entryById(state, s.id);
    if (!e) { ui.sheet = null; return ''; }
    const bet = Core.betById(state, e.betId);
    const t = now();
    const origWindow = bet.deadline - bet.createdAt;
    const d = s.draft || (s.draft = {
      title: bet.title + ' (harder)',
      measureKind: bet.measure.kind === 'binary' ? 'quantity' : bet.measure.kind,
      measureAmount: Math.ceil(bet.measure.amount * RULES.HARDER_MULTIPLIER * 10) / 10,
      measureUnit: bet.measure.kind === 'binary' ? 'times' : bet.measure.unit,
      deadline: Math.min(e.decaysAt, t + Math.max(RULES.MIN_WINDOW_MS, Math.floor(origWindow * RULES.HARDER_WINDOW_FRACTION))),
      proofTier: bet.proofTier
    });
    const challenge = { measure: { kind: d.measureKind, amount: d.measureAmount, unit: d.measureUnit }, deadline: d.deadline, proofTier: d.proofTier };
    let dims = [];
    try { dims = Core.harderBy(bet, challenge, t); } catch (err) { dims = []; }
    const dimLabel = (k, on, text) => `<span class="pill ${on ? 'on' : 'off'}">${text}</span>`;
    const need = { quantity: `amount ≥ ${Core.round(bet.measure.amount * RULES.HARDER_MULTIPLIER)} ${esc(bet.measure.kind === 'binary' ? 'times' : bet.measure.unit)}`, deadline: `window ≤ ${fmtDur(origWindow * RULES.HARDER_WINDOW_FRACTION)}`, proof: 'stricter proof' };
    return `<div class="sheet-backdrop" data-action="close-sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">
      <button class="ghost close" data-action="close-sheet" aria-label="Close">✕</button>
      <h2>Earn it back</h2>
      <p>${fmtCredits(e.amount)} chips locked from <strong>${esc(bet.title)}</strong> (${esc(measureText(bet.measure))} in ${fmtDur(origWindow)}). ${e.chancesLeft} chance${e.chancesLeft === 1 ? '' : 's'} left.</p>
      <form data-form="redeem" data-id="${e.id}">
        <label>Challenge <input name="title" required maxlength="120" value="${esc(d.title)}"></label>
        <div class="form-row">
          <label>Measured as <select name="measureKind">
            <option value="quantity" ${d.measureKind === 'quantity' ? 'selected' : ''}>A quantity</option>
            <option value="duration" ${d.measureKind === 'duration' ? 'selected' : ''}>A duration</option>
          </select></label>
          <label>Amount &amp; unit <div class="row" style="flex-wrap:nowrap"><input name="measureAmount" type="number" min="0.1" step="any" value="${d.measureAmount}" style="max-width:40%"><input name="measureUnit" value="${esc(d.measureUnit)}"></div></label>
        </div>
        <div class="form-row">
          <label>Deadline <input type="datetime-local" name="deadline" value="${toLocalInput(d.deadline)}"></label>
          <label>Proof <select name="proofTier">
            <option value="0" ${d.proofTier === 0 ? 'selected' : ''}>Honor</option>
            <option value="1" ${d.proofTier === 1 ? 'selected' : ''}>Live photo</option>
          </select></label>
        </div>
        <div class="harder"><strong>Harder by:</strong>
          ${dimLabel('quantity', dims.includes('quantity') || dims.includes('duration'), need.quantity)}
          ${dimLabel('deadline', dims.includes('deadline'), need.deadline)}
          ${dimLabel('proof', dims.includes('proof'), need.proof)}
        </div>
        <p class="small muted mb0">Must finish before the entry decays (${esc(fmtWhen(e.decaysAt))}). Partial completion unlocks a proportional share.</p>
        <div><button class="primary big-cta" type="submit" ${dims.length ? '' : 'disabled'}>${dims.length ? 'Start this challenge' : 'Not harder yet'}</button></div>
      </form></div></div>`;
  }

  // ---------- after render ----------
  function mountHero3d() { const el = app.querySelector('.hero-art'); if (el && window.Hero3D) window.Hero3D.mount(el); }
  window.addEventListener('hero3d-ready', mountHero3d);

  async function afterRender() {
    mountIntro();
    document.body.classList.toggle('hero-home', !!app.querySelector('.hstill'));
    animateCounts();
    mountHero3d();
    if (ui.tab === 'league') animateReel();
    const xp = app.querySelector('[data-xp]');
    if (xp) {
      const to = Number(xp.dataset.xp);
      xp.style.width = (ui.lastXp == null ? 0 : ui.lastXp) + '%';
      requestAnimationFrame(() => requestAnimationFrame(() => { xp.style.width = to + '%'; }));
      ui.lastXp = to;
    }
    // focus the first field of an open sheet
    const first = sheetRoot.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea, button.primary');
    if (first && !sheetRoot.contains(document.activeElement)) setTimeout(() => first.focus(), 0);
    // proof thumbnails from IndexedDB
    app.querySelectorAll('img[data-media]').forEach(img => Storage.getMedia(img.dataset.media).then(url => { if (url) img.src = url; else img.remove(); }));
    // camera
    const video = document.getElementById('cam');
    if (video && !ui.sheet.shot) {
      try { await Camera.start(video); }
      catch (err) { ui.sheet.cameraError = err && err.message ? err.message : 'permission denied'; Camera.stop(); render(); }
    } else if (!video) Camera.stop();
  }

  // live countdowns without re-rendering
  setInterval(() => {
    const t = now();
    document.querySelectorAll('[data-countdown]').forEach(el => {
      const left = Number(el.dataset.countdown) - t;
      el.textContent = left < 0 ? 'overdue' : fmtDur(left) + (el.dataset.label ? ' ' + el.dataset.label : '');
      el.classList.toggle('urgent', left < HOUR); el.classList.toggle('soon', left >= HOUR && left < 6 * HOUR);
    });
    let expired = false;
    document.querySelectorAll('[data-chtimer]').forEach(el => {
      const left = Number(el.dataset.chtimer) - t;
      el.textContent = fmtClock(left); el.classList.toggle('urgent', left < 30 * 1000);
      if (left <= 0) expired = true;
    });
    document.querySelectorAll('[data-chbar]').forEach(el => {
      const [a, b] = el.dataset.chbar.split('|').map(Number);
      el.style.width = Math.max(0, (b - t) / (b - a) * 100) + '%';
    });
    if (expired && ui.sheet && !ui.sheet.shot) { toast('Time ran out. Draw a new challenge when you\'re ready.', 'lock'); render(); }
  }, 1000);
  setInterval(() => { if (!ui.sheet) tickAndMaybeRender(); }, 30 * 1000);

  // ---------- celebration ----------
  function celebrate() {
    if (reducedMotion()) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:55';
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; document.body.appendChild(c);
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const colors = ['#d7dbe1', '#d7dbe1', '#2a2d32', '#6b717a', '#b89b6a'];
    const W = innerWidth, H = innerHeight;
    const parts = Array.from({ length: 70 }, () => ({
      x: W / 2 + (Math.random() - .5) * 60, y: H * .42, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 5,
      r: 8 + Math.random() * 6, col: colors[Math.floor(Math.random() * colors.length)], spin: Math.random() * 6, vs: .08 + Math.random() * .18
    }));
    function chip(p) {
      const sx = Math.abs(Math.cos(p.spin)) * .85 + .15; // coin-flip squash
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sx, 1);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = p.r * .26; ctx.setLineDash([p.r * .5, p.r * .5]);
      ctx.beginPath(); ctx.arc(0, 0, p.r * .84, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, p.r * .5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const t0 = performance.now();
    (function frame(t) {
      const dt = (t - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, Math.min(1, (2.3 - dt) / .5));
      for (const p of parts) { p.vy += .42; p.vx *= .995; p.x += p.vx; p.y += p.vy; p.spin += p.vs; chip(p); }
      if (dt < 2.3) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // ---------- sample data ----------
  function loadSample() {
    const t = now();
    const mk = (title, over, when) => Core.placeBet(state, Object.assign({ title, stake: 10, deadline: when + 24 * HOUR, proofTier: 1, destination: Content.DESTINATIONS[1], measure: { kind: 'binary' } }, over), when);
    // won bet, 3 days ago
    const w = mk('Read 20 pages', { stake: 10, measure: { kind: 'quantity', amount: 20, unit: 'pages' }, why: 'Finish the book before the test.' }, t - 3 * DAY);
    Core.submitBetProof(state, w.id, { kind: 'self', cameraUnavailable: true, note: 'Sample' }, t - 3 * DAY + 5 * HOUR);
    // redeemed entry: locked 5 days ago, redeemed 4 days ago
    const r0 = mk('Run 3 km', { stake: 15, measure: { kind: 'quantity', amount: 3, unit: 'km' } }, t - 6 * DAY);
    Core.tick(state, t - 5 * DAY + HOUR);
    const e0 = Core.entryForBet(state, r0.id);
    const red0 = Core.createRedemption(state, e0.id, { title: 'Run 5 km', measure: { kind: 'quantity', amount: 5, unit: 'km' }, deadline: t - 4 * DAY + 12 * HOUR, proofTier: 1 }, t - 5 * DAY + 2 * HOUR);
    Core.submitRedemptionProof(state, red0.id, { kind: 'self', cameraUnavailable: true, done: 5, note: 'Sample' }, t - 4 * DAY + 3 * HOUR);
    Core.setWhatGotInTheWay(state, e0.id, 'Rain, and no indoor backup plan.');
    // locked entry with 2 chances left: placed 2 days ago, missed, one failed attempt
    const l = mk('Study 45 minutes', { stake: 20, measure: { kind: 'duration', amount: 45, unit: 'minutes' }, why: 'Chem exam Friday.' }, t - 2 * DAY);
    Core.tick(state, t - DAY + HOUR);
    const e1 = Core.entryForBet(state, l.id);
    Core.createRedemption(state, e1.id, { title: 'Study 70 minutes', measure: { kind: 'duration', amount: 70, unit: 'minutes' }, deadline: t - 6 * HOUR, proofTier: 1 }, t - DAY + 2 * HOUR);
    Core.tick(state, t - 5 * HOUR);
    Core.setWhatGotInTheWay(state, e1.id, 'Started at 10pm. Too late.');
    // active bets
    mk('Run 5 km', { stake: 25, deadline: t + 20 * HOUR, measure: { kind: 'quantity', amount: 5, unit: 'km' }, why: 'Race in March.' }, t - 2 * HOUR);
    mk('No phone after 10pm', { stake: 5, proofTier: 0, deadline: t + 3 * DAY, destination: Content.DESTINATIONS[2] }, t - 30 * MIN);
    if (!state.settings.name) state.settings.name = '';
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function tryRun(fn, okMsg) {
    try { const r = fn(); if (okMsg) toast(okMsg); commit(); return r; }
    catch (err) { toast(err.message); return null; }
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); ui.sheet = null; setTab(nav.dataset.nav); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'close-sheet-backdrop' && e.target !== btn) return; // click inside the sheet

    switch (a) {
      case 'nav': ui.sheet = null; setTab(btn.dataset.tab); break;
      case 'close-sheet': case 'close-sheet-backdrop': ui.sheet = null; Camera.stop(); render(); break;

      case 'open-prove-bet': ui.sheet = { kind: 'prove-bet', id: btn.dataset.id }; render(); break;
      case 'open-prove-redemption': ui.sheet = { kind: 'prove-redemption', id: btn.dataset.id }; render(); break;
      case 'open-redeem': ui.sheet = { kind: 'redeem', id: btn.dataset.id }; render(); break;

      case 'reveal-challenge': {
        const target = sheetTarget(ui.sheet); if (!target) break;
        const pick = Content.pickChallenge(target.title, target.challenge && target.challenge.text);
        if (tryRun(() => Core.drawChallenge(state, ui.sheet.kind === 'prove-bet' ? 'bet' : 'redemption', target.id, pick.text, now()))) Sfx.chip();
        break;
      }
      case 'capture': {
        const v = document.getElementById('cam'); if (!v) break;
        const target = sheetTarget(ui.sheet);
        const ch = target.challenge;
        if (!ch || now() > ch.expiresAt) { toast('Time ran out. Draw a new challenge.', 'lock'); render(); break; }
        ui.sheet.shot = Camera.capture(v, target.proofCode, ch.text); ui.sheet.shotAt = now();
        Camera.stop(); Sfx.chip(); render(); break;
      }
      case 'retake': ui.sheet.shot = null; ui.sheet.shotAt = null; render(); break;
      case 'flip-cam': Camera.flip(); render(); break;

      case 'cancel-bet': tryRun(() => Core.cancelBet(state, btn.dataset.id, now()), 'Cancelled. Stake returned.'); break;
      case 'extend-bet': tryRun(() => Core.extendBet(state, btn.dataset.id, now()), 'Deadline pushed back 24 hours. Grace token spent.'); break;
      case 'dismiss-away': ui.away = []; render(); break;
      case 'template': {
        const tpl = Content.TEMPLATES[Number(btn.dataset.i)];
        ui.deadlinePick = tpl.deadline; render();
        const f = app.querySelector('form[data-form="bet"]'); if (!f) break;
        f.elements.title.value = tpl.title; f.elements.stake.value = tpl.stake; f.elements.proofTier.value = String(tpl.proofTier);
        f.elements.measureKind.value = tpl.measure.kind; f.elements.measureAmount.value = tpl.measure.amount || ''; f.elements.measureUnit.value = tpl.measure.unit || '';
        f.elements.proofTier.dispatchEvent(new Event('change', { bubbles: true }));
        f.elements.title.focus(); f.elements.title.select();
        break;
      }

      case 'deadline-pick': ui.deadlinePick = btn.dataset.k; if (btn.dataset.k === 'custom') ui.customDeadline = now() + 24 * HOUR; render(); setTimeout(() => { const el = app.querySelector('[name="title"]'); if (el) el.focus(); }, 0); break;
      case 'ob-goal': {
        const g = btn.dataset.v, i = ob.goals.indexOf(g);
        if (i >= 0) ob.goals.splice(i, 1); else if (ob.goals.length < 3) ob.goals.push(g); else { toast('Pick up to 3.'); break; }
        Sfx.chip(); render(); break;
      }
      case 'ob-mode': ob.mode = btn.dataset.v; Sfx.chip(); render(); setTimeout(() => { ob.step = 3; render(); }, 260); break;
      case 'ob-level': ob.level = btn.dataset.v; Sfx.chip(); render(); setTimeout(() => { ob.step = 4; render(); }, 260); break;
      case 'ob-next': ob.step++; render(); break;
      case 'ob-back': ob.step = Math.max(0, ob.step - 1); render(); break;
      case 'ob-skip': finishSetup(true); break;
      case 'ob-finish': Sfx.stake(); finishSetup(false); break;
      case 'redo-setup': state.settings.onboarded = false; delete state.settings.profile; delete state.settings.setupSkipped; try { sessionStorage.removeItem('vault.intro'); } catch (e) { /* ignore */ } Object.assign(ob, { step: 0, goals: [], mode: null, level: null }); Storage.save(state); render(); window.scrollTo({ top: 0 }); break;
      case 'refill': tryRun(() => Core.grant(state, 100 - state.wallet.credits, now(), 'Refill'), 'Refilled to 100 chips.'); break;
      case 'goal-idea': {
        const form = btn.closest('form'); if (!form) break;
        const slot = [1, 2, 3].find(i => !form.elements['t' + i].value.trim());
        if (!slot) { toast('Three habits max. Clear one first.'); break; }
        form.elements['t' + slot].value = btn.dataset.g; rebalance(form); Sfx.chip(); break;
      }
      case 'cl-vote-cons': cloudDo(() => Cloud.voteConsequence(cloud.current, btn.dataset.c), 'Vote locked in.').then(refreshLeague); break;
      case 'hero-start': {
        const n = app.querySelector('form[data-form="cloud-signup"] input[name="name"]') || app.querySelector('form[data-form="cloud-create"] input[name="name"]');
        if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => n.focus({ preventScroll: true }), 450); }
        break;
      }
      case 'hero-solo': ui.prefillBet = myIdeas()[0]; setTab('bets'); break;
      case 'hero-focus-name': { const n = app.querySelector('form[data-form="cloud-signup"] input[name="name"]'); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => n.focus(), 350); } break; }
      case 'lg-mode': ui.lgMode = btn.dataset.m || null; if (ui.lgMode !== 'demo') cloudBoot(); render(); window.scrollTo({ top: 0 }); break;
      case 'cl-cancel-join': cloud.joinCode = null; cloud.preview = null; history.replaceState(null, '', '#league'); render(); break;
      case 'cl-open': openLeague(btn.dataset.id); break;
      case 'cl-back': closeLeague(); break;
      case 'cl-share': {
        const url = btn.dataset.url, text = `Join my Vault league "${btn.dataset.name}". Bet on your habits, last place does the punishment.`;
        if (navigator.share) navigator.share({ title: 'Vault league', text, url }).catch(() => {});
        else navigator.clipboard.writeText(text + ' ' + url).then(() => toast('Invite copied. Paste it in your group chat.', 'win'), () => toast(url));
        break;
      }
      case 'cl-copy': navigator.clipboard.writeText(btn.dataset.url).then(() => toast('Link copied', 'win'), () => toast(btn.dataset.url)); break;
      case 'cl-start': cloudDo(() => Cloud.startLeague(cloud.current), 'Season on! Day 1 starts now.').then(r => { if (r) { Sfx.stake(); refreshLeague(); } }); break;
      case 'cl-leave':
        if (confirm('Leave this league?')) cloudDo(() => Cloud.leaveLeague(cloud.current), 'You left the league.').then(() => closeLeague());
        break;
      case 'cl-prove': {
        ui.sheet = { kind: 'prove-league', league: cloud.current, habit: btn.dataset.h, title: btn.dataset.title, day: Number(btn.dataset.day) };
        ui.sheet.ch = getCh(ui.sheet); render(); break;
      }
      case 'cl-reveal': {
        const s2 = ui.sheet; const pick = Content.pickChallenge(s2.title, s2.ch && s2.ch.text);
        const t0 = Date.now(); setCh(s2, { text: pick.text, issuedAt: t0, expiresAt: t0 + RULES.CHALLENGE_WINDOW_MS });
        Sfx.chip(); render(); break;
      }
      case 'cl-capture': {
        const v2 = document.getElementById('cam'); if (!v2) break;
        const s2 = ui.sheet;
        if (!s2.ch || Date.now() > s2.ch.expiresAt) { toast('Time ran out. Draw a new challenge.', 'lock'); render(); break; }
        s2.shot = Camera.capture(v2, (cloud.data && cloud.data.league.code) || '', s2.ch.text); s2.shotAt = Date.now();
        Camera.stop(); Sfx.chip(); render(); break;
      }
      case 'cl-vote': cloudDo(() => Cloud.vote(btn.dataset.id, btn.dataset.fake === '1'), btn.dataset.fake === '1' ? 'Called sus. The group decides.' : 'Voted legit.').then(refreshLeague); break;
      case 'cl-react': cloudDo(() => Cloud.react(btn.dataset.id, btn.dataset.r, btn.dataset.on === '1')).then(refreshLeague); break;
      case 'cl-pvote': cloudDo(() => Cloud.votePunishment(btn.dataset.id, btn.dataset.yes === '1'), 'Vote counted.').then(refreshLeague); break;
      case 'cl-photo': { const w = window.open(btn.dataset.src, '_blank', 'noopener'); if (!w) toast('Allow pop-ups to view the photo.'); break; }
      case 'cl-spin': {
        const d = cloud.data; const v2 = League.fromCloud(d, Cloud.today(d.league), me());
        const table = League.standings(v2); const loser = table[table.length - 1].id;
        const pool = League.cloudPool(v2); const punishment = pool[Math.floor(Math.random() * pool.length)];
        cloudDo(() => Cloud.setResult(d.league.id, { loser, punishment, tier: v2.tier })).then(r => { if (r) { ui.lgSpin = true; refreshLeague(); } });
        break;
      }
      case 'cl-veto': {
        const d = cloud.data; const v2 = League.fromCloud(d, Cloud.today(d.league), me()); const r0 = d.league.result;
        const t = League.TIER_ORDER[Math.max(0, League.TIER_ORDER.indexOf(r0.tier) - 1)];
        const opts = League.cloudPool(v2, t).filter(p => p !== r0.punishment);
        cloudDo(() => Cloud.veto(d.league.id, opts[Math.floor(Math.random() * opts.length)], t)).then(r => { if (r) { ui.lgSpin = true; refreshLeague(); } });
        break;
      }
      case 'cl-served': cloudDo(() => Cloud.served(cloud.current), 'Done. Respect.').then(r => { if (r) { Sfx.win(); refreshLeague(); } }); break;
      case 'lg-prove': { const e2 = (() => { try { return League.prove(lg, btn.dataset.id); } catch (err) { toast(err.message); return null; } })(); if (e2) { saveLeague(); Sfx.chip(); toast(`+${e2.points} · ${habitTitle('you', e2.habit)}`, 'win'); render(); } break; }
      case 'lg-end-day': { const ev = League.endDay(lg, Math.random, 0); saveLeague(); leagueEvents(ev); render(); break; }
      case 'lg-sim': {
        const all = [];
        do { all.push(...League.endDay(lg, Math.random, .75)); } while (!lg.finished && (btn.dataset.n === 'season' || lg.day % 7 !== 0));
        saveLeague(); leagueEvents(all.filter(e => e.type !== 'sus' || e.entry.day === lg.day - 1)); render(); break;
      }
      case 'lg-sus': {
        try { const r = League.sus(lg, btn.dataset.id, 'you', Math.random); saveLeague(); toast(`Sus vote ${r.yes}–${r.no}: ${r.verdict === 'fake' ? 'ruled FAKE, −20 for them' : 'looks legit'}`, r.verdict === 'fake' ? 'win' : ''); Sfx.chip(); render(); }
        catch (err) { toast(err.message); }
        break;
      }
      case 'lg-react': { League.react(lg, btn.dataset.id, btn.dataset.r); saveLeague(); render(); break; }
      case 'lg-reveal': { League.finish(lg, Math.random); ui.lgSpin = true; saveLeague(); render(); break; }
      case 'lg-veto': { try { League.veto(lg, Math.random); ui.lgSpin = true; saveLeague(); render(); } catch (err) { toast(err.message); } break; }
      case 'lg-served': {
        League.markServed(lg); saveLeague();
        toast(lg.result.loser === 'you' ? 'Proof posted to the group. Debt paid.' : `${League.member(lg, lg.result.loser).name} posted proof. The group voted it legit ✓`, 'win');
        Sfx.win(); render(); break;
      }
      case 'lg-new': case 'lg-reset':
        if (a === 'lg-new' || confirm('End this demo league? Its scores and feed will be deleted.')) { lg = null; saveLeague(); render(); }
        break;
      case 'add-chip': {
        const f = btn.closest('form'); if (!f) break;
        const tier = Number(f.elements.proofTier.value), max = RULES.MAX_STAKE_BY_TIER[tier];
        const cur = Number(f.elements.stake.value) || 0, want = cur + Number(btn.dataset.v);
        f.elements.stake.value = Math.min(max, want);
        if (want > max) toast(`Max ${max} chips on ${TIERS[tier].name.toLowerCase()} proof.`);
        Sfx.chip();
        btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
        break;
      }
      case 'clear-chips': { const f = btn.closest('form'); if (f) { f.elements.stake.value = ''; f.elements.stake.focus(); } break; }
      case 'bet-filter': ui.betFilter = btn.dataset.f; render(); break;
      case 'toggle-vault-history': ui.vaultHistory = !ui.vaultHistory; render(); break;

      case 'time': {
        const ms = Number(btn.dataset.ms);
        state.settings.clockOffset = ms === 0 ? 0 : (state.settings.clockOffset || 0) + ms;
        Storage.save(state);
        const ev = Core.tick(state, now());
        toast(ms === 0 ? 'Clock reset.' : `Jumped forward ${fmtDur(ms)}. ${ev.length ? ev.length + ' thing' + (ev.length === 1 ? '' : 's') + ' happened.' : 'Nothing changed yet.'}`);
        handleEvents(ev);
        commit(); break;
      }
      case 'install': if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; render(); }); } break;
      case 'copy-prove-url': {
        const url = appUrl() + '#prove';
        const done = () => toast('Link copied. Paste it into a Shortcut.', 'win');
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => { document.getElementById('prove-url').select(); toast('Select the link and copy it.'); });
        else { document.getElementById('prove-url').select(); toast('Select the link and copy it.'); }
        break;
      }
      case 'export': Storage.exportJSONWithMedia(state).then(json => download(`vault-${new Date(now()).toISOString().slice(0, 10)}.json`, json)); break;
      case 'import': document.getElementById('import-file').click(); break;
      case 'sample': tryRun(loadSample, 'Sample data added'); setTab('today'); break;
      case 'reset':
        if (confirm('Delete ALL Vault data in this browser, including proof photos? This cannot be undone.')) {
          Storage.clear(); Storage.clearMedia(); state = Core.blank(); ui.sheet = null; commit(); toast('All data deleted');
        }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'import-file' && el.files && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const { state: incoming, media } = Storage.importJSON(reader.result);
          if (confirm(`Import ${incoming.bets.length} bets and ${incoming.vault.length} vault entries? This replaces your current data.`)) {
            state = incoming; commit(); Storage.restoreMedia(media).then(n => { toast(`Imported${n ? ' with ' + n + ' photo' + (n === 1 ? '' : 's') : ''}`); render(); });
          }
        } catch (err) { alert(err.message); }
      };
      reader.readAsText(el.files[0]); el.value = ''; return;
    }
    if (el.form && /^[tc][123]$/.test(el.name || '')) { if (el.name[0] === 't') rebalance(el.form); else updateChipTotal(el.form); return; }
    if (el.dataset.action === 'sound-toggle') {
      state.settings.sound = el.checked; Storage.save(state);
      if (el.checked) Sfx.chip();
      return;
    }
    if (el.dataset.action === 'tier-change') {
      const hint = document.getElementById('stake-hint'); const max = RULES.MAX_STAKE_BY_TIER[Number(el.value)];
      if (hint) hint.textContent = `max ${max} for this proof · tap chips to add`;
      const stake = el.form.elements.stake; if (Number(stake.value) > max) stake.value = max;
      return;
    }
    if (el.name === 'deadline' && el.form && el.form.dataset.form === 'bet') { ui.customDeadline = new Date(el.value).getTime(); return; }
    // redemption builder: live "harder by"
    const rf = el.closest('form[data-form="redeem"]');
    if (rf && ui.sheet && ui.sheet.kind === 'redeem') {
      const f = Object.fromEntries(new FormData(rf).entries());
      ui.sheet.draft = { title: f.title, measureKind: f.measureKind, measureAmount: Number(f.measureAmount), measureUnit: f.measureUnit, deadline: new Date(f.deadline).getTime(), proofTier: Number(f.proofTier) };
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; Camera.stop(); render(); }
  });

  // save "what got in the way" as they type (debounced)
  let wgTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.action === 'wgitw') {
      clearTimeout(wgTimer);
      wgTimer = setTimeout(() => { Core.setWhatGotInTheWay(state, el.dataset.id, el.value); Storage.save(state); }, 400);
    }
    if (el.name === 'title' && el.closest('form[data-form="redeem"]') && ui.sheet) ui.sheet.draft.title = el.value;
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    const t = now();

    switch (form.dataset.form) {
      case 'bet': {
        const deadline = ui.deadlinePick === 'custom' ? new Date(f.deadline).getTime() : quickDeadline(ui.deadlinePick);
        const measure = f.measureKind === 'binary' || !f.measureAmount ? { kind: 'binary' } : { kind: f.measureKind, amount: Number(f.measureAmount), unit: f.measureUnit || undefined };
        const bet = tryRun(() => Core.placeBet(state, { title: f.title, why: f.why, stake: Number(f.stake), deadline, proofTier: Number(f.proofTier), destination: f.destination || Content.DESTINATIONS[0], measure }, t));
        if (bet) { clearPrefill(); Sfx.stake(); toast(`${fmtCredits(bet.stake)} on the table for "${bet.title}". Prove it by ${fmtWhen(bet.deadline)}.`); ui.betFilter = 'active'; setTab('today'); }
        break;
      }
      case 'proof': {
        const kind = form.dataset.kind, id = form.dataset.id;
        const target = kind === 'prove-bet' ? Core.betById(state, id) : Core.redemptionById(state, id);
        const needsPhoto = target.proofTier >= 1;
        const shot = ui.sheet && ui.sheet.shot;
        const cameraUnavailable = needsPhoto && !shot;
        const finish = (mediaKey) => {
          const proof = { kind: shot ? 'photo' : 'self', mediaKey, note: f.note, cameraUnavailable, shotAt: ui.sheet && ui.sheet.shotAt, done: f.done != null ? Number(f.done) : 1 };
          const res = tryRun(() => kind === 'prove-bet' ? Core.submitBetProof(state, id, proof, t) : Core.submitRedemptionProof(state, id, proof, t));
          if (!res) return;
          ui.sheet = null; Camera.stop();
          if (kind === 'prove-bet') { payout({ kicker: 'Proved it', amount: target.stake, sub: `Back in your wallet · ${target.title}` }); celebrate(); Sfx.win(); }
          else if (res.fraction >= 1) { payout({ kicker: 'Earned it back', amount: res.unlocked, sub: 'Out of the Vault and into your wallet.' }); celebrate(); Sfx.win(); }
          else if (res.fraction > 0) { toast(`Partial: ${fmtCredits(res.unlocked)} chips unlocked. One chance used.`, 'win'); Sfx.chip(); }
          else toast('Logged as a miss. One chance used. What got in the way?', 'lock');
          commit();
        };
        if (shot) { const key = Core.uid('media'); Storage.putMedia(key, shot).then(() => finish(key)).catch(() => finish(null)); }
        else finish(null);
        break;
      }
      case 'redeem': {
        const challenge = { title: f.title, measure: { kind: f.measureKind, amount: Number(f.measureAmount), unit: f.measureUnit }, deadline: new Date(f.deadline).getTime(), proofTier: Number(f.proofTier) };
        const r = tryRun(() => Core.createRedemption(state, form.dataset.id, challenge, t));
        if (r) { ui.sheet = null; Sfx.stake(); toast(`Challenge on. Harder by ${r.harderBy.join(', ')}. ${fmtWhen(r.deadline)}.`); commit(); }
        break;
      }
      case 'ob-name': ob.name = (f.name || '').trim().slice(0, 30); if (ob.name) { ob.step = 1; render(); } break;
      case 'cloud-signup':
        cloudDo(() => Cloud.signUp(f.name)).then(async p => {
          if (!p) return;
          if (!state.settings.name) { state.settings.name = p.name; Storage.save(state); }
          cloud.leagues = await Cloud.myLeagues().catch(() => []);
          toast(`Welcome, ${p.name}.`, 'win'); if (cloud.joinCode) loadPreview(); render();
        });
        break;
      case 'cloud-create':
        cloudDo(() => Cloud.createLeague({ name: f.name, tier: f.tier, weeks: Number(f.weeks), habits: readHabits(f) }), 'League created. Now invite your friends.')
          .then(g => { if (g) { Sfx.stake(); openLeague(g.id); } });
        break;
      case 'cloud-code': cloud.joinCode = String(f.code || '').trim().toUpperCase(); cloud.preview = null; loadPreview(); render(); break;
      case 'cloud-join':
        cloudDo(() => Cloud.joinLeague(cloud.joinCode, readHabits(f)), 'You\'re in.').then(id => {
          if (!id) return;
          cloud.joinCode = null; cloud.preview = null; history.replaceState(null, '', '#league'); Sfx.stake(); openLeague(id);
        });
        break;
      case 'cloud-chat': {
        const input = form.elements.body;
        cloudDo(() => Cloud.postChat(cloud.current, f.body)).then(() => { input.value = ''; refreshLeague(); });
        break;
      }
      case 'cloud-cons': {
        const bad = League.screenPunishment(f.text);
        if (bad) { toast('Rejected: ' + bad, 'lock'); break; }
        cloudDo(() => Cloud.voteConsequence(cloud.current, f.text.trim()), 'Proposed, and your vote is on it.').then(refreshLeague);
        break;
      }
      case 'cloud-suggest': {
        const bad = League.screenPunishment(f.text);
        if (bad) { toast('Rejected: ' + bad, 'lock'); break; }
        cloudDo(() => Cloud.suggest(cloud.current, f.text.trim(), f.tier), 'Suggested. The group votes now.').then(refreshLeague);
        break;
      }
      case 'cloud-proof': {
        const s2 = ui.sheet;
        cloudDo(() => Cloud.postProof(s2.league, s2.habit, s2.day, s2.ch && s2.ch.text, s2.shot)).then(id => {
          if (!id) { render(); return; }
          ui.sheet = null; Camera.stop();
          payout({ kicker: 'Posted to the league', amount: 10, sub: `${s2.title} · your friends can see it now` });
          Sfx.win(); celebrate(); refreshLeague();
        });
        render();
        break;
      }
      case 'league-create': {
        try {
          lg = League.create({ name: f.name, habits: [f.h1, f.h2], weeks: Number(f.weeks), tier: f.tier, you: state.settings.name || 'You' });
          saveLeague(); Sfx.stake(); toast('Season on. Prove your habits, then end the day.', 'win'); render(); window.scrollTo({ top: 0 });
        } catch (err) { toast(err.message); }
        break;
      }
      case 'lg-custom': {
        try { const r = League.addCustom(lg, f.text, f.tier, Math.random); saveLeague(); toast(r.reason, r.approved ? 'win' : 'lock'); if (r.approved) render(); }
        catch (err) { toast(err.message); }
        break;
      }
      case 'settings': state.settings.name = (f.name || '').trim(); commit(); toast('Saved'); break;
    }
  });

  // ---------- boot ----------
  (function boot() {
    const t = now();
    const lastSeen = state.settings.lastSeenAt || 0;
    Core.tick(state, t);
    if (lastSeen) {
      for (const e of state.vault) {
        const bet = Core.betById(state, e.betId);
        if (e.lockedAt > lastSeen && e.status === 'locked') ui.away.push({ type: 'locked', title: bet.title, amount: e.amount, chances: e.chancesLeft });
        if (e.status === 'decayed' && e.decayedAt > lastSeen) ui.away.push({ type: 'decayed', title: bet.title, amount: e.amount, destination: e.destination });
      }
    }
    state.settings.lastSeenAt = t;
    state.settings.simple = true; // misses just cost chips (no vault / comebacks)
    Storage.save(state);
    setTab(location.hash.slice(1) || 'league');
    window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
    if (!needsSetup()) playIntro(); // new users see it right after the setup questions instead
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  })();
})();
