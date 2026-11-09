// Shared helpers for the online leaderboard (Vercel Functions + Neon Postgres; the old Vercel Blob store is only read to migrate).
//
// Storage layout:
//   accounts/<NAME>.json            { name, tokenHash, tokens[], passHash, created }
//   saves/<NAME>.json               { t, save }   the player's whole progress (cloud save)
//   lb/<NAME>/<best>-<level>-<look> empty marker; the pathname itself carries the player's best
//                                   score, highest level and chosen look, so the whole board is
//                                   read with a single list() call.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { createSnapshotCache } from './_snapshot-cache.js';

// Cache only public leaderboard paths; account and save reads stay fresh.
const leaderboardPaths = createSnapshotCache(5000);
// Neon Postgres: the same small key/value store (path -> text) the game always used, in one table.
// `create` only succeeds once per path, which keeps names unique and rewards claimable only once.
async function neonStore(url) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  await sql`create table if not exists kv (path text primary key, data text not null, t timestamptz not null default now())`;
  const like = prefix => prefix.replace(/[\\%_]/g, m => '\\' + m) + '%';
  return {
    async create(path, text) { const r = await sql`insert into kv (path, data) values (${path}, ${text}) on conflict (path) do nothing returning path`; return r.length > 0; },
    async write(path, text) { await sql`insert into kv (path, data) values (${path}, ${text}) on conflict (path) do update set data = excluded.data, t = now()`; },
    async read(path) { const r = await sql`select data from kv where path = ${path}`; return r.length ? r[0].data : null; },
    async list(prefix) { const r = await sql`select path from kv where path like ${like(prefix)} order by path`; return r.map(x => x.path); },
    async remove(paths) { if (paths.length) await sql`delete from kv where path = any(${paths})`; },
  };
}
// The old Vercel Blob store, read-only, to copy everything into Neon once.
async function oldBlobStore() {
  const b = await import('@vercel/blob');
  return {
    async list(prefix, cursor) { const r = await b.list({ prefix, cursor, limit: 500 }); return { paths: r.blobs.map(x => x.pathname), cursor: r.hasMore ? r.cursor : null }; },
    async read(path) { const r = await b.get(path, { access: 'private', useCache: false }); if (!r || r.statusCode !== 200) throw new Error('blob get ' + (r && r.statusCode)); return await new Response(r.stream).text(); },
  };
}
// Developer tool: copy one page of the old Blob store into Neon. Call again with the returned
// cursor until it says done. Existing Neon rows are never overwritten.
export async function migrateFromBlob({ secret, cursor }) {
  if (typeof secret !== 'string' || hash(secret) !== ADMIN_SECRET_HASH) return { status: 403, body: { error: 'admin' } };
  if (!process.env.DATABASE_URL) return { status: 400, body: { error: 'no-database' } };
  const src = await oldBlobStore(), dst = await blob();
  const page = await src.list('', cursor || undefined);
  let copied = 0, skipped = 0, failed = [];
  await Promise.all(page.paths.map(async p => {
    try { const t = await src.read(p); if (t == null) { failed.push(p + ' (read)'); return; } (await dst.create(p, t)) ? copied++ : skipped++; }
    catch (e) { failed.push(p + ' (' + String(e && e.message || e).slice(0, 160) + ')'); }
  }));
  return { status: 200, body: { copied, skipped, failed: failed.length, failedPaths: failed.slice(0, 20), cursor: page.cursor, done: !page.cursor } };
}
let store;
async function blob() {
  if (store) return store;
  if (process.env.MOCK_STORE_DIR) store = await import('./_mockstore.js');   // local tests only
  else if (process.env.DATABASE_URL) store = await neonStore(process.env.DATABASE_URL);   // Neon Postgres
  else {
    const b = await import('@vercel/blob');
    const opts = { access: 'private' };
    store = {
      async create(path, text) {
        try { await b.put(path, text, { ...opts, addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' }); return true; }
        catch (e) { if (await store.read(path) != null) return false; throw e; }
      },
      async write(path, text) { await b.put(path, text, { ...opts, addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); },
      async read(path) {
        const r = await b.get(path, { ...opts, useCache: false }).catch(() => null);   // always the latest copy, never a cached one
        if (!r || r.statusCode !== 200) return null;
        return await new Response(r.stream).text();
      },
      async list(prefix) {
        const out = []; let cursor;
        do { const r = await b.list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs.map(x => x.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
        return out;
      },
      async remove(paths) { if (paths.length) await b.del(paths); },
    };
  }
  return store;
}

export const NAME_RULE = 'Names are 3 to 5 letters or numbers, and each name can only be taken once.';
export function cleanName(raw) {
  const n = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(n) || !/[A-Z]/.test(n)) return null;
  if (['ADMIN', 'NULL', 'UNDEF', 'TEST', 'ROOT'].includes(n)) return null;
  return n;
}
const hash = t => createHash('sha256').update(String(t)).digest('hex');
const pad = (n, w) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
const parse = p => { const m = p.match(/^lb\/([A-Z0-9]{3,5})\/(\d+)-(\d+)-(\d+)$/); return m && { name: m[1], best: +m[2], level: +m[3], look: +m[4] }; };

export const PASS_RULE = 'Passwords are 6 to 64 characters.';
const okPass = p => typeof p === 'string' && p.length >= 6 && p.length <= 64;
function passHash(p) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(p, salt, 32).toString('hex')}`; }
function passOk(p, stored) {
  if (!stored || typeof p !== 'string') return false;
  const [salt, h] = stored.split(':'), a = Buffer.from(h, 'hex'), b = scryptSync(p, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}
const tokenHashes = acc => [acc.tokenHash, ...(acc.tokens || [])].filter(Boolean);

export async function claim(rawName, password) {
  const name = cleanName(rawName);
  if (!name) return { status: 400, body: { error: 'invalid', message: NAME_RULE } };
  if (password != null && !okPass(password)) return { status: 400, body: { error: 'password', message: PASS_RULE } };
  const s = await blob();
  const token = randomBytes(24).toString('hex');
  const acc = { name, tokenHash: hash(token), created: Date.now() };
  if (password != null) acc.passHash = passHash(password);
  const ok = await s.create(`accounts/${name}.json`, JSON.stringify(acc));
  if (!ok) return { status: 409, body: { error: 'taken', message: `${name} is already taken. Try another name.` } };
  return { status: 200, body: { name, token, hasPassword: !!acc.passHash } };
}

async function getAccount(name) {
  const text = await (await blob()).read(`accounts/${name}.json`);
  return text ? JSON.parse(text) : null;
}
// Each device key also lives in its own file, created once and never rewritten, so logging in on
// one device can never drop another device's key (overlapping rewrites of the account file did).
async function authedAccount(rawName, token) {
  const name = cleanName(rawName);
  if (!name || !token) return null;
  const acc = await getAccount(name);
  if (!acc) return null;
  const h = hash(token);
  if (tokenHashes(acc).includes(h)) return acc;
  return (await (await blob()).read(`keys/${name}/${h}.json`)) != null ? acc : null;
}
// Developer tool: set a new password for an account whose password was forgotten.
const ADMIN_SECRET_HASH = '0105b612b6b404f02b147869bc57c3b774440eec812ba3f0c47aae5f62a6b7d8';
export async function adminReset({ secret, target, password }) {
  if (typeof secret !== 'string' || hash(secret) !== ADMIN_SECRET_HASH) return { status: 403, body: { error: 'admin' } };
  if (target === '*list') {   // names of every account
    const names = (await (await blob()).list('accounts/')).map(p => (p.match(/^accounts\/([A-Z0-9]{3,5})\.json$/) || [])[1]).filter(Boolean);
    return { status: 200, body: { accounts: names } };
  }
  const name = cleanName(target), acc = name && await getAccount(name);
  if (!acc) return { status: 404, body: { error: 'missing' } };
  if (!okPass(password)) return { status: 400, body: { error: 'password', message: PASS_RULE } };
  acc.passHash = passHash(password);
  await (await blob()).write(`accounts/${name}.json`, JSON.stringify(acc));
  return { status: 200, body: { reset: name } };
}
async function authed(rawName, token) { const acc = await authedAccount(rawName, token); return acc ? acc.name : null; }
const AUTH_FAIL = { status: 401, body: { error: 'auth', message: 'Unknown player or wrong key.' } };

// ---------- Cloud save ----------
const MAX_SAVE = 200000;
// The game's developer accounts: unlimited credits, items, hearts, lives, looks and levels.
const DEV_NAMES = ['MBN'];
function cleanSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
  const out = {};
  for (const [k, v] of Object.entries(save))
    if ((k.startsWith('backman.') || k.startsWith('bma.')) && k !== 'bma.account' && typeof v === 'string' && v.length < 20000) out[k] = v;
  return JSON.stringify(out).length <= MAX_SAVE ? out : null;
}
export async function saveCloud({ name, token, save }) {
  const acc = await authedAccount(name, token);
  if (!acc) return AUTH_FAIL;
  const clean = cleanSave(save);
  if (!clean) return { status: 400, body: { error: 'invalid', message: 'That save does not look right.' } };
  const t = Date.now();
  await (await blob()).write(`saves/${acc.name}.json`, JSON.stringify({ t, save: clean }));
  return { status: 200, body: { saved: t } };
}
export async function loadCloud({ name, token }) {
  const acc = await authedAccount(name, token);
  if (!acc) return AUTH_FAIL;
  const text = await (await blob()).read(`saves/${acc.name}.json`);
  const rec = text ? JSON.parse(text) : null;
  return { status: 200, body: { name: acc.name, hasPassword: !!acc.passHash, dev: DEV_NAMES.includes(acc.name), t: rec ? rec.t : 0, save: rec ? rec.save : null } };
}
// Log in on a new device with name + password: hands out a new key for that device.
export async function login({ name: rawName, password }) {
  const name = cleanName(rawName), acc = name && await getAccount(name);
  if (!acc || !passOk(password, acc.passHash)) return { status: 401, body: { error: 'login', message: 'Wrong name or password.' } };
  const token = randomBytes(24).toString('hex');
  await (await blob()).write(`keys/${name}/${hash(token)}.json`, JSON.stringify({ t: Date.now() }));
  const text = await (await blob()).read(`saves/${name}.json`);
  const rec = text ? JSON.parse(text) : null;
  return { status: 200, body: { name, token, hasPassword: true, dev: DEV_NAMES.includes(name), t: rec ? rec.t : 0, save: rec ? rec.save : null } };
}
// ---------- Gifts ----------
// Credits handed out to players. Each gift goes to every account that existed when it was made
// (accounts created later don't get it). A player collects each gift once:
//   giftclaim/<gift id>/<NAME>.json   created when collected, so it can never be collected twice
export const GIFTS = [
  { id: 'welcome500', credits: 500, made: 1794189600000, until: 1794189600000 + 30 * 86400000, note: 'A gift from Bug Maze Adventure!' },
];
export async function claimGifts({ name, token }) {
  const acc = await authedAccount(name, token);
  if (!acc) return AUTH_FAIL;
  const s = await blob(), now = Date.now();
  const got = [];
  for (const g of GIFTS) {
    if (now > g.until || !(acc.created < g.made)) continue;
    if (await s.create(`giftclaim/${g.id}/${acc.name}.json`, JSON.stringify({ t: now }))) got.push({ id: g.id, credits: g.credits, note: g.note });
  }
  return { status: 200, body: { gifts: got, credits: got.reduce((a, g) => a + g.credits, 0) } };
}

// Set or change the password (needs this device's key).
export async function setPassword({ name, token, password }) {
  const acc = await authedAccount(name, token);
  if (!acc) return AUTH_FAIL;
  if (!okPass(password)) return { status: 400, body: { error: 'password', message: PASS_RULE } };
  acc.passHash = passHash(password);
  await (await blob()).write(`accounts/${acc.name}.json`, JSON.stringify(acc));
  return { status: 200, body: { hasPassword: true } };
}

export async function submit({ name: rawName, token, best, level, look }) {
  const name = await authed(rawName, token);
  if (!name) return { status: 401, body: { error: 'auth', message: 'Unknown player or wrong key.' } };
  best = Math.floor(+best || 0); level = Math.floor(+level || 1); look = Math.floor(+look || 0);
  if (best < 0 || level < 1 || level > 9999 || look < 0 || look > 99 || best > 60000 * level + 20000)
    return { status: 400, body: { error: 'invalid', message: 'That score does not look right.' } };
  const s = await blob();
  const mine = (await s.list(`lb/${name}/`)).map(p => ({ p, ...parse(p) })).filter(x => x.name);
  const cur = mine.reduce((a, x) => ({ best: Math.max(a.best, x.best), level: Math.max(a.level, x.level), look: x.look }), { best: 0, level: 0, look });
  const next = { best: Math.max(cur.best, best), level: Math.max(cur.level, level), look };
  const path = `lb/${name}/${pad(next.best, 9)}-${pad(next.level, 4)}-${pad(next.look, 2)}`;
  if (!mine.some(x => x.p === path)) {
    leaderboardPaths.invalidate();
    await s.write(path, '{}');
    await s.remove(mine.map(x => x.p).filter(p => p !== path));
    leaderboardPaths.invalidate();
  }
  return { status: 200, body: { name, ...next } };
}

export async function board(me, names) {
  const s = await blob();
  const rows = (await leaderboardPaths.read(() => s.list('lb/'))).map(parse).filter(Boolean)
    .sort((a, b) => b.best - a.best || b.level - a.level || a.name.localeCompare(b.name));
  // one entry per player (in case a stale marker survived)
  const seen = new Set(), uniq = rows.filter(r => !seen.has(r.name) && seen.add(r.name));
  const meName = cleanName(me);
  const myIndex = meName ? uniq.findIndex(r => r.name === meName) : -1;
  // friends: look up specific players (up to 50) wherever they are on the board
  const wanted = [...new Set(String(names || '').split(',').map(cleanName).filter(Boolean))].slice(0, 50);
  const friends = await Promise.all(wanted.map(async n => {
    const i = uniq.findIndex(r => r.name === n);
    if (i >= 0) return { rank: i + 1, ...uniq[i] };
    return (await s.read(`accounts/${n}.json`)) ? { name: n, noScore: true } : { name: n, missing: true };
  }));
  return { status: 200, body: { players: uniq.length, top: uniq.slice(0, 100).map((r, i) => ({ rank: i + 1, ...r })), me: myIndex >= 0 ? { rank: myIndex + 1, ...uniq[myIndex] } : null, friends } };
}

export async function release({ name: rawName, token }) {
  const name = await authed(rawName, token);
  if (!name) return AUTH_FAIL;
  const s = await blob();
  leaderboardPaths.invalidate();
  await s.remove([...(await s.list(`lb/${name}/`)), `accounts/${name}.json`, `saves/${name}.json`]);
  leaderboardPaths.invalidate();
  return { status: 200, body: { released: name } };
}

// ---------- Friend challenges ----------
//   challenges/<id>.json        { id, from, to, level, seed, created, expires }   never changes
//   ch/<NAME>/<id>              empty marker: lets each player list their challenges
//   chplay/<id>/<NAME>.json     { score, cleared, done, t }   created when a player starts: one attempt only
//   chclaim/<id>/<NAME>.json    { reward }   created once when the reward is collected
const DAY = 86400000, CH_LIFE = 3 * DAY, CH_KEEP = 7 * DAY, MAX_OPEN = 5;
export const REWARD = { win: 10, draw: 5, lose: 1 };
const newId = () => Date.now().toString(36) + randomBytes(4).toString('hex');
const okId = id => typeof id === 'string' && /^[a-z0-9]{8,24}$/.test(id);
async function topLevel(s, name) {
  return (await s.list(`lb/${name}/`)).map(parse).filter(Boolean).reduce((m, x) => Math.max(m, x.level), 1);
}
async function readJSON(s, path) { const t = await s.read(path); return t ? JSON.parse(t) : null; }
// Who won, once both have finished (or the challenge ran out of time).
function outcome(ch, plays, now) {
  const a = plays[ch.from], b = plays[ch.to], over = now > ch.expires;
  const fin = p => p && p.done;
  if (!(fin(a) && fin(b)) && !over) return null;
  const sa = a ? a.score : -1, sb = b ? b.score : -1;   // never played = lost
  if (sa === sb) return { winner: null };
  return { winner: sa > sb ? ch.from : ch.to };
}
async function view(s, ch, me, now) {
  const [pf, pt, claim] = await Promise.all([
    readJSON(s, `chplay/${ch.id}/${ch.from}.json`), readJSON(s, `chplay/${ch.id}/${ch.to}.json`), readJSON(s, `chclaim/${ch.id}/${me}.json`)]);
  const plays = { [ch.from]: pf, [ch.to]: pt };
  const res = outcome(ch, plays, now), mine = plays[me], other = me === ch.from ? ch.to : ch.from, theirs = plays[other];
  // The challenger's score is the number to beat, so it is always shown. The other player's
  // score stays hidden from the challenger until the challenger has played too.
  const showTheirs = (mine && mine.done) || other === ch.from || res;
  return {
    id: ch.id, from: ch.from, to: ch.to, other, level: ch.level, seed: ch.seed, created: ch.created, expires: ch.expires,
    me: mine ? { score: mine.score, cleared: !!mine.cleared, done: !!mine.done } : null,
    them: theirs ? (showTheirs ? { score: theirs.score, cleared: !!theirs.cleared, done: !!theirs.done } : { done: !!theirs.done, hidden: true }) : null,
    result: res ? (res.winner === null ? 'draw' : res.winner === me ? 'win' : 'lose') : null,
    claimed: claim ? claim.reward : null,
  };
}
export async function challenge(body) {
  const acc = await authedAccount(body.name, body.token);
  if (!acc) return AUTH_FAIL;
  const me = acc.name, s = await blob(), now = Date.now();
  const load = async id => okId(id) ? readJSON(s, `challenges/${id}.json`) : null;
  const part = ch => ch && (ch.from === me || ch.to === me);

  if (body.action === 'create') {
    const to = cleanName(body.to);
    if (!to || to === me) return { status: 400, body: { error: 'invalid', message: 'Pick one of your friends to challenge.' } };
    if (!(await s.read(`accounts/${to}.json`))) return { status: 404, body: { error: 'missing', message: `There is no player called ${to}.` } };
    const ids = (await s.list(`ch/${me}/`)).map(p => p.split('/')[2]);
    const mineOpen = (await Promise.all(ids.map(load))).filter(c => c && c.from === me && c.expires > now);
    if (mineOpen.filter(c => c.to === to).length) return { status: 409, body: { error: 'open', message: `You already have a challenge going with ${to}.` } };
    if (mineOpen.length >= MAX_OPEN) return { status: 429, body: { error: 'limit', message: `You can have ${MAX_OPEN} challenges going at once.` } };
    const level = Math.max(2, Math.min(15, await topLevel(s, me), await topLevel(s, to)));
    const ch = { id: newId(), from: me, to, level, seed: 100000 + Math.floor(Math.random() * 900000000), created: now, expires: now + CH_LIFE };
    await s.write(`challenges/${ch.id}.json`, JSON.stringify(ch));
    await Promise.all([s.write(`ch/${me}/${ch.id}`, '{}'), s.write(`ch/${to}/${ch.id}`, '{}')]);
    return { status: 200, body: { challenge: await view(s, ch, me, now) } };
  }
  if (body.action === 'start') {
    const ch = await load(body.id);
    if (!part(ch)) return { status: 404, body: { error: 'missing', message: 'That challenge is gone.' } };
    if (now > ch.expires) return { status: 410, body: { error: 'expired', message: 'This challenge has run out of time.' } };
    const ok = await s.create(`chplay/${ch.id}/${me}.json`, JSON.stringify({ score: 0, cleared: false, done: false, t: now }));
    if (!ok) return { status: 409, body: { error: 'played', message: 'You already played this challenge.' } };
    return { status: 200, body: { challenge: await view(s, ch, me, now) } };
  }
  if (body.action === 'finish') {
    const ch = await load(body.id);
    if (!part(ch)) return { status: 404, body: { error: 'missing', message: 'That challenge is gone.' } };
    const path = `chplay/${ch.id}/${me}.json`, cur = await readJSON(s, path);
    if (!cur || cur.done) return { status: 409, body: { error: 'played', message: 'This attempt is already over.' } };
    const score = Math.floor(+body.score || 0);
    if (score < 0 || score > 60000 * ch.level + 20000) return { status: 400, body: { error: 'invalid', message: 'That score does not look right.' } };
    await s.write(path, JSON.stringify({ score, cleared: !!body.cleared, done: true, t: now }));
    return { status: 200, body: { challenge: await view(s, ch, me, now) } };
  }
  if (body.action === 'claim') {
    const ch = await load(body.id);
    if (!part(ch)) return { status: 404, body: { error: 'missing', message: 'That challenge is gone.' } };
    const v = await view(s, ch, me, now);
    if (!v.result) return { status: 409, body: { error: 'pending', message: 'The challenge is not over yet.' } };
    if (v.claimed != null) return { status: 409, body: { error: 'claimed', message: 'Reward already collected.' } };
    const reward = REWARD[v.result];
    if (!(await s.create(`chclaim/${ch.id}/${me}.json`, JSON.stringify({ reward, t: now })))) return { status: 409, body: { error: 'claimed', message: 'Reward already collected.' } };
    return { status: 200, body: { reward, challenge: { ...v, claimed: reward } } };
  }
  if (body.action === 'list') {
    const markers = await s.list(`ch/${me}/`);
    const all = (await Promise.all(markers.map(async p => ({ p, ch: await load(p.split('/')[2]) }))));
    const stale = all.filter(x => !x.ch || now > x.ch.created + CH_KEEP).map(x => x.p);
    if (stale.length) await s.remove(stale);   // tidy up old challenges from my list
    const live = all.filter(x => x.ch && now <= x.ch.created + CH_KEEP).map(x => x.ch).sort((a, b) => b.created - a.created).slice(0, 20);
    return { status: 200, body: { challenges: await Promise.all(live.map(ch => view(s, ch, me, now))), reward: REWARD } };
  }
  return { status: 400, body: { error: 'action' } };
}

// ---------- Live rooms (real-time play) ----------
// The server only introduces the phones to each other (WebRTC offer/answer); the game itself
// then runs directly between the phones, with the host's phone running the match.
//   rooms/<CODE>.json            { code, host, mode, created }
//   rooms/<CODE>/p-<NAME>.json   a player asking to join: { name, look, offer, t }
//   rooms/<CODE>/a-<NAME>.json   the host's answer for that player: { sdp, t }
const ROOM_LIFE = 30 * 60000, CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const okCode = c => typeof c === 'string' && /^[A-Z]{4}$/.test(c);
const okSdp = v => typeof v === 'string' && v.length > 20 && v.length < 20000;
export async function room(body) {
  const acc = await authedAccount(body.name, body.token);
  if (!acc) return AUTH_FAIL;
  const me = acc.name, s = await blob(), now = Date.now();
  const code = String(body.code || '').toUpperCase();
  const load = async () => okCode(code) ? readJSON(s, `rooms/${code}.json`) : null;
  const gone = { status: 404, body: { error: 'missing', message: 'No room with that code. Check the code with your friend.' } };

  if (body.action === 'list') {   // open rooms waiting for players (host seen in the last minute)
    const paths = (await s.list('rooms/')).filter(p => /^rooms\/[A-Z]{4}\.json$/.test(p));
    const rooms = (await Promise.all(paths.map(p => readJSON(s, p)))).filter(r => r && r.host !== me && now - r.created < ROOM_LIFE && now - (r.seen || r.created) < 60000);
    const out = await Promise.all(rooms.slice(0, 30).map(async r => ({ code: r.code, host: r.host, mode: r.mode, players: 1 + (await s.list(`rooms/${r.code}/p-`)).length })));
    return { status: 200, body: { rooms: out.filter(r => r.players < 4).sort((a, b) => a.players - b.players).slice(0, 20) } };
  }

  if (body.action === 'create') {
    const mode = body.mode === 'coop' ? 'coop' : 'race';
    for (let i = 0; i < 8; i++) {
      const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      const r = { code: c, host: me, mode, created: now };
      const old = await readJSON(s, `rooms/${c}.json`);
      if (old && now - old.created < ROOM_LIFE) continue;
      await s.write(`rooms/${c}.json`, JSON.stringify(r));
      return { status: 200, body: { room: r } };
    }
    return { status: 503, body: { error: 'busy', message: 'Could not make a room. Try again.' } };
  }
  const r = await load();
  if (!r || now - r.created > ROOM_LIFE) return gone;
  if (body.action === 'join') {
    if (r.host === me) return { status: 400, body: { error: 'self', message: 'That is your own room.' } };
    if (!okSdp(body.offer)) return { status: 400, body: { error: 'invalid', message: 'Connection data missing.' } };
    await s.remove([`rooms/${code}/a-${me}.json`]);
    await s.write(`rooms/${code}/p-${me}.json`, JSON.stringify({ name: me, look: Math.max(0, Math.min(99, Math.floor(+body.look || 0))), offer: body.offer, t: now }));
    return { status: 200, body: { room: r } };
  }
  if (body.action === 'wait') {   // a joining player waits for the host's answer
    const a = await readJSON(s, `rooms/${code}/a-${me}.json`);
    return { status: 200, body: { room: r, answer: a ? a.sdp : null } };
  }
  if (r.host !== me) return { status: 403, body: { error: 'host', message: 'Only the host can do that.' } };
  if (body.action === 'poll') {   // the host looks for players asking to join
    if (now - (r.seen || r.created) > 20000) { r.seen = now; await s.write(`rooms/${code}.json`, JSON.stringify(r)); }   // still here: keep the room listed
    const paths = (await s.list(`rooms/${code}/p-`));
    const players = (await Promise.all(paths.map(p => readJSON(s, p)))).filter(Boolean);
    return { status: 200, body: { room: r, players } };
  }
  if (body.action === 'answer') {
    const to = cleanName(body.to);
    if (!to || !okSdp(body.sdp)) return { status: 400, body: { error: 'invalid', message: 'Connection data missing.' } };
    await s.write(`rooms/${code}/a-${to}.json`, JSON.stringify({ sdp: body.sdp, t: now }));
    return { status: 200, body: { ok: true } };
  }
  if (body.action === 'close') {
    await s.remove([...(await s.list(`rooms/${code}/`)), `rooms/${code}.json`]);
    return { status: 200, body: { closed: code } };
  }
  return { status: 400, body: { error: 'action' } };
}

export function send(res, { status, body }, cache) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(status).send(JSON.stringify(body));
}
export async function handle(res, fn, cache) {
  try { send(res, await fn(), cache); }
  catch (e) { console.error(e); send(res, { status: 500, body: { error: 'server', message: 'The leaderboard is having trouble. Try again soon.' } }); }
}
