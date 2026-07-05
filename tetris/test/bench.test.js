// 벤치마크의 재현성과 통계 집계를 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { playOneGame, runBench } from '../bench/bench.js';

test('같은 시드는 같은 결과(재현성)', () => {
  const a = playOneGame(12345, 300);
  const b = playOneGame(12345, 300);
  assert.deepEqual(a, b);
});

test('다른 시드는 (대체로) 다른 결과', () => {
  const a = playOneGame(1, 300);
  const b = playOneGame(2, 300);
  assert.notDeepEqual(a, b);
});

test('runBench는 게임 수만큼 결과와 요약을 낸다', () => {
  const { results, summary } = runBench({ games: 5, seed: 42, maxPieces: 200 });
  assert.equal(results.length, 5);
  assert.ok(summary.lines.mean >= 0);
  assert.ok('median' in summary.score);
  assert.ok('std' in summary.pieces);
});

test('runBench 재현성: 같은 인자면 같은 요약', () => {
  const r1 = runBench({ games: 5, seed: 42, maxPieces: 200 });
  const r2 = runBench({ games: 5, seed: 42, maxPieces: 200 });
  assert.deepEqual(r1.summary, r2.summary);
});

test('봇은 즉사하지 않고 라인을 낸다(품질 스모크)', () => {
  const { summary } = runBench({ games: 3, seed: 7, maxPieces: 500 });
  assert.ok(summary.lines.mean > 0, '평균 라인 > 0');
});
