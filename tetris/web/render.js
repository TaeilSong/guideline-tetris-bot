// 엔진 상태를 Canvas에 그리는 렌더러
import { PIECES } from '../src/core/pieces.js';
import { WIDTH, HEIGHT, VISIBLE } from '../src/core/board.js';
import { getCells } from '../src/core/pieces.js';

const CELL = 30;
const HIDDEN = HEIGHT - VISIBLE; // 상단 버퍼 2행은 숨김

function drawCell(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeRect(x * CELL, y * CELL, CELL, CELL);
}

export function renderBoard(ctx, engine) {
  ctx.clearRect(0, 0, WIDTH * CELL, VISIBLE * CELL);
  // 격자 배경
  for (let y = HIDDEN; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const cell = engine.board[y][x];
      if (cell) drawCell(ctx, x, y - HIDDEN, cell);
    }
  }
  const a = engine.active;
  if (a) {
    // 고스트
    const gy = engine.getGhostY();
    ctx.globalAlpha = 0.25;
    for (const [cx, cy] of getCells(a.type, a.rotation)) {
      const yy = gy + cy - HIDDEN;
      if (yy >= 0) drawCell(ctx, a.x + cx, yy, PIECES[a.type].color);
    }
    ctx.globalAlpha = 1;
    // 활성 조각
    for (const [cx, cy] of getCells(a.type, a.rotation)) {
      const yy = a.y + cy - HIDDEN;
      if (yy >= 0) drawCell(ctx, a.x + cx, yy, PIECES[a.type].color);
    }
  }
}

function drawMini(ctx, type, ox, oy) {
  if (!type) return;
  const cells = getCells(type, 0);
  for (const [cx, cy] of cells) {
    ctx.fillStyle = PIECES[type].color;
    ctx.fillRect(ox + cx * 20, oy + cy * 20, 19, 19);
  }
}

export function renderHold(ctx, engine) {
  ctx.clearRect(0, 0, 96, 96);
  drawMini(ctx, engine.hold, 8, 8);
}

export function renderNext(ctx, engine) {
  ctx.clearRect(0, 0, 96, 360);
  engine.queue.forEach((type, i) => drawMini(ctx, type, 8, 8 + i * 70));
}

export function renderHUD(engine) {
  document.getElementById('score').textContent = engine.score.score;
  document.getElementById('lines').textContent = engine.score.lines;
  document.getElementById('level').textContent = engine.score.level;
}
