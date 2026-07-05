// RNG 시드 재현성과 7-bag 규칙을 검증하는 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, deriveSeed, createBag } from '../src/core/rng.js';

test('같은 시드는 같은 난수 수열을 낸다', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every(n => n >= 0 && n < 1));
});

test('다른 시드는 다른 수열을 낸다', () => {
  const a = mulberry32(1), b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('deriveSeed는 인덱스별로 다른 시드를 낸다', () => {
  assert.notEqual(deriveSeed(42, 0), deriveSeed(42, 1));
  assert.equal(deriveSeed(42, 3), deriveSeed(42, 3));
});

test('7-bag은 매 7개마다 7종을 정확히 한 번씩 포함한다', () => {
  const bag = createBag(mulberry32(7));
  const types = ['I','O','T','S','Z','J','L'];
  for (let round = 0; round < 3; round++) {
    const drawn = Array.from({ length: 7 }, () => bag());
    assert.deepEqual([...drawn].sort(), [...types].sort());
  }
});

test('같은 시드의 bag은 같은 조각 순서를 낸다', () => {
  const b1 = createBag(mulberry32(99));
  const b2 = createBag(mulberry32(99));
  const s1 = Array.from({ length: 14 }, () => b1());
  const s2 = Array.from({ length: 14 }, () => b2());
  assert.deepEqual(s1, s2);
});
