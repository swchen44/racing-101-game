// A pending request owns a reference too. Cancelling it never cancels another waiter.
export function createResourcePool(load, dispose) {
  const entries = new Map();
  function collect(key, entry) {
    if (entry.users || !entry.ready || entry.disposed) return;
    entry.disposed = true;
    if (entries.get(key) === entry) entries.delete(key);
    dispose(entry.value);
  }
  return {
    acquire(key, { signal } = {}) {
      if (signal?.aborted) return Promise.reject(new DOMException('Load cancelled', 'AbortError'));
      let entry = entries.get(key);
      if (!entry) {
        entry = { users: 0, ready: false, disposed: false };
        entries.set(key, entry);
        entry.promise = Promise.resolve().then(() => load(key)).then((value) => {
          entry.value = value;
          entry.ready = true;
          collect(key, entry);
          return value;
        }, (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        });
      }
      entry.users++;
      return new Promise((resolve, reject) => {
        let pending = true;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          entry.users--;
          collect(key, entry);
        };
        const abort = () => {
          if (!pending) return;
          pending = false;
          signal?.removeEventListener('abort', abort);
          release();
          reject(new DOMException('Load cancelled', 'AbortError'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        entry.promise.then((value) => {
          if (!pending) return;
          pending = false;
          signal?.removeEventListener('abort', abort);
          resolve({ value, release });
        }, (error) => {
          if (!pending) return;
          pending = false;
          signal?.removeEventListener('abort', abort);
          release();
          reject(error);
        });
      });
    },
  };
}
