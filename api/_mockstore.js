// File-backed stand-in for the Neon store, used only by local tests (MOCK_STORE_DIR).
import fs from 'node:fs'; import path from 'node:path';
const dir = () => process.env.MOCK_STORE_DIR;
const f = p => path.join(dir(), encodeURIComponent(p));
export async function create(p, text) { try { fs.writeFileSync(f(p), text, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } }
export async function write(p, text) { fs.writeFileSync(f(p), text); }
export async function read(p) { try { return fs.readFileSync(f(p), 'utf8'); } catch { return null; } }
export async function list(prefix) { return fs.readdirSync(dir()).map(decodeURIComponent).filter(p => p.startsWith(prefix)).sort(); }
export async function remove(paths) { for (const p of paths) try { fs.unlinkSync(f(p)); } catch { /* gone */ } }
