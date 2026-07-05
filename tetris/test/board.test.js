// 보드 격자, 충돌, 라인 클리어, 하드드롭 착지를 검증하는 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, cloneBoard, collides, lockPiece, clearLines, dropY, WIDTH, HEIGHT } from '../src/core/board.js';

test('빈 보드는 HEIGHT×WIDTH 이고 모두 null', () => {
  const b = createBoard();
  assert.equal(b.length, HEIGHT);
  assert.equal(b[0].length, WIDTH);
  assert.ok(b.flat().every(c => c === null));
});

test('벽/바닥 밖은 충돌', () => {
  const b = createBoard();
  assert.equal(collides(b, 'O', 0, -2, 0), true);   // 왼쪽 밖
  assert.equal(collides(b, 'O', 0, 9, 0), true);     // 오른쪽 밖(O는 2칸폭)
  assert.equal(collides(b, 'O', 0, 3, HEIGHT-1), true); // 바닥 밖
  assert.equal(collides(b, 'O', 0, 3, 0), false);    // 빈 공간
});

test('기존 블록과 겹치면 충돌', () => {
  const b = createBoard();
  lockPiece(b, 'O', 0, 3, HEIGHT-2);
  assert.equal(collides(b, 'O', 0, 3, HEIGHT-2), true);
});

test('꽉 찬 행은 제거되고 개수를 반환', () => {
  const b = createBoard();
  const y = HEIGHT - 1;
  for (let x = 0; x < WIDTH; x++) b[y][x] = 'X';
  // 위에 블록 하나
  b[y-1][0] = 'A';
  const cleared = clearLines(b);
  assert.equal(cleared, 1);
  assert.equal(b[HEIGHT-1][0], 'A'); // 위 블록이 한 칸 내려옴
  assert.equal(b[HEIGHT-1][1], null);
});

test('dropY는 바닥까지의 착지 위치를 준다', () => {
  const b = createBoard();
  const landed = dropY(b, 'O', 0, 3, 0);
  // O조각(상태0)은 y..y+1 점유, 바닥은 HEIGHT-1 이므로 착지 y = HEIGHT-2
  assert.equal(landed, HEIGHT - 2);
});
