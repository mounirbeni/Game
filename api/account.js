import { saveCloud, loadCloud, login, setPassword, claimGifts, adminReset, handle, send } from './_lib.js';
// One endpoint for the player's account: cloud save, cloud load, log in, set password.
const actions = { save: saveCloud, load: loadCloud, login, password: setPassword, gifts: claimGifts, admin: adminReset };
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: 'method' } });
  const body = req.body || {}, fn = actions[body.action];
  if (!fn) return send(res, { status: 400, body: { error: 'action' } });
  return handle(res, () => fn(body));
}
