// 엔진 상태 머신(스폰/이동/회전/하드드롭/hold/게임오버)을 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';

test('엔진 생성 시 활성 조각과 next 큐가 채워진다', () => {
  const e = createEngine({ seed: 1, nextCount: 5 });
  assert.ok(e.active);
  assert.equal(e.queue.length, 5);
  assert.equal(e.gameOver, false);
});

test('같은 시드는 같은 조각 순서를 만든다', () => {
  const a = createEngine({ seed: 5 });
  const b = createEngine({ seed: 5 });
  assert.equal(a.active.type, b.active.type);
  assert.deepEqual(a.queue, b.queue);
});

test('moveLeft/Right는 벽에서 막힌다', () => {
  const e = createEngine({ seed: 1 });
  let moved = 0;
  for (let i = 0; i < 20; i++) if (e.moveLeft()) moved++;
  assert.ok(moved < 20); // 언젠가 벽에 막힘
});

test('hardDrop은 조각을 고정하고 새 조각을 스폰한다', () => {
  const e = createEngine({ seed: 1 });
  const first = e.active.type;
  e.hardDrop();
  assert.ok(e.active); // 새 조각
  // 큐가 계속 5개 유지
  assert.equal(e.queue.length, 5);
});

test('hold는 조각을 보관하고 한 번만 가능', () => {
  const e = createEngine({ seed: 1 });
  const orig = e.active.type;
  assert.equal(e.holdPiece(), true);
  assert.equal(e.hold, orig);
  assert.equal(e.holdPiece(), false); // 연속 hold 불가
});

test('getGhostY는 활성 조각 y 이상이다', () => {
  const e = createEngine({ seed: 1 });
  assert.ok(e.getGhostY() >= e.active.y);
});

test('여러 번 하드드롭해도 게임오버 전까지 진행된다', () => {
  const e = createEngine({ seed: 3 });
  let count = 0;
  while (!e.gameOver && count < 200) { e.hardDrop(); count++; }
  assert.ok(count > 0);
});

test('moveDown는 하강하지만 소프트드롭 점수를 올리지 않는다', () => {
  const e = createEngine({ seed: 1 });
  const before = e.softDropCells;
  const startY = e.active.y;
  const moved = e.moveDown();
  assert.equal(moved, true);
  assert.equal(e.active.y, startY + 1);
  assert.equal(e.softDropCells, before); // 점수 누적 없음
});
test('softDrop은 소프트드롭 셀을 누적한다', () => {
  const e = createEngine({ seed: 1 });
  const before = e.softDropCells;
  e.softDrop();
  assert.equal(e.softDropCells, before + 1);
});
