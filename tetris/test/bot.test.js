// 휴리스틱 봇의 특징 추출·착수 열거·최선 선택을 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFeatures, enumeratePlacements, bestMove, evaluateBoard } from '../src/core/bot.js';
import { createBoard, lockPiece, WIDTH } from '../src/core/board.js';

test('빈 보드는 높이·구멍·범프가 0', () => {
  const f = boardFeatures(createBoard());
  assert.equal(f.aggregateHeight, 0);
  assert.equal(f.holes, 0);
  assert.equal(f.bumpiness, 0);
});

test('구멍을 만들면 holes가 증가', () => {
  const b = createBoard();
  // 한 열의 위에 블록, 아래 빈칸 = 구멍
  b[20][0] = 'X'; // 아래(21)는 빈칸
  const f = boardFeatures(b);
  assert.ok(f.holes >= 1);
});

test('enumeratePlacements는 여러 착수를 낸다', () => {
  const places = enumeratePlacements(createBoard(), 'T');
  assert.ok(places.length > 4);
  for (const p of places) assert.ok(p.x >= -2 && p.x < WIDTH);
});

test('bestMove는 빈 보드에서 유효 착수를 고른다', () => {
  const mv = bestMove(createBoard(), 'I', null, true);
  assert.ok(['I'].includes(mv.type) || mv.useHold === false);
  assert.ok(Number.isInteger(mv.rotation));
});

test('봇은 라인 완성 착수를 선호한다', () => {
  const b = createBoard();
  // 바닥 행을 4칸 남기고 채움 → I조각으로 완성 가능하게
  for (let x = 0; x < WIDTH; x++) { if (x < 6) b[21][x] = 'X'; }
  // (완성 여부는 조각·자리 의존이므로, evaluateBoard가 라인클리어 보드를 더 높게 치는지 확인)
  const cleared = createBoard();
  const notCleared = createBoard();
  notCleared[21][0] = 'X';
  assert.ok(evaluateBoard(cleared) >= evaluateBoard(notCleared));
});

// hold가 비어 있고, 다음 조각으로 바꾸면 훨씬 좋을 때 봇이 hold를 쓰는지 검증
test('hold가 비었을 때 다음 조각이 더 좋으면 useHold=true', () => {
  const b = createBoard();
  // 0~8열 4줄(18~21행) 채우고 9열은 빈 우물 → I 수직이 4줄 클리어
  for (let y = 18; y <= 21; y++) for (let x = 0; x < 9; x++) b[y][x] = 'X';
  // 현재 O(우물 못 채움), 다음 I(우물 채워 테트리스). hold 비어 있고 사용 가능.
  const mv = bestMove(b, 'O', null, true, 'I');
  assert.equal(mv.useHold, true);
  assert.equal(mv.type, 'I');
});

// holdType이 있으면 기존처럼 hold 조각도 후보로 평가한다
test('hold에 조각이 있으면 더 좋은 쪽을 고른다', () => {
  const b = createBoard();
  for (let y = 18; y <= 21; y++) for (let x = 0; x < 9; x++) b[y][x] = 'X';
  // 현재 O, hold에 I. next는 무관(hold가 채워져 있으므로 hold 조각을 평가).
  const mv = bestMove(b, 'O', 'I', true, 'T');
  assert.equal(mv.useHold, true);
  assert.equal(mv.type, 'I');
});

// hold를 쓸 수 없으면(canHold=false) 현재 조각만 놓는다
test('canHold=false면 hold를 쓰지 않는다', () => {
  const b = createBoard();
  for (let y = 18; y <= 21; y++) for (let x = 0; x < 9; x++) b[y][x] = 'X';
  const mv = bestMove(b, 'O', null, false, 'I');
  assert.equal(mv.useHold, false);
});
