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
    deadlinePick: '24h'
  };

  const app = document.getElementById('app');
  const sheetRoot = document.getElementById('sheet-root');
  const TABS = ['today', 'bets', 'vault', 'ledger', 'learn', 'settings'];

  // ---------- time (supports the testing "time machine") ----------
  function now() { return Date.now() + (state.settings.clockOffset || 0); }

  function commit() { Storage.save(state); render(); }

  function tickAndMaybeRender() {
    const events = Core.tick(state, now());
    if (events.length) {
      Storage.save(state);
      for (const ev of events) {
        if (ev.type === 'locked') toast(`"${ev.bet.title}" missed. ${ev.bet.stake} credits are in the Vault, not gone.`);
        if (ev.type === 'decayed') toast(`${ev.entry.amount} credits went to ${ev.entry.destination}.`);
      }
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
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------- routing ----------
  function setTab(tab) {
    ui.tab = TABS.includes(tab) ? tab : 'today';
    if (location.hash !== '#' + ui.tab) history.replaceState(null, '', '#' + ui.tab);
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.nav === ui.tab));
    render(); window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  // ---------- render ----------
  function render() {
    Core.tick(state, now());
    const views = { today, bets, vault, ledger, learn, settings };
    app.innerHTML = views[ui.tab]();
    sheetRoot.innerHTML = ui.sheet ? sheet() : '';
    document.body.style.overflow = ui.sheet ? 'hidden' : '';
    afterRender();
  }

  function balancesBlock() {
    const b = Core.balances(state);
    return `<div class="balances">
      <div class="card"><div class="num">${fmtCredits(b.wallet)}</div><div class="label">wallet</div></div>
      <div class="card stake"><div class="num">${fmtCredits(b.atStake)}</div><div class="label">at stake</div></div>
      <div class="card vault"><div class="num">${fmtCredits(b.inVault)}</div><div class="label">in the Vault</div></div>
    </div>`;
  }

  function betCard(b, opts = {}) {
    const t = now();
    const canCancel = b.status === 'active' && t - b.createdAt <= RULES.COOLING_OFF_MS;
    const proof = b.proofIds.length ? state.proofs.find(p => p.id === b.proofIds[b.proofIds.length - 1]) : null;
    const entry = Core.entryForBet(state, b.id);
    return `<div class="card bet-card" data-bet="${b.id}">
      <div class="top">
        <div><div class="title">${esc(b.title)}</div>${b.why ? `<div class="small muted">${esc(b.why)}</div>` : ''}</div>
        <div class="amt">${fmtCredits(b.stake)}<span class="small muted"> cr</span></div>
      </div>
      <div class="meta">
        <span class="pill ${b.status === 'won' ? 'done' : b.status === 'locked' ? 'partial' : b.status === 'cancelled' ? '' : 'accent'}">${b.status}</span>
        ${tierPill(b.proofTier)}
        <span>${esc(measureText(b.measure))}</span>
        ${b.status === 'active' ? `<span>· due ${esc(fmtWhen(b.deadline))} · ${countdown(b.deadline)}</span>` : `<span>· ${esc(fmtWhen(b.resolvedAt || b.deadline))}</span>`}
      </div>
      ${b.status === 'active' && b.proofTier >= 1 ? `<div class="small muted">Proof code <span class="code">${b.proofCode}</span> must be visible in your photo.</div>` : ''}
      ${proof && proof.mediaKey ? `<img class="thumb" data-media="${proof.mediaKey}" alt="proof photo">` : ''}
      ${entry && b.status === 'locked' ? `<div class="small muted">Vault: ${fmtCredits(entry.amount)} locked · ${chances(entry.chancesLeft)} · ${entry.status === 'locked' ? 'decays ' + countdown(entry.decaysAt, 'from now') : entry.status}</div>` : ''}
      ${b.status === 'active' ? `<div class="row">
        <button class="primary" data-action="open-prove-bet" data-id="${b.id}">Prove it</button>
        ${canCancel ? `<button class="ghost" data-action="cancel-bet" data-id="${b.id}">Cancel (${fmtDur(RULES.COOLING_OFF_MS - (t - b.createdAt))} left)</button>` : ''}
      </div>` : ''}
      ${entry && entry.status === 'locked' && opts.redeemButton !== false ? `<div class="row"><button data-action="nav" data-tab="vault">Open in Vault</button></div>` : ''}
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
        <div class="amt">${fmtCredits(e.amount)}<span class="small muted"> cr</span></div>
      </div>
      <div class="meta mt">
        <span class="pill ${e.status === 'locked' ? 'partial' : e.status === 'redeemed' ? 'done' : 'missed'}">${e.status}</span>
        ${e.status === 'locked' ? `<span>${chances(e.chancesLeft)} ${e.chancesLeft} chance${e.chancesLeft === 1 ? '' : 's'}</span><span>· decays in ${countdown(e.decaysAt, '')}</span>` : ''}
        <span>· to ${esc(e.destination)}</span>
      </div>
      ${red ? `<div class="card soft mt">
        <div class="row spread"><strong>Redemption: ${esc(red.title)}</strong><span class="amt small">${fmtCredits(e.amount)} cr</span></div>
        <div class="meta"><span>${esc(measureText(red.measure))}</span>${tierPill(red.proofTier)}<span>· harder by ${red.harderBy.join(', ')}</span><span>· ${countdown(red.deadline)}</span></div>
        ${red.proofTier >= 1 ? `<div class="small muted">Proof code <span class="code">${red.proofCode}</span></div>` : ''}
        <div class="row mt"><button class="primary" data-action="open-prove-redemption" data-id="${red.id}">Prove it</button></div>
      </div>` : ''}
      ${canRedeem ? `<div class="row mt"><button class="primary" data-action="open-redeem" data-id="${e.id}">Earn it back</button></div>` : ''}
      ${e.status === 'locked' && e.chancesLeft === 0 && !red ? `<p class="small muted mt">No chances left. ${fmtCredits(e.amount)} credits go to ${esc(e.destination)} when the timer ends.</p>` : ''}
      ${full ? `
        ${past.length ? `<details class="mt"><summary>${past.length} past attempt${past.length === 1 ? '' : 's'}</summary>
          ${past.map(r => `<div class="small mt"><span class="pill ${r.status === 'succeeded' ? 'done' : r.status === 'partial' ? 'partial' : 'missed'}">${r.status}</span> ${esc(r.title)} · ${esc(measureText(r.measure))}${r.unlocked ? ` · unlocked ${fmtCredits(r.unlocked)}` : ''}</div>`).join('')}
        </details>` : ''}
        <label class="mt">What got in the way? <span class="hint">Describe, don't judge. This is for you.</span>
          <textarea data-action="wgitw" data-id="${e.id}" rows="2" placeholder="e.g. Practice ran late and I didn't have a shorter version planned.">${esc(e.whatGotInTheWay)}</textarea>
        </label>` : ''}
    </div>`;
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

    if (!state.bets.length) {
      return `<div class="page-head"><div><h1>${greet}</h1><p class="muted">You have ${fmtCredits(state.wallet.credits)} credits. Bet on yourself.</p></div></div>
        <div class="card">
          <h2>How Vault works</h2>
          <p><strong>1. Place a bet.</strong> A goal, a stake, an honest deadline.</p>
          <p><strong>2. Prove it.</strong> Before the deadline. Keep your credits.</p>
          <p><strong>3. Miss it?</strong> The stake is locked in your Vault, not lost. You get three chances to earn it back by doing something harder.</p>
          <p class="muted small">Phase 0 uses play credits. We never keep your money, now or later.</p>
          <div class="row"><button class="primary big-cta" data-action="nav" data-tab="bets">Place your first bet</button></div>
          <div class="row mt"><button class="ghost" data-action="sample">Or load sample data to look around</button></div>
        </div>
        <div class="card soft mt"><h3>Today's prompt</h3><p class="mb0">${esc(todaysPrompt())}</p></div>`;
    }

    return `<div class="page-head"><div><h1>${greet}</h1><p class="muted">${esc(new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p></div>
        <button class="primary" data-action="nav" data-tab="bets">New bet</button></div>
      ${balancesBlock()}
      <div class="row small muted mt" style="gap:1rem">
        <span>Win rate <strong>${st.winRate == null ? '—' : st.winRate + '%'}</strong></span>
        <span>Streak <strong>${st.streak}</strong></span>
        <span>Saved by proving it <strong>${fmtCredits(st.saved)}</strong></span>
        ${st.everLocked ? `<span>Recovered <strong>${st.recoveryRate}%</strong></span>` : ''}
      </div>

      <div class="section-title"><h2>Active bets</h2><span class="small muted">${active.length}</span></div>
      ${active.length ? `<div class="stack">${active.map(b => betCard(b)).join('')}</div>` : `<div class="card soft"><p class="mb0">No active bets. ${locked.length ? 'Your Vault has something to earn back.' : 'Place one while you mean it.'}</p></div>`}

      ${locked.length ? `<div class="section-title"><h2>In the Vault</h2><span class="small muted">${fmtCredits(locked.reduce((n, e) => n + e.amount, 0))} cr</span></div>
        <div class="stack">${locked.map(e => entryCard(e, false)).join('')}</div>` : ''}

      <div class="card soft mt"><h3>Today's prompt</h3><p class="mb0">${esc(todaysPrompt())}</p></div>`;
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
        <form data-form="bet">
          <label>What will you do? <input name="title" required maxlength="120" placeholder="e.g. Run 5 km" autocomplete="off"></label>
          <div class="form-row">
            <label>Stake <span class="hint" id="stake-hint">max ${RULES.MAX_STAKE_BY_TIER[defaultTier]} for this proof</span>
              <input name="stake" type="number" min="1" step="1" required value="10" inputmode="numeric"></label>
            <label>Proof
              <select name="proofTier" data-action="tier-change">
                <option value="0">Honor · max ${RULES.MAX_STAKE_BY_TIER[0]}</option>
                <option value="1" selected>Live photo · max ${RULES.MAX_STAKE_BY_TIER[1]}</option>
                <option value="2" disabled>Partner · max ${RULES.MAX_STAKE_BY_TIER[2]} (Phase 1)</option>
                <option value="3" disabled>Integration · max ${RULES.MAX_STAKE_BY_TIER[3]} (Phase 1)</option>
              </select></label>
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
              <label>If it decays, credits go to
                <select name="destination">${Content.DESTINATIONS.map(d => `<option>${esc(d)}</option>`).join('')}</select></label>
            </div>
          </details>
          <p class="small muted mb0">You can cancel within 10 minutes. After that it's live. Missed stakes are locked for 30 days, not lost.</p>
          <div><button class="primary big-cta" type="submit">Stake it</button></div>
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
      <div class="section-title"><h2>Locked</h2><span class="small muted">${locked.length}</span></div>
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
      <div class="card mt">
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

  function settings() {
    const off = state.settings.clockOffset || 0;
    return `<div class="page-head"><div><h1>Settings</h1><p class="muted">Your data lives in this browser only.</p></div></div>
      <div class="stack">
        <div class="card"><h2>Profile</h2>
          <form data-form="settings"><label>Your name <input name="name" maxlength="60" value="${esc(state.settings.name)}" placeholder="e.g. Sam"></label>
          <div><button class="primary" type="submit">Save</button></div></form></div>
        <div class="card"><h2>Real money</h2>
          <p class="small muted">Off, and not available yet (Phase 2). When it ships it will be opt-in, with a Stripe hold that is only captured if a stake decays, so we never hold your funds and never keep them.</p>
          <label class="row" style="font-weight:400"><input type="checkbox" disabled style="width:auto"> Enable real money (coming later)</label></div>
        <div class="card"><h2>Backup &amp; move</h2>
          <p class="small muted">${state.bets.length} bets · ${state.vault.length} vault entries · ${state.ledger.length} ledger lines. Export to move to another computer. Photos are not included in the export (Phase 1).</p>
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

  // ---------- sheets (prove / redeem) ----------
  function sheet() {
    const s = ui.sheet;
    if (s.kind === 'prove-bet' || s.kind === 'prove-redemption') return proveSheet(s);
    if (s.kind === 'redeem') return redeemSheet(s);
    return '';
  }

  function proveSheet(s) {
    const isBet = s.kind === 'prove-bet';
    const target = isBet ? Core.betById(state, s.id) : Core.redemptionById(state, s.id);
    if (!target) { ui.sheet = null; return ''; }
    const tier = target.proofTier;
    const measured = target.measure && target.measure.kind !== 'binary';
    const camOk = Camera.available() && !s.cameraError;
    return `<div class="sheet-backdrop" data-action="close-sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">
      <button class="ghost close" data-action="close-sheet" aria-label="Close">✕</button>
      <h2>Prove it</h2>
      <p><strong>${esc(target.title)}</strong> · ${esc(measureText(target.measure))} · ${countdown(target.deadline)}</p>
      <form data-form="proof" data-kind="${s.kind}" data-id="${target.id}">
        ${tier >= 1 ? `
          <p class="small muted">Live photo. Your proof code <span class="code">${target.proofCode}</span> is stamped on the shot; have it in frame (write it on paper or show it on another screen).</p>
          <div class="cam-wrap">
            ${s.shot ? `<img class="shot" src="${s.shot}" alt="your proof photo">` :
              camOk ? `<video class="cam" id="cam" playsinline muted></video><div class="cam-overlay">${target.proofCode}</div>` :
              `<div class="card soft"><p class="mb0 small">Camera unavailable${s.cameraError ? ': ' + esc(s.cameraError) : ''}. You can self-attest; it will be marked "camera unavailable" in the ledger.</p></div>`}
          </div>
          <div class="row">
            ${s.shot ? `<button type="button" data-action="retake">Retake</button>` : camOk ? `<button type="button" class="primary" data-action="capture">Take photo</button>` : ''}
          </div>` : `
          <label class="row" style="font-weight:500"><input type="checkbox" name="attest" required style="width:auto"> I did this. On my honor.</label>`}
        ${!isBet && measured ? `<label>How much did you do? <span class="hint">target ${target.measure.amount} ${esc(target.measure.unit)}; less than the target unlocks a share and uses a chance</span>
          <input name="done" type="number" min="0" step="any" value="${target.measure.amount}" required></label>` : ''}
        <label>Note <span class="hint">optional</span><input name="note" maxlength="200" placeholder="How did it go?"></label>
        <div class="row">
          <button class="primary big-cta" type="submit" ${tier >= 1 && camOk && !s.shot ? 'disabled' : ''}>${isBet ? 'Submit proof, keep my ' + fmtCredits(target.stake) + ' credits' : 'Submit proof'}</button>
        </div>
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
      <p>${fmtCredits(e.amount)} credits locked from <strong>${esc(bet.title)}</strong> (${esc(measureText(bet.measure))} in ${fmtDur(origWindow)}). ${e.chancesLeft} chance${e.chancesLeft === 1 ? '' : 's'} left.</p>
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
  async function afterRender() {
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
  }, 1000);
  setInterval(() => { if (!ui.sheet) tickAndMaybeRender(); }, 30 * 1000);

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

      case 'capture': {
        const v = document.getElementById('cam'); if (!v) break;
        const target = ui.sheet.kind === 'prove-bet' ? Core.betById(state, ui.sheet.id) : Core.redemptionById(state, ui.sheet.id);
        ui.sheet.shot = Camera.capture(v, target.proofCode); Camera.stop(); render(); break;
      }
      case 'retake': ui.sheet.shot = null; render(); break;

      case 'cancel-bet': tryRun(() => Core.cancelBet(state, btn.dataset.id, now()), 'Cancelled. Stake returned.'); break;

      case 'deadline-pick': ui.deadlinePick = btn.dataset.k; if (btn.dataset.k === 'custom') ui.customDeadline = now() + 24 * HOUR; render(); setTimeout(() => { const el = app.querySelector('[name="title"]'); if (el) el.focus(); }, 0); break;
      case 'bet-filter': ui.betFilter = btn.dataset.f; render(); break;
      case 'toggle-vault-history': ui.vaultHistory = !ui.vaultHistory; render(); break;

      case 'time': {
        const ms = Number(btn.dataset.ms);
        state.settings.clockOffset = ms === 0 ? 0 : (state.settings.clockOffset || 0) + ms;
        Storage.save(state);
        const ev = Core.tick(state, now());
        toast(ms === 0 ? 'Clock reset.' : `Jumped forward ${fmtDur(ms)}. ${ev.length ? ev.length + ' thing' + (ev.length === 1 ? '' : 's') + ' happened.' : 'Nothing changed yet.'}`);
        commit(); break;
      }
      case 'export': download(`vault-${new Date(now()).toISOString().slice(0, 10)}.json`, Storage.exportJSON(state)); break;
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
          const incoming = Storage.importJSON(reader.result);
          if (confirm(`Import ${incoming.bets.length} bets and ${incoming.vault.length} vault entries? This replaces your current data.`)) { state = incoming; commit(); toast('Imported'); }
        } catch (err) { alert(err.message); }
      };
      reader.readAsText(el.files[0]); el.value = ''; return;
    }
    if (el.dataset.action === 'tier-change') {
      const hint = document.getElementById('stake-hint'); const max = RULES.MAX_STAKE_BY_TIER[Number(el.value)];
      if (hint) hint.textContent = `max ${max} for this proof`;
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
        if (bet) { toast(`Staked ${fmtCredits(bet.stake)} on "${bet.title}". Prove it by ${fmtWhen(bet.deadline)}.`); ui.betFilter = 'active'; setTab('today'); }
        break;
      }
      case 'proof': {
        const kind = form.dataset.kind, id = form.dataset.id;
        const target = kind === 'prove-bet' ? Core.betById(state, id) : Core.redemptionById(state, id);
        const needsPhoto = target.proofTier >= 1;
        const shot = ui.sheet && ui.sheet.shot;
        const cameraUnavailable = needsPhoto && !shot;
        const finish = (mediaKey) => {
          const proof = { kind: shot ? 'photo' : 'self', mediaKey, note: f.note, cameraUnavailable, done: f.done != null ? Number(f.done) : 1 };
          const res = tryRun(() => kind === 'prove-bet' ? Core.submitBetProof(state, id, proof, t) : Core.submitRedemptionProof(state, id, proof, t));
          if (!res) return;
          ui.sheet = null; Camera.stop();
          if (kind === 'prove-bet') toast(`Proved it. ${fmtCredits(target.stake)} credits back in your wallet.`);
          else if (res.fraction >= 1) toast(`Earned back ${fmtCredits(res.unlocked)} credits. Entry closed.`);
          else if (res.fraction > 0) toast(`Partial: ${fmtCredits(res.unlocked)} credits unlocked. One chance used.`);
          else toast('Logged as a miss. One chance used. What got in the way?');
          commit();
        };
        if (shot) { const key = Core.uid('media'); Storage.putMedia(key, shot).then(() => finish(key)).catch(() => finish(null)); }
        else finish(null);
        break;
      }
      case 'redeem': {
        const challenge = { title: f.title, measure: { kind: f.measureKind, amount: Number(f.measureAmount), unit: f.measureUnit }, deadline: new Date(f.deadline).getTime(), proofTier: Number(f.proofTier) };
        const r = tryRun(() => Core.createRedemption(state, form.dataset.id, challenge, t));
        if (r) { ui.sheet = null; toast(`Challenge on. Harder by ${r.harderBy.join(', ')}. ${fmtWhen(r.deadline)}.`); commit(); }
        break;
      }
      case 'settings': state.settings.name = (f.name || '').trim(); commit(); toast('Saved'); break;
    }
  });

  // ---------- boot ----------
  Core.tick(state, now()); Storage.save(state);
  setTab(location.hash.slice(1) || 'today');
})();
