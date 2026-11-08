// Shared helpers for the online leaderboard (Vercel Functions + a private Vercel Blob store).
//
// Storage layout:
//   accounts/<NAME>.json            { name, tokenHash, tokens[], passHash, created }
//   saves/<NAME>.json               { t, save }   the player's whole progress (cloud save)
//   lb/<NAME>/<best>-<level>-<look> empty marker; the pathname itself carries the player's best
//                                   score, highest level and chosen look, so the whole board is
//                                   read with a single list() call.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

let store;
async function blob() {
  if (store) return store;
  if (process.env.MOCK_STORE_DIR) store = await import('./_mockstore.js');   // local tests only
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
        const r = await b.get(path, opts).catch(() => null);
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
async function authedAccount(rawName, token) {
  const name = cleanName(rawName);
  if (!name || !token) return null;
  const acc = await getAccount(name);
  return acc && tokenHashes(acc).includes(hash(token)) ? acc : null;
}
async function authed(rawName, token) { const acc = await authedAccount(rawName, token); return acc ? acc.name : null; }
const AUTH_FAIL = { status: 401, body: { error: 'auth', message: 'Unknown player or wrong key.' } };

// ---------- Cloud save ----------
const MAX_SAVE = 200000;
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
  return { status: 200, body: { name: acc.name, hasPassword: !!acc.passHash, t: rec ? rec.t : 0, save: rec ? rec.save : null } };
}
// Log in on a new device with name + password: hands out a new key for that device.
export async function login({ name: rawName, password }) {
  const name = cleanName(rawName), acc = name && await getAccount(name);
  if (!acc || !passOk(password, acc.passHash)) return { status: 401, body: { error: 'login', message: 'Wrong name or password.' } };
  const token = randomBytes(24).toString('hex');
  acc.tokens = [...(acc.tokens || []), hash(token)].slice(-20);
  await (await blob()).write(`accounts/${name}.json`, JSON.stringify(acc));
  return loadCloud({ name, token }).then(r => ({ status: 200, body: { ...r.body, token } }));
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
    await s.write(path, '{}');
    await s.remove(mine.map(x => x.p).filter(p => p !== path));
  }
  return { status: 200, body: { name, ...next } };
}

export async function board(me, names) {
  const s = await blob();
  const rows = (await s.list('lb/')).map(parse).filter(Boolean)
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
  await s.remove([...(await s.list(`lb/${name}/`)), `accounts/${name}.json`, `saves/${name}.json`]);
  return { status: 200, body: { released: name } };
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
