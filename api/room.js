import { room, handle, send } from './_lib.js';
// Live rooms: create, join, wait, poll, answer, close.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: 'method' } });
  return handle(res, () => room(req.body || {}));
}
