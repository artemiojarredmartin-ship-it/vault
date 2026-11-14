/* Checkpoint — app logic.
 * One state object, one render() per change, event delegation on #app.
 */
(function () {
  'use strict';

  // ---------- State ----------
  let state = Storage.load();
  let ui = {
    tab: 'dashboard',
    editingGoalId: null,     // goal being edited in the Goals tab
    checkinGoalId: null,     // goal selected in the Check-ins tab
    showArchived: false,
    composer: { partnerId: '', goalId: '', text: '' }
  };

  const app = document.getElementById('app');
  const TABS = ['dashboard', 'goals', 'checkins', 'partners', 'learn', 'settings'];

  function commit() { Storage.save(state); render(); }

  // ---------- Date helpers ----------
  const pad = n => String(n).padStart(2, '0');
  function ymd(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { // Monday
    const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x;
  }
  /** Period key for a goal: the day for daily goals, the Monday of the week for weekly goals. */
  function periodKey(goal, date = new Date()) {
    return goal.cadence === 'weekly' ? ymd(startOfWeek(date)) : ymd(date);
  }
  function periodStep(goal, date, n) { return addDays(date, goal.cadence === 'weekly' ? 7 * n : n); }
  function fmtDate(s) {
    const d = parseYmd(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------- Derived data ----------
  function goalById(id) { return state.goals.find(g => g.id === id); }
  function activeGoals() { return state.goals.filter(g => !g.archived); }
  function checkinsFor(goalId) { return state.checkins.filter(c => c.goalId === goalId); }
  function checkinAt(goal, date) {
    const key = periodKey(goal, date);
    return checkinsFor(goal.id).find(c => periodKey(goal, parseYmd(c.date)) === key);
  }
  /** Consecutive periods (ending today or last period) with done/partial. */
  function streak(goal) {
    let n = 0;
    let cursor = new Date();
    // Allow the current period to be unfilled without breaking the streak.
    if (!checkinAt(goal, cursor)) cursor = periodStep(goal, cursor, -1);
    while (true) {
      const c = checkinAt(goal, cursor);
      if (!c || c.status === 'missed') break;
      n++;
      cursor = periodStep(goal, cursor, -1);
      if (n > 3650) break;
    }
    return n;
  }
  function lastNPeriods(goal, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = periodStep(goal, new Date(), -i);
      out.push({ date: d, key: periodKey(goal, d), checkin: checkinAt(goal, d), isCurrent: i === 0 });
    }
    return out;
  }
  function weekStats() {
    const start = startOfWeek(new Date());
    const keys = new Set();
    for (let i = 0; i < 7; i++) keys.add(ymd(addDays(start, i)));
    const thisWeek = state.checkins.filter(c => keys.has(c.date));
    const done = thisWeek.filter(c => c.status === 'done').length;
    const partial = thisWeek.filter(c => c.status === 'partial').length;
    const total = thisWeek.length;
    const lessons = thisWeek.filter(c => c.learned && c.learned.trim()).length;
    const rate = total ? Math.round(((done + partial * 0.5) / total) * 100) : null;
    return { done, partial, total, lessons, rate };
  }
  function dueToday() {
    return activeGoals().filter(g => !checkinAt(g, new Date()));
  }
  function todaysPrompt() {
    const day = Math.floor(Date.now() / 86400000);
    return Content.PROMPTS[day % Content.PROMPTS.length];
  }

  // ---------- Escaping ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  // ---------- Routing ----------
  function setTab(tab) {
    ui.tab = TABS.includes(tab) ? tab : 'dashboard';
    if (location.hash !== '#' + ui.tab) history.replaceState(null, '', '#' + ui.tab);
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.nav === ui.tab));
    render();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  // ---------- Views ----------
  function render() {
    const views = { dashboard, goals, checkins, partners, learn, settings };
    app.innerHTML = views[ui.tab]();
    afterRender();
  }

  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return state.settings.name ? `${part}, ${esc(state.settings.name)}` : part;
  }

  function dashboard() {
    const due = dueToday();
    const ws = weekStats();
    const goalsList = activeGoals();
    const best = goalsList.map(g => ({ g, s: streak(g) })).sort((a, b) => b.s - a.s)[0];

    if (!goalsList.length) {
      return `
        <div class="page-head"><div><h1>${greeting()}</h1><p class="muted">Let's set up your first goal.</p></div></div>
        <div class="card">
          <h2>Welcome to Checkpoint</h2>
          <p>Checkpoint is accountability without the shame. You set goals, check in, and your partner gives feedback in a <strong>supportive</strong> climate — describing rather than judging, asking rather than ordering.</p>
          <p>Start with one goal. Keep it small enough to do on a bad day.</p>
          <div class="row">
            <button class="primary" data-action="nav" data-tab="goals">Create a goal</button>
            <button data-action="nav" data-tab="learn">Read the idea first</button>
          </div>
        </div>
        <div class="card soft mt">
          <h3>Today's prompt</h3>
          <p class="mb0">${esc(todaysPrompt())}</p>
        </div>`;
    }

    return `
      <div class="page-head">
        <div><h1>${greeting()}</h1><p class="muted">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p></div>
        <button class="primary" data-action="nav" data-tab="checkins">Check in</button>
      </div>

      <div class="grid">
        <div class="card stat">
          <div class="num">${due.length}</div>
          <div class="label">${due.length === 1 ? 'goal' : 'goals'} waiting for a check-in</div>
        </div>
        <div class="card stat">
          <div class="num">${ws.rate == null ? '—' : ws.rate + '%'}</div>
          <div class="label">completion this week (${ws.total} check-in${ws.total === 1 ? '' : 's'})</div>
        </div>
        <div class="card stat">
          <div class="num">${ws.lessons}</div>
          <div class="label">lesson${ws.lessons === 1 ? '' : 's'} written down this week</div>
        </div>
        <div class="card stat">
          <div class="num">${best ? best.s : 0}</div>
          <div class="label">${best && best.s ? `longest streak · ${esc(best.g.title)}` : 'longest streak'}</div>
        </div>
      </div>

      <div class="stack mt">
        ${due.length ? `
        <div class="card">
          <h2>Due now</h2>
          <div class="stack">
            ${due.map(g => `
              <div class="row spread">
                <div>
                  <div class="goal-item"><span class="title">${esc(g.title)}</span></div>
                  <div class="small muted">${g.cadence === 'weekly' ? 'this week' : 'today'} · streak ${streak(g)}</div>
                </div>
                <div class="row">
                  <button class="status-btn done sm" data-action="quick-checkin" data-goal="${g.id}" data-status="done">Done</button>
                  <button class="status-btn partial sm" data-action="quick-checkin" data-goal="${g.id}" data-status="partial">Partial</button>
                  <button class="status-btn missed sm" data-action="quick-checkin" data-goal="${g.id}" data-status="missed">Missed</button>
                </div>
              </div>`).join('')}
          </div>
          <p class="small muted mt mb0">Quick check-in skips the note. Use the Check-ins tab to add what you learned.</p>
        </div>` : `
        <div class="card soft">
          <h2>All caught up</h2>
          <p class="mb0">Every active goal has a check-in for this period. Nice.</p>
        </div>`}

        <div class="card">
          <h2>Your goals</h2>
          <div class="stack">
            ${goalsList.map(g => `
              <div>
                <div class="row spread">
                  <span class="title"><strong>${esc(g.title)}</strong> <span class="pill">${g.cadence}</span></span>
                  <span class="small muted streak">streak ${streak(g)}</span>
                </div>
                ${strip(g)}
              </div>`).join('')}
          </div>
        </div>

        <div class="card soft">
          <h3>Today's prompt</h3>
          <p class="mb0">${esc(todaysPrompt())}</p>
        </div>
      </div>`;
  }

  function strip(goal, n = 14) {
    return `<div class="strip" title="Last ${n} ${goal.cadence === 'weekly' ? 'weeks' : 'days'}">
      ${lastNPeriods(goal, n).map(p =>
        `<span class="${p.checkin ? p.checkin.status : ''} ${p.isCurrent ? 'today' : ''}" title="${p.key}${p.checkin ? ' · ' + p.checkin.status : ''}"></span>`
      ).join('')}
    </div>`;
  }

  function goals() {
    const editing = ui.editingGoalId ? goalById(ui.editingGoalId) : null;
    const list = state.goals.filter(g => ui.showArchived || !g.archived);
    return `
      <div class="page-head">
        <div><h1>Goals</h1><p class="muted">Small enough to do on a bad day. Clear enough to know if you did it.</p></div>
      </div>

      <div class="card">
        <h2>${editing ? 'Edit goal' : 'New goal'}</h2>
        <form data-form="goal">
          <input type="hidden" name="id" value="${editing ? editing.id : ''}">
          <label>Goal
            <input name="title" required maxlength="120" placeholder="e.g. Study 30 minutes" value="${editing ? esc(editing.title) : ''}">
          </label>
          <label>Why it matters <span class="hint">Shown on hard days.</span>
            <textarea name="why" maxlength="400" placeholder="e.g. I want to pass this class without the last-minute panic.">${editing ? esc(editing.why) : ''}</textarea>
          </label>
          <div class="form-row">
            <label>Cadence
              <select name="cadence">
                <option value="daily" ${!editing || editing.cadence === 'daily' ? 'selected' : ''}>Daily</option>
                <option value="weekly" ${editing && editing.cadence === 'weekly' ? 'selected' : ''}>Weekly</option>
              </select>
            </label>
            <label>End date <span class="hint">optional</span>
              <input type="date" name="endDate" value="${editing && editing.endDate ? editing.endDate : ''}">
            </label>
          </div>
          <div class="row">
            <button class="primary" type="submit">${editing ? 'Save changes' : 'Add goal'}</button>
            ${editing ? '<button type="button" data-action="cancel-edit">Cancel</button>' : ''}
          </div>
        </form>
      </div>

      <div class="row spread mt">
        <h2 class="mb0">${list.length ? 'Your goals' : ''}</h2>
        <label class="row small" style="font-weight:400">
          <input type="checkbox" data-action="toggle-archived" ${ui.showArchived ? 'checked' : ''} style="width:auto"> Show archived
        </label>
      </div>

      <div class="stack mt">
        ${list.length ? list.map(g => `
          <div class="card goal-item ${g.archived ? 'archived' : ''}">
            <div class="row spread">
              <span class="title">${esc(g.title)} <span class="pill">${g.cadence}</span>${g.archived ? ' <span class="pill">archived</span>' : ''}</span>
              <span class="small muted streak">streak ${streak(g)} · ${checkinsFor(g.id).length} check-ins</span>
            </div>
            ${g.why ? `<div class="why">${esc(g.why)}</div>` : ''}
            ${g.endDate ? `<div class="small muted">Ends ${fmtDate(g.endDate)}</div>` : ''}
            ${strip(g)}
            <div class="row">
              <button class="sm" data-action="edit-goal" data-goal="${g.id}">Edit</button>
              <button class="sm" data-action="archive-goal" data-goal="${g.id}">${g.archived ? 'Unarchive' : 'Archive'}</button>
              <button class="sm ghost danger" data-action="delete-goal" data-goal="${g.id}">Delete</button>
            </div>
          </div>`).join('') : `
          <div class="empty"><div class="big">🎯</div>No goals yet. Add one above.</div>`}
      </div>`;
  }

  function checkins() {
    const goalsList = activeGoals();
    if (!goalsList.length) {
      return `<div class="page-head"><h1>Check-ins</h1></div>
        <div class="empty card"><div class="big">📝</div>Create a goal first, then come back here.<div class="mt"><button class="primary" data-action="nav" data-tab="goals">Go to Goals</button></div></div>`;
    }
    if (!ui.checkinGoalId || !goalsList.some(g => g.id === ui.checkinGoalId)) {
      ui.checkinGoalId = (dueToday()[0] || goalsList[0]).id;
    }
    const goal = goalById(ui.checkinGoalId);
    const today = checkinAt(goal, new Date());
    const history = checkinsFor(goal.id).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

    return `
      <div class="page-head">
        <div><h1>Check-ins</h1><p class="muted">A miss is information. Write down what you learned.</p></div>
      </div>

      <div class="card">
        <label>Goal
          <select data-action="select-checkin-goal">
            ${goalsList.map(g => `<option value="${g.id}" ${g.id === goal.id ? 'selected' : ''}>${esc(g.title)}${checkinAt(g, new Date()) ? ' ✓' : ''}</option>`).join('')}
          </select>
        </label>
        ${goal.why ? `<p class="muted mt">Why: ${esc(goal.why)}</p>` : ''}
        <div class="row small muted"><span>Streak ${streak(goal)}</span><span>·</span><span>${goal.cadence === 'weekly' ? 'Week of ' + fmtDate(periodKey(goal)) : 'Today ' + fmtDate(ymd())}</span></div>
        ${strip(goal, 21)}
      </div>

      <div class="card mt">
        <h2>${today ? 'Update this period' : 'How did it go?'}</h2>
        <form data-form="checkin">
          <input type="hidden" name="goalId" value="${goal.id}">
          <input type="hidden" name="status" value="${today ? today.status : ''}">
          <div class="row">
            <button type="button" class="status-btn done ${today && today.status === 'done' ? 'active' : ''}" data-action="pick-status" data-status="done">✓ Done</button>
            <button type="button" class="status-btn partial ${today && today.status === 'partial' ? 'active' : ''}" data-action="pick-status" data-status="partial">◐ Partial</button>
            <button type="button" class="status-btn missed ${today && today.status === 'missed' ? 'active' : ''}" data-action="pick-status" data-status="missed">✕ Missed</button>
          </div>
          <label>Note <span class="hint">What happened? Describe, don't judge.</span>
            <textarea name="note" maxlength="600" placeholder="e.g. Did 20 of the 30 minutes before practice.">${today ? esc(today.note) : ''}</textarea>
          </label>
          <label>What did you learn? <span class="hint">The most important box on this page.</span>
            <input name="learned" maxlength="200" placeholder="e.g. Mornings work better than after practice." value="${today ? esc(today.learned) : ''}">
          </label>
          <div class="row">
            <button class="primary" type="submit">${today ? 'Save' : 'Log check-in'}</button>
            ${today ? `<button type="button" class="ghost danger" data-action="delete-checkin" data-id="${today.id}">Remove</button>` : ''}
          </div>
        </form>
      </div>

      <div class="card mt">
        <h2>History</h2>
        ${history.length ? `<div class="history">${history.map(c => `
          <div class="history-item">
            <div class="date">${fmtDate(c.date)}</div>
            <div>
              <span class="pill ${c.status}">${c.status}</span>
              ${c.note ? `<div>${esc(c.note)}</div>` : ''}
              ${c.learned ? `<div class="learned small">Learned: ${esc(c.learned)}</div>` : ''}
            </div>
          </div>`).join('')}</div>` : '<p class="muted mb0">No check-ins yet for this goal.</p>'}
      </div>`;
  }

  function partners() {
    const c = ui.composer;
    const partner = state.partners.find(p => p.id === c.partnerId);
    const goal = goalById(c.goalId) || activeGoals()[0];
    const result = Feedback.analyze(c.text);
    const label = Feedback.scoreLabel(result.score);
    const lastLearned = goal ? (checkinsFor(goal.id).filter(x => x.learned).sort((a, b) => b.date.localeCompare(a.date))[0] || {}).learned : '';

    return `
      <div class="page-head">
        <div><h1>Partners</h1><p class="muted">Accountability is a relationship. Make the climate supportive on purpose.</p></div>
      </div>

      <div class="grid">
        <div class="card">
          <h2>Your partners</h2>
          ${state.partners.length ? `<div class="stack">${state.partners.map(p => `
            <div class="row spread">
              <div><strong>${esc(p.name)}</strong>${p.contact ? `<div class="small muted">${esc(p.contact)}</div>` : ''}</div>
              <button class="sm ghost danger" data-action="delete-partner" data-id="${p.id}">Remove</button>
            </div>`).join('')}</div>` : '<p class="muted">No partners yet. Add someone you trust to be honest and kind.</p>'}
          <form data-form="partner" class="mt">
            <div class="form-row">
              <label>Name <input name="name" required maxlength="60" placeholder="e.g. Dad"></label>
              <label>Contact <span class="hint">optional</span> <input name="contact" maxlength="100" placeholder="text, email, Discord…"></label>
            </div>
            <div><button class="primary" type="submit">Add partner</button></div>
          </form>
        </div>

        <div class="card">
          <h2>Progress report</h2>
          <p class="muted small">A plain-text summary you can paste into a message to your partner.</p>
          <pre class="report" id="report">${esc(buildReport())}</pre>
          <div class="row mt">
            <button data-action="copy-report">Copy report</button>
          </div>
        </div>
      </div>

      <div class="card mt">
        <h2>Feedback composer</h2>
        <p class="muted small">Draft a message to your partner (or about their goal). Checkpoint flags phrases that tend to create a defensive climate and suggests a supportive rewrite, using Gibb's six pairs.</p>
        <div class="form-row">
          <label>To
            <select data-action="composer-partner">
              <option value="">— pick a partner —</option>
              ${state.partners.map(p => `<option value="${p.id}" ${p.id === c.partnerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </label>
          <label>About goal
            <select data-action="composer-goal">
              ${activeGoals().map(g => `<option value="${g.id}" ${goal && g.id === goal.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="mt">Your message
          <textarea data-action="composer-text" rows="5" placeholder="Start typing… try 'you always' or 'obviously' to see the detector work.">${esc(c.text)}</textarea>
        </label>
        <div class="row spread mt">
          <span class="small"><strong>Climate:</strong> ${label} ${result.flags.length ? `· ${result.flags.length} flag${result.flags.length === 1 ? '' : 's'}` : ''} ${result.supportiveHits ? `· ${result.supportiveHits} supportive phrase${result.supportiveHits === 1 ? '' : 's'}` : ''}</span>
          <span class="small muted">${c.text.length} chars</span>
        </div>
        <div class="climate-meter mt" aria-label="Climate score ${result.score} of 100"><div style="width:${result.score}%"></div></div>

        ${result.flags.length ? `<div class="flag-list mt">${result.flags.map(f => `
          <div class="flag">
            <div class="cat">${esc(f.label.defensive)} → ${esc(f.label.supportive)}</div>
            <div>"<mark>${esc(f.match)}</mark>" — ${esc(f.label.tip)}</div>
            <div class="swap small">Try: ${esc(f.suggestion)}</div>
          </div>`).join('')}</div>` : (c.text.trim() ? '<p class="small muted mt">No defensive phrases spotted. Read it once more as the receiver would.</p>' : '')}

        <div class="row mt">
          <button data-action="copy-text" ${c.text.trim() ? '' : 'disabled'}>Copy message</button>
          <button class="ghost" data-action="clear-text" ${c.text ? '' : 'disabled'}>Clear</button>
        </div>

        <h3 class="mt">Templates</h3>
        <div class="templates">
          ${Feedback.TEMPLATES.map((t, i) => `
            <button data-action="use-template" data-i="${i}">
              <strong>${esc(t.title)}</strong> <span class="pill accent">${esc(t.cat)}</span><br>
              <span class="small muted">${esc(fillTemplate(t.text, partner, goal, lastLearned)).slice(0, 110)}…</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function fillTemplate(text, partner, goal, learned) {
    return text
      .replace(/\{name\}/g, partner ? partner.name : 'there')
      .replace(/\{goal\}/g, goal ? goal.title : 'your goal')
      .replace(/\{learned\}/g, learned || 'what you wrote down');
  }

  function buildReport() {
    const gs = activeGoals();
    if (!gs.length) return 'No active goals yet.';
    const ws = weekStats();
    const lines = [];
    lines.push(`Checkpoint report — ${new Date().toLocaleDateString()}`);
    if (state.settings.name) lines.push(`From: ${state.settings.name}`);
    lines.push('');
    lines.push(`This week: ${ws.total} check-ins, ${ws.rate == null ? 'n/a' : ws.rate + '%'} completion, ${ws.lessons} lessons logged`);
    lines.push('');
    for (const g of gs) {
      const recent = lastNPeriods(g, 7).map(p => p.checkin ? ({ done: '✓', partial: '◐', missed: '✕' })[p.checkin.status] : '·').join('');
      lines.push(`• ${g.title} (${g.cadence}) — streak ${streak(g)}  ${recent}`);
      const learned = checkinsFor(g.id).filter(c => c.learned).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
      for (const c of learned) lines.push(`    learned ${fmtDate(c.date)}: ${c.learned}`);
    }
    lines.push('');
    lines.push('Ask me: What got in the way? What would make it easier next week?');
    return lines.join('\n');
  }

  function learn() {
    return `
      <div class="page-head">
        <div><h1>Learn</h1><p class="muted">Why Checkpoint works the way it does.</p></div>
      </div>
      <div class="stack">
        ${Content.LEARN.map(s => `
          <section class="card learn-section" id="learn-${s.id}">
            <h2>${esc(s.title)}</h2>
            ${s.body.map(p => `<p>${esc(p)}</p>`).join('')}
            ${s.quote ? `<blockquote>${esc(s.quote)}</blockquote>` : ''}
            ${s.table ? `<table class="gibb"><thead><tr><th>Defensive</th><th>Supportive</th><th>Example rewrite</th></tr></thead><tbody>
              ${s.table.map(r => `<tr><td>${esc(r[0])}</td><td><strong>${esc(r[1])}</strong></td><td>${esc(r[2])}</td></tr>`).join('')}
            </tbody></table>` : ''}
          </section>`).join('')}
      </div>`;
  }

  function settings() {
    const counts = `${state.goals.length} goals · ${state.checkins.length} check-ins · ${state.partners.length} partners`;
    return `
      <div class="page-head"><div><h1>Settings</h1><p class="muted">Your data lives in this browser only.</p></div></div>
      <div class="stack">
        <div class="card">
          <h2>Profile</h2>
          <form data-form="settings">
            <label>Your name <span class="hint">Used in greetings and reports.</span>
              <input name="name" maxlength="60" value="${esc(state.settings.name)}" placeholder="e.g. Sam">
            </label>
            <div><button class="primary" type="submit">Save</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Backup &amp; move</h2>
          <p class="muted small">${counts}. Export to a JSON file to back up or move to another computer, then import it there.</p>
          <div class="row">
            <button data-action="export">Export JSON</button>
            <button data-action="import">Import JSON…</button>
            <input type="file" id="import-file" accept="application/json,.json" class="hidden">
          </div>
        </div>
        <div class="card">
          <h2>Try it with sample data</h2>
          <p class="muted small">Adds two goals and two weeks of check-ins so you can see how the dashboard looks. You can delete them anytime.</p>
          <button data-action="sample">Load sample data</button>
        </div>
        <div class="card">
          <h2>Danger zone</h2>
          <p class="muted small">Delete everything stored by Checkpoint in this browser. This cannot be undone.</p>
          <button class="danger" data-action="reset">Delete all data</button>
        </div>
        <div class="card soft">
          <h3>About</h3>
          <p class="small mb0">Checkpoint is open source under the MIT license. No accounts, no tracking, no server. If you want to improve it, the code is plain HTML, CSS, and JavaScript.</p>
        </div>
      </div>`;
  }

  // ---------- After render: wire things that need DOM state ----------
  function afterRender() {
    // Keep caret position sensible in the composer: re-focus if it was active.
    if (ui.tab === 'partners' && ui.composerFocus) {
      const ta = app.querySelector('[data-action="composer-text"]');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      ui.composerFocus = false;
    }
  }

  // ---------- Actions ----------
  function upsertCheckin(goalId, status, note, learned) {
    const goal = goalById(goalId);
    if (!goal) return;
    const existing = checkinAt(goal, new Date());
    if (existing) {
      existing.status = status;
      if (note != null) existing.note = note;
      if (learned != null) existing.learned = learned;
    } else {
      state.checkins.push({ id: Storage.uid(), goalId, date: ymd(), status, note: note || '', learned: learned || '', createdAt: Date.now() });
    }
  }

  function loadSample() {
    const g1 = { id: Storage.uid(), title: 'Study 30 minutes', why: 'Pass the class without last-minute panic.', cadence: 'daily', createdAt: Date.now(), endDate: null, archived: false };
    const g2 = { id: Storage.uid(), title: 'Call Grandma', why: 'She likes hearing about school.', cadence: 'weekly', createdAt: Date.now(), endDate: null, archived: false };
    state.goals.push(g1, g2);
    const notes = [
      ['done', 'Did it right after dinner.', 'Dinner → desk works.'],
      ['done', '', ''],
      ['partial', 'Only 15 min, practice ran late.', 'Practice days need a shorter version.'],
      ['missed', 'Forgot completely.', 'I need a reminder on Fridays.'],
      ['done', '', ''],
      ['done', 'Studied with Jordan.', 'Studying with someone makes it easier.'],
      ['done', '', ''],
      ['partial', '', ''],
      ['done', '', 'Morning sessions stick better.'],
      ['done', '', ''],
      ['missed', 'Sick.', ''],
      ['done', '', ''],
      ['done', '', '']
    ];
    notes.forEach((n, i) => {
      const d = addDays(new Date(), -(notes.length - i));
      state.checkins.push({ id: Storage.uid(), goalId: g1.id, date: ymd(d), status: n[0], note: n[1], learned: n[2], createdAt: Date.now() });
    });
    [-14, -7].forEach(off => {
      state.checkins.push({ id: Storage.uid(), goalId: g2.id, date: ymd(addDays(new Date(), off)), status: 'done', note: '', learned: off === -7 ? 'Sunday afternoons are the best time.' : '', createdAt: Date.now() });
    });
    if (!state.partners.length) state.partners.push({ id: Storage.uid(), name: 'Dad', contact: '' });
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) { toast('Could not copy — select the text and copy manually.'); }
  }

  // Click delegation
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); setTab(nav.dataset.nav); return; }

    const btn = e.target.closest('[data-action]');
    if (!btn || !app.contains(btn)) return;
    const a = btn.dataset.action;

    switch (a) {
      case 'nav': setTab(btn.dataset.tab); break;

      case 'quick-checkin':
        upsertCheckin(btn.dataset.goal, btn.dataset.status);
        toast(btn.dataset.status === 'missed' ? 'Logged. What did you learn? Add it under Check-ins.' : 'Logged ✓');
        commit(); break;

      case 'edit-goal': ui.editingGoalId = btn.dataset.goal; render(); window.scrollTo({ top: 0 }); break;
      case 'cancel-edit': ui.editingGoalId = null; render(); break;
      case 'archive-goal': { const g = goalById(btn.dataset.goal); g.archived = !g.archived; commit(); break; }
      case 'delete-goal': {
        const g = goalById(btn.dataset.goal);
        if (confirm(`Delete "${g.title}" and all its check-ins? This cannot be undone.`)) {
          state.goals = state.goals.filter(x => x.id !== g.id);
          state.checkins = state.checkins.filter(c => c.goalId !== g.id);
          if (ui.editingGoalId === g.id) ui.editingGoalId = null;
          commit(); toast('Goal deleted');
        }
        break;
      }

      case 'pick-status': {
        const form = btn.closest('form');
        form.elements.status.value = btn.dataset.status;
        form.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b === btn));
        break;
      }
      case 'delete-checkin':
        state.checkins = state.checkins.filter(c => c.id !== btn.dataset.id); commit(); toast('Check-in removed'); break;

      case 'delete-partner':
        state.partners = state.partners.filter(p => p.id !== btn.dataset.id);
        if (ui.composer.partnerId === btn.dataset.id) ui.composer.partnerId = '';
        commit(); break;

      case 'copy-report': copy(buildReport(), 'Report copied'); break;
      case 'copy-text': copy(ui.composer.text, 'Message copied'); break;
      case 'clear-text': ui.composer.text = ''; render(); break;
      case 'use-template': {
        const t = Feedback.TEMPLATES[Number(btn.dataset.i)];
        const partner = state.partners.find(p => p.id === ui.composer.partnerId);
        const goal = goalById(ui.composer.goalId) || activeGoals()[0];
        const learned = goal ? (checkinsFor(goal.id).filter(x => x.learned).sort((a, b) => b.date.localeCompare(a.date))[0] || {}).learned : '';
        ui.composer.text = fillTemplate(t.text, partner, goal, learned);
        ui.composerFocus = true; render(); break;
      }

      case 'export': download(`checkpoint-${ymd()}.json`, Storage.exportJSON(state)); break;
      case 'import': document.getElementById('import-file').click(); break;
      case 'sample': loadSample(); commit(); toast('Sample data added'); setTab('dashboard'); break;
      case 'reset':
        if (confirm('Delete ALL Checkpoint data in this browser? This cannot be undone.')) {
          Storage.clear(); state = Storage.blank(); ui.editingGoalId = null; ui.checkinGoalId = null;
          commit(); toast('All data deleted');
        }
        break;
    }
  });

  // Change delegation (selects, checkboxes, file input)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!app.contains(el)) return;
    switch (el.dataset.action) {
      case 'toggle-archived': ui.showArchived = el.checked; render(); break;
      case 'select-checkin-goal': ui.checkinGoalId = el.value; render(); break;
      case 'composer-partner': ui.composer.partnerId = el.value; render(); break;
      case 'composer-goal': ui.composer.goalId = el.value; render(); break;
    }
    if (el.id === 'import-file' && el.files && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = Storage.importJSON(reader.result);
          if (confirm(`Import ${incoming.goals.length} goals and ${incoming.checkins.length} check-ins? This replaces your current data.`)) {
            state = incoming; commit(); toast('Imported');
          }
        } catch (err) { alert(err.message); }
      };
      reader.readAsText(el.files[0]);
      el.value = '';
    }
  });

  // Live composer analysis (debounced re-render keeps typing smooth)
  let composerTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.action === 'composer-text') {
      ui.composer.text = el.value;
      clearTimeout(composerTimer);
      composerTimer = setTimeout(() => { ui.composerFocus = document.activeElement === el; render(); }, 350);
    }
  });

  // Form submits
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form || !app.contains(form)) return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());

    switch (form.dataset.form) {
      case 'goal': {
        const data = { title: f.title.trim(), why: (f.why || '').trim(), cadence: f.cadence === 'weekly' ? 'weekly' : 'daily', endDate: f.endDate || null };
        if (!data.title) return;
        if (f.id) { Object.assign(goalById(f.id), data); ui.editingGoalId = null; toast('Goal updated'); }
        else { state.goals.push(Object.assign({ id: Storage.uid(), createdAt: Date.now(), archived: false }, data)); toast('Goal added'); }
        commit(); break;
      }
      case 'checkin': {
        if (!f.status) { toast('Pick Done, Partial, or Missed first.'); return; }
        upsertCheckin(f.goalId, f.status, (f.note || '').trim(), (f.learned || '').trim());
        toast(f.status === 'missed' ? 'Logged. Misses with a lesson are still progress.' : 'Check-in saved ✓');
        commit(); break;
      }
      case 'partner': {
        if (!f.name.trim()) return;
        state.partners.push({ id: Storage.uid(), name: f.name.trim(), contact: (f.contact || '').trim() });
        commit(); toast('Partner added'); break;
      }
      case 'settings': {
        state.settings.name = (f.name || '').trim(); commit(); toast('Saved'); break;
      }
    }
  });

  // ---------- Boot ----------
  setTab(location.hash.slice(1) || 'dashboard');
})();
