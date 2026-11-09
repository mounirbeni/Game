import { pushApi, dailyReminder, handle, send } from './_lib.js';
// Push notifications: the public key, subscribe/unsubscribe a phone, and the daily reminder (Vercel cron).
export default async function handler(req, res) {
  if (req.method === 'GET' && (req.query || {}).cron === 'daily') return handle(res, () => dailyReminder());
  if (req.method !== 'POST') return send(res, { status: 405, body: { error: 'method' } });
  return handle(res, () => pushApi(req.body || {}));
}
