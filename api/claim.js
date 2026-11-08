import { claim, handle, send } from './_lib.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: 'method' } });
  return handle(res, () => claim((req.body || {}).name));
}
