// 보드 격자와 충돌·라인클리어·하드드롭 계산
import { getCells, PIECES } from './pieces.js';

export const WIDTH = 10;
export const HEIGHT = 22;
export const VISIBLE = 20;

export function createBoard() {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
}

export function cloneBoard(board) {
  return board.map(row => row.slice());
}

export function collides(board, type, rotation, x, y) {
  for (const [cx, cy] of getCells(type, rotation)) {
    const px = x + cx, py = y + cy;
    if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return true;
    if (board[py][px] !== null) return true;
  }
  return false;
}

export function lockPiece(board, type, rotation, x, y) {
  const color = PIECES[type].color;
  for (const [cx, cy] of getCells(type, rotation)) {
    board[y + cy][x + cx] = color;
  }
}

export function clearLines(board) {
  let cleared = 0;
  for (let y = HEIGHT - 1; y >= 0; y--) {
    if (board[y].every(cell => cell !== null)) {
      board.splice(y, 1);
      board.unshift(Array(WIDTH).fill(null));
      cleared++;
      y++; // 같은 인덱스를 다시 검사(내려온 행)
    }
  }
  return cleared;
}

export function dropY(board, type, rotation, x, y) {
  let ny = y;
  while (!collides(board, type, rotation, x, ny + 1)) ny++;
  return ny;
}
