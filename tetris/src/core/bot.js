// 휴리스틱 평가함수로 최선의 착수를 고르는 봇
import { cloneBoard, collides, lockPiece, clearLines, dropY, WIDTH, HEIGHT } from './board.js';

// 가중치: 튜닝 대상. holes/height/bumpiness는 낮을수록 좋으므로 음수 가중.
export const WEIGHTS = {
  aggregateHeight: -0.510066,
  lines: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
};

function columnHeights(board) {
  const heights = new Array(WIDTH).fill(0);
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < HEIGHT; y++) {
      if (board[y][x] !== null) { heights[x] = HEIGHT - y; break; }
    }
  }
  return heights;
}

export function boardFeatures(board) {
  const heights = columnHeights(board);
  const aggregateHeight = heights.reduce((a, b) => a + b, 0);
  let holes = 0;
  for (let x = 0; x < WIDTH; x++) {
    let seen = false;
    for (let y = 0; y < HEIGHT; y++) {
      if (board[y][x] !== null) seen = true;
      else if (seen) holes++;
    }
  }
  let bumpiness = 0;
  for (let x = 0; x < WIDTH - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);
  return { aggregateHeight, holes, bumpiness, heights };
}

// 완성된 라인 수를 세되 보드는 바꾸지 않는다
function countFullLines(board) {
  let n = 0;
  for (let y = 0; y < HEIGHT; y++) if (board[y].every(c => c !== null)) n++;
  return n;
}

export function evaluateBoard(board) {
  const f = boardFeatures(board);
  const lines = countFullLines(board);
  return WEIGHTS.aggregateHeight * f.aggregateHeight
       + WEIGHTS.lines * lines
       + WEIGHTS.holes * f.holes
       + WEIGHTS.bumpiness * f.bumpiness;
}

export function enumeratePlacements(board, type) {
  const results = [];
  for (let rotation = 0; rotation < 4; rotation++) {
    for (let x = -2; x < WIDTH; x++) {
      // 스폰 y 근처에서 시작해 유효한지 확인
      if (collides(board, type, rotation, x, 0)) continue;
      const y = dropY(board, type, rotation, x, 0);
      if (y < 0) continue;
      results.push({ rotation, x, y });
    }
  }
  return results;
}

function scorePlacement(board, type, place) {
  const b = cloneBoard(board);
  lockPiece(b, type, place.rotation, place.x, place.y);
  const cleared = clearLines(b);
  // 클리어 후 보드 특징 + 클리어한 라인 수 보상
  const f = boardFeatures(b);
  return WEIGHTS.aggregateHeight * f.aggregateHeight
       + WEIGHTS.lines * cleared
       + WEIGHTS.holes * f.holes
       + WEIGHTS.bumpiness * f.bumpiness;
}

export function bestMove(board, type, holdType, canHold, nextType) {
  let best = null;
  // 후보 A: 현재 조각을 지금 놓는다
  for (const place of enumeratePlacements(board, type)) {
    const score = scorePlacement(board, type, place);
    if (!best || score > best.score) {
      best = { type, rotation: place.rotation, x: place.x, score, useHold: false };
    }
  }
  // 후보 B: hold를 쓴다. hold에 조각이 있으면 그 조각이, 비어 있으면 다음 조각이 활성이 된다.
  if (canHold) {
    const heldResult = holdType ?? nextType ?? null;
    if (heldResult) {
      for (const place of enumeratePlacements(board, heldResult)) {
        const score = scorePlacement(board, heldResult, place);
        if (!best || score > best.score) {
          best = { type: heldResult, rotation: place.rotation, x: place.x, score, useHold: true };
        }
      }
    }
  }
  return best
    ? { type: best.type, rotation: best.rotation, x: best.x, useHold: best.useHold }
    : { type, rotation: 0, x: 3, useHold: false };
}
