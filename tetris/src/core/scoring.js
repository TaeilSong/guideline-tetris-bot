// 점수·레벨·콤보·Back-to-Back·T-스핀 판정
import { WIDTH, HEIGHT } from './board.js';

const LINE_BASE = { 0: 0, 1: 100, 2: 300, 3: 500, 4: 800 };
const TSPIN_FULL = { 0: 400, 1: 800, 2: 1200, 3: 1600 };
const TSPIN_MINI = { 0: 100, 1: 200 };

export function createScoreState() {
  return { score: 0, level: 1, lines: 0, combo: -1, backToBack: false };
}

export function linesToLevel(lines) {
  return 1 + Math.floor(lines / 10);
}

// T조각 회전 착지 시 4코너(중심 기준) 점유 수로 T-스핀 판정
export function detectTSpin(board, type, rotation, x, y, lastActionWasRotation) {
  if (type !== 'T' || !lastActionWasRotation) return 'none';
  // T조각 중심: 로컬 (1,1) → 보드 (x+1, y+1)
  const cx = x + 1, cy = y + 1;
  const corners = [[cx-1,cy-1],[cx+1,cy-1],[cx-1,cy+1],[cx+1,cy+1]]; // 좌상,우상,좌하,우하
  const occ = corners.map(([px,py]) =>
    px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT || board[py][px] !== null);
  const filled = occ.filter(Boolean).length;
  if (filled < 3) return 'none';
  // 조각이 향한 앞쪽 두 코너: 회전상태별 앞면 코너 인덱스
  // 상태0 앞=상단(0,1), 1 앞=우(1,3), 2 앞=하단(2,3), 3 앞=좌(0,2)
  const frontByRot = { 0:[0,1], 1:[1,3], 2:[2,3], 3:[0,2] };
  const [fa, fb] = frontByRot[rotation];
  const frontFilled = (occ[fa] ? 1 : 0) + (occ[fb] ? 1 : 0);
  return frontFilled === 2 ? 'full' : 'mini';
}

export function applyLock({ state, linesCleared, tspin, hardDropCells, softDropCells }) {
  const lvl = Math.max(1, state.level);
  let base;
  if (tspin === 'full') base = TSPIN_FULL[linesCleared] ?? 0;
  else if (tspin === 'mini') base = TSPIN_MINI[linesCleared] ?? 0;
  else base = LINE_BASE[linesCleared] ?? 0;

  const isDifficult = linesCleared > 0 && (linesCleared === 4 || tspin !== 'none');
  const b2bApplies = isDifficult && state.backToBack;

  if (linesCleared > 0) state.combo += 1;
  else state.combo = -1;

  const scaledBase = (b2bApplies ? Math.floor(base * 1.5) : base) * lvl;
  const comboBonus = linesCleared > 0 ? 50 * Math.max(0, state.combo) * lvl : 0;
  const dropPoints = hardDropCells * 2 + softDropCells * 1;
  const points = scaledBase + comboBonus + dropPoints;

  if (linesCleared > 0) state.backToBack = isDifficult;
  state.lines += linesCleared;
  state.level = linesToLevel(state.lines);
  state.score += points;

  return { points, cleared: linesCleared, tspin, backToBack: state.backToBack, combo: state.combo };
}
