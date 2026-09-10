import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { clockHourKeys, completeDisplayRange } from '../displayRange';

test('clockHourKeys returns one canonical key for every hour', () => {
  const keys = clockHourKeys();
  assert.equal(keys.length, 24);
  assert.equal(keys[0], '00');
  assert.equal(keys[23], '23');
  assert.equal(new Set(keys).size, 24);
});

test('completeDisplayRange fills exact keys without mutating sparse source rows', () => {
  const source = [
    { key: 'b', amount: 2 },
    { key: 'outside', amount: 99 },
  ];
  const before = structuredClone(source);
  const completed = completeDisplayRange(
    ['a', 'b', 'c'],
    source,
    (row) => row.key,
    (key) => ({ key, amount: 0 }),
  );

  assert.deepEqual(completed, [
    { key: 'a', value: { key: 'a', amount: 0 }, observed: false },
    { key: 'b', value: source[0], observed: true },
    { key: 'c', value: { key: 'c', amount: 0 }, observed: false },
  ]);
  assert.equal(completed[1].value, source[0]);
  assert.deepEqual(source, before);
});

test('completeDisplayRange uses the first valid duplicate deterministically', () => {
  const first = { key: 'a', amount: 1 };
  const completed = completeDisplayRange(
    ['a'],
    [first, { key: 'a', amount: 2 }],
    (row) => row.key,
    (key) => ({ key, amount: 0 }),
  );

  assert.equal(completed[0].value, first);
  assert.equal(completed[0].observed, true);
});
