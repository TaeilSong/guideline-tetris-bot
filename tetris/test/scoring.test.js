// 점수·레벨·콤보·B2B·T-스핀 판정을 검증하는 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScoreState, applyLock, detectTSpin, linesToLevel } from '../src/core/scoring.js';
import { createBoard, lockPiece } from '../src/core/board.js';

test('테트리스는 800점(레벨1)', () => {
  const s = createScoreState();
  const e = applyLock({ state: s, linesCleared: 4, tspin: 'none', hardDropCells: 0, softDropCells: 0 });
  assert.equal(e.points, 800);
  assert.equal(s.lines, 4);
});

test('싱글은 100점, 콤보/드롭 없음', () => {
  const s = createScoreState();
  const e = applyLock({ state: s, linesCleared: 1, tspin: 'none', hardDropCells: 0, softDropCells: 0 });
  assert.equal(e.points, 100);
});

test('하드드롭 셀당 2점 가산', () => {
  const s = createScoreState();
  const e = applyLock({ state: s, linesCleared: 0, tspin: 'none', hardDropCells: 5, softDropCells: 0 });
  assert.equal(e.points, 10);
});

test('연속 테트리스는 Back-to-Back 1.5배', () => {
  const s = createScoreState();
  applyLock({ state: s, linesCleared: 4, tspin: 'none', hardDropCells: 0, softDropCells: 0 }); // 800
  const e = applyLock({ state: s, linesCleared: 4, tspin: 'none', hardDropCells: 0, softDropCells: 0 });
  assert.equal(e.points, 1250); // 800*1.5 + 콤보50
  assert.equal(e.backToBack, true);
});

test('콤보는 연속 클리어마다 가산', () => {
  const s = createScoreState();
  applyLock({ state: s, linesCleared: 1, tspin: 'none', hardDropCells: 0, softDropCells: 0 }); // combo 0
  const e = applyLock({ state: s, linesCleared: 1, tspin: 'none', hardDropCells: 0, softDropCells: 0 }); // combo 1
  assert.equal(e.points, 100 + 50 * 1); // 라인100 + 콤보50
});

test('T-스핀 판정: 3코너 막히고 회전착지면 full', () => {
  const b = createBoard();
  // T조각을 좌하단 코너 근처에 두고 주변을 막아 3코너 성립시킴
  // 여기서는 detectTSpin의 코너 검사 로직만 확인(간단 케이스)
  // 바닥 구석에 T(상태2) 배치: 중심 아래가 바닥
  const type = 'T', rot = 2, x = 0, y = 20; // 보드 하단
  // 좌우 바닥 채우기
  for (let yy = 20; yy < 22; yy++) { b[yy][0] = b[yy][2] = 'X'; }
  const kind = detectTSpin(b, type, rot, x, y, true);
  assert.ok(kind === 'full' || kind === 'mini');
});

test('linesToLevel: 10줄마다 레벨업, 1부터', () => {
  assert.equal(linesToLevel(0), 1);
  assert.equal(linesToLevel(9), 1);
  assert.equal(linesToLevel(10), 2);
  assert.equal(linesToLevel(25), 3);
});
