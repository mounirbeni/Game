import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSnapshotCache } from '../api/_snapshot-cache.js';

test('100 concurrent readers share one list; expired snapshots refresh', async () => {
  let clock = 0, calls = 0;
  const cache = createSnapshotCache(5000, () => clock);
  const load = async () => { calls++; return ['score-' + calls]; };
  const replies = await Promise.all(Array.from({ length: 100 }, () => cache.read(load)));
  assert.equal(calls, 1);
  assert.ok(replies.every(x => x[0] === 'score-1'));
  clock = 4999;
  await cache.read(load);
  assert.equal(calls, 1);
  clock = 5000;
  assert.deepEqual(await cache.read(load), ['score-2']);
});
test('a late stale request cannot replace a snapshot after a score update', async () => {
  const cache = createSnapshotCache(5000);
  let finish;
  const old = cache.read(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.invalidate();
  assert.deepEqual(await cache.read(async () => ['new']), ['new']);
  finish(['old']);
  await old;
  assert.deepEqual(await cache.read(async () => ['wrong']), ['new']);
});
test('failed storage requests are retried', async () => {
  const cache = createSnapshotCache(5000);
  await assert.rejects(cache.read(async () => { throw new Error('offline'); }));
  assert.deepEqual(await cache.read(async () => ['recovered']), ['recovered']);
});
test('score submission and account deletion immediately refresh the public board', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugmaze-cache-test-'));
  process.env.MOCK_STORE_DIR = dir;
  try {
    const api = await import('../api/_lib.js');
    const first = await api.claim('AAA');
    const second = await api.claim('BBB');
    const submit = (account, best) => api.submit({ ...account.body, best, level: 1, look: 0 });
    await submit(first, 100);
    assert.equal((await api.board('AAA')).body.me.best, 100);
    await submit(second, 200);
    assert.equal((await api.board('AAA')).body.top[0].name, 'BBB');
    await submit(first, 300);
    assert.equal((await api.board('AAA')).body.top[0].name, 'AAA');
    assert.equal((await api.submit({ name: 'AAA', token: 'wrong', best: 400 })).status, 401);
    await api.release(second.body);
    assert.equal((await api.board('AAA')).body.players, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.MOCK_STORE_DIR;
  }
});
