import { challenge, handle, send } from './_lib.js';
// Friend challenges: create, start, finish, claim and list.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: 'method' } });
  return handle(res, () => challenge(req.body || {}));
}
