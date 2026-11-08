import { board, handle } from './_lib.js';
export default async function handler(req, res) {
  return handle(res, () => board((req.query || {}).me), 'public, max-age=0, s-maxage=5');
}
