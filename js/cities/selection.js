// Selection identity makes late asynchronous loads harmless.
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createSelectionGate() {
  let current = null;
  let serial = 0;
  return {
    begin(snapshot) {
      current = Object.freeze({ id: ++serial, snapshot: freeze(structuredClone(snapshot)) });
      return current;
    },
    isCurrent(token) { return current !== null && token === current; },
    cancel() { current = null; },
  };
}
