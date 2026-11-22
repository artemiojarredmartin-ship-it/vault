/* Vault — Supabase client for real leagues.
 * The publishable key is meant to be public: every table is protected by Row Level Security
 * (see supabase/leagues.sql), so a player can only see and write their own leagues' data.
 */
(function (global) {
  'use strict';
  const URL = 'https://yqkzpiobjjvgxakggjee.supabase.co';
  const KEY = 'sb_publishable_-91cGVBxP-_gVCJm_iZInQ_K-bbCFDt';
  const COLORS = ['#c2413b', '#2f5fc9', '#17855a', '#8a4fd1', '#c47a14', '#0e8a8a', '#b8457a', '#5b6b2f'];

  let sb = null, user = null, profile = null, channel = null;

  function available() { return !!(global.supabase && global.supabase.createClient); }
  function client() {
    if (!sb) {
      if (!available()) throw new Error('Can\'t reach the league server. Check your connection.');
      sb = global.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vault.auth' } });
    }
    return sb;
  }
  function check(res) {
    if (res.error) {
      const m = res.error.message || String(res.error);
      if (/anonymous sign-ins are disabled/i.test(m)) throw new Error('Guest sign-in is turned off on the server. (Supabase → Authentication → Sign In / Providers → Allow anonymous sign-ins.)');
      throw new Error(m.replace(/^.*?exception:?\s*/i, ''));
    }
    return res.data;
  }

  // Restore the saved session (no network sign-up). Returns the profile or null.
  async function restore() {
    const { data } = await client().auth.getSession();
    user = data.session ? data.session.user : null;
    if (!user) return null;
    const p = await client().from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = p.data || null;
    return profile;
  }

  // First time: guest account + display name. No email needed.
  async function signUp(name) {
    name = String(name || '').trim().slice(0, 30);
    if (!name) throw new Error('Pick a name your friends will recognize.');
    if (!user) user = check(await client().auth.signInAnonymously()).user;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    profile = check(await client().from('profiles').upsert({ id: user.id, name, color }).select().single());
    return profile;
  }
  async function rename(name) {
    profile = check(await client().from('profiles').update({ name: String(name).trim().slice(0, 30) }).eq('id', user.id).select().single());
    return profile;
  }

  // habits: [{ title, chips }] — chips must add up to 10 (checked again on the server)
  const habitsJson = (list) => list.filter(h => h && String(h.title || '').trim()).slice(0, 3)
    .map((h, i) => ({ id: 'h' + i + '_' + Math.random().toString(36).slice(2, 7), title: String(h.title).trim().slice(0, 60), chips: Math.max(1, Math.round(Number(h.chips) || 0)) }));
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch (e) { return 'America/New_York'; } };

  async function createLeague({ name, tier, weeks, habits }) {
    return check(await client().rpc('create_league', { p_name: name, p_tier: tier, p_weeks: weeks, p_habits: habitsJson(habits), p_tz: tz() }));
  }
  async function preview(code) {
    const rows = check(await client().rpc('preview_league', { p_code: code }));
    return rows && rows[0] || null;
  }
  async function joinLeague(code, habits) { return check(await client().rpc('join_league', { p_code: code, p_habits: habitsJson(habits) })); }
  async function startLeague(id) { return check(await client().rpc('start_league', { p_league: id })); }
  async function myLeagues() {
    if (!user) return [];
    const rows = check(await client().from('members').select('league_id, leagues(id, name, code, tier, weeks, starts_on, result)').eq('user_id', user.id));
    return rows.map(r => r.leagues).filter(Boolean).sort((a, b) => String(b.starts_on || '9').localeCompare(String(a.starts_on || '9')));
  }
  async function leaveLeague(id) { check(await client().from('members').delete().eq('league_id', id).eq('user_id', user.id)); }

  // Everything needed to render one league.
  async function load(id) {
    const c = client();
    const [league, members, entries, punishments, cvotes] = await Promise.all([
      c.from('leagues').select('*').eq('id', id).single(),
      c.from('members').select('user_id, habits, joined_at').eq('league_id', id),
      c.from('entries').select('*').eq('league_id', id).order('created_at', { ascending: true }).limit(2000),
      c.from('punishments').select('*').eq('league_id', id),
      c.from('consequence_votes').select('user_id, choice, created_at').eq('league_id', id).order('created_at', { ascending: true })
    ]);
    const g = check(league), ms = check(members), es = check(entries), ps = check(punishments);
    const ids = es.map(e => e.id), uids = ms.map(m => m.user_id), pids = ps.map(p => p.id);
    const [profiles, votes, reactions, pvotes] = await Promise.all([
      c.from('profiles').select('id, name, color').in('id', uids.length ? uids : ['00000000-0000-0000-0000-000000000000']),
      ids.length ? c.from('sus_votes').select('*').in('entry_id', ids) : { data: [] },
      ids.length ? c.from('reactions').select('*').in('entry_id', ids) : { data: [] },
      pids.length ? c.from('punishment_votes').select('*').in('punishment_id', pids) : { data: [] }
    ]);
    const prof = {}; for (const p of check(profiles)) prof[p.id] = p;
    return {
      league: g, members: ms.map(m => Object.assign({}, m, { profile: prof[m.user_id] })),
      entries: es, votes: check(votes), reactions: check(reactions), punishments: ps, punishmentVotes: check(pvotes), consequenceVotes: check(cvotes)
    };
  }

  // Today's day number in the league's time zone (0 = first day).
  function today(league) {
    if (!league.starts_on) return -1;
    let ymd;
    try { ymd = new Intl.DateTimeFormat('en-CA', { timeZone: league.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { ymd = new Date().toISOString().slice(0, 10); }
    return Math.round((Date.parse(ymd) - Date.parse(league.starts_on)) / 864e5);
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(','); const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.slice(5, head.indexOf(';')) || 'image/jpeg' });
  }

  async function postProof(league, habitId, day, challenge, photoDataUrl) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    let path = null;
    if (photoDataUrl) {
      path = `${league}/${user.id}/${id}.jpg`;
      check(await client().storage.from('proofs').upload(path, dataUrlToBlob(photoDataUrl), { contentType: 'image/jpeg', upsert: false }));
    }
    const res = await client().from('entries').insert({ id, league_id: league, kind: 'proof', habit_id: habitId, day, challenge: challenge || null, photo_path: path });
    if (res.error) {
      if (path) client().storage.from('proofs').remove([path]);
      if (/duplicate|unique/i.test(res.error.message)) throw new Error('Already proved today.');
      if (/row-level security/i.test(res.error.message)) throw new Error('That day is closed. Proof only counts on the day itself.');
      check(res);
    }
    return id;
  }
  async function postChat(league, body) { check(await client().from('entries').insert({ league_id: league, kind: 'chat', body: String(body).trim().slice(0, 280) })); }
  async function vote(entryId, fake) { check(await client().from('sus_votes').insert({ entry_id: entryId, fake })); }
  async function react(entryId, emoji, on) {
    if (on) check(await client().from('reactions').insert({ entry_id: entryId, emoji }));
    else check(await client().from('reactions').delete().eq('entry_id', entryId).eq('user_id', user.id).eq('emoji', emoji));
  }
  async function suggest(league, text, tier) {
    const p = check(await client().from('punishments').insert({ league_id: league, text, tier }).select().single());
    check(await client().from('punishment_votes').insert({ punishment_id: p.id, yes: true }));
    return p;
  }
  async function voteConsequence(league, choice) {
    check(await client().from('consequence_votes').upsert({ league_id: league, user_id: user.id, choice: String(choice).trim().slice(0, 120) }));
  }
  async function votePunishment(id, yes) { check(await client().from('punishment_votes').insert({ punishment_id: id, yes })); }
  async function setResult(league, result) { return check(await client().rpc('set_result', { p_league: league, p_result: result })); }
  async function veto(league, punishment, tier) { return check(await client().rpc('use_veto', { p_league: league, p_punishment: punishment, p_tier: tier })); }
  async function served(league) { return check(await client().rpc('mark_served', { p_league: league })); }

  async function photoUrls(paths) {
    if (!paths.length) return {};
    const res = await client().storage.from('proofs').createSignedUrls(paths, 3600);
    const out = {}; for (const r of res.data || []) if (r.signedUrl) out[r.path] = r.signedUrl;
    return out;
  }

  // Live updates: call onChange whenever anything in this league changes.
  function subscribe(league, onChange) {
    unsubscribe();
    let t = null; const bump = () => { clearTimeout(t); t = setTimeout(onChange, 250); };
    channel = client().channel('league-' + league)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: 'league_id=eq.' + league }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: 'league_id=eq.' + league }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leagues', filter: 'id=eq.' + league }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sus_votes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consequence_votes', filter: 'league_id=eq.' + league }, bump)
      .subscribe();
  }
  function unsubscribe() { if (channel) { client().removeChannel(channel); channel = null; } }

  global.Cloud = {
    available, restore, signUp, rename, me: () => user, profile: () => profile,
    createLeague, preview, joinLeague, startLeague, myLeagues, leaveLeague, load, today,
    postProof, postChat, vote, react, suggest, votePunishment, voteConsequence, setResult, veto, served, photoUrls, subscribe, unsubscribe
  };
})(window);
