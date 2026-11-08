// Shared helpers for the online leaderboard (Vercel Functions + a private Vercel Blob store).
//
// Storage layout:
//   accounts/<NAME>.json            { name, tokenHash, created }   created once, never overwritten
//   lb/<NAME>/<best>-<level>-<look> empty marker; the pathname itself carries the player's best
//                                   score, highest level and chosen look, so the whole board is
//                                   read with a single list() call.
import { createHash, randomBytes } from 'node:crypto';

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

export async function claim(rawName) {
  const name = cleanName(rawName);
  if (!name) return { status: 400, body: { error: 'invalid', message: NAME_RULE } };
  const s = await blob();
  const token = randomBytes(24).toString('hex');
  const ok = await s.create(`accounts/${name}.json`, JSON.stringify({ name, tokenHash: hash(token), created: Date.now() }));
  if (!ok) return { status: 409, body: { error: 'taken', message: `${name} is already taken. Try another name.` } };
  return { status: 200, body: { name, token } };
}

async function authed(rawName, token) {
  const name = cleanName(rawName);
  if (!name || !token) return null;
  const s = await blob();
  const text = await s.read(`accounts/${name}.json`);
  if (!text) return null;
  const acc = JSON.parse(text);
  return acc.tokenHash === hash(token) ? name : null;
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
  if (!name) return { status: 401, body: { error: 'auth', message: 'Unknown player or wrong key.' } };
  const s = await blob();
  await s.remove([...(await s.list(`lb/${name}/`)), `accounts/${name}.json`]);
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
