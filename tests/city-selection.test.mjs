import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionGate } from '../js/cities/selection.js';

test('a newer selection invalidates an older completion and snapshots the choice', () => {
  const gate = createSelectionGate();
  const selection = { city: 'taipei', car: 'taxi', setup: { mode: 'solo' } };
  const old = gate.begin(selection);
  selection.setup.mode = 'chase';
  assert.equal(old.snapshot.setup.mode, 'solo');
  const current = gate.begin({ city: 'taipei', car: 'sports' });
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.isCurrent(current), true);
  assert.throws(() => { old.snapshot.setup.mode = 'gp'; }, TypeError);
});

test('cancel invalidates pending completion and a subsequent selection works', () => {
  const gate = createSelectionGate();
  const old = gate.begin({ city: 'taipei' });
  gate.cancel();
  assert.equal(gate.isCurrent(old), false);
  const next = gate.begin({ city: 'taipei' });
  assert.equal(gate.isCurrent(next), true);
  assert.equal(gate.isCurrent({ ...next }), false);
});
