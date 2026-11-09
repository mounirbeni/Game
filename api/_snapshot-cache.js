// Public snapshots only, scoped to one warm function instance.
export function createSnapshotCache(ttlMs, now = Date.now) {
  let entry;
  return {
    read(load) {
      if (entry && (entry.pending || now() < entry.expires)) return entry.promise;
      const current = { pending: true, expires: 0, promise: null };
      entry = current;
      current.promise = Promise.resolve().then(load).then(value => {
        current.pending = false;
        current.expires = now() + ttlMs;
        return value;
      }, error => {
        if (entry === current) entry = undefined;
        throw error;
      });
      return current.promise;
    },
    invalidate() { entry = undefined; },
  };
}
