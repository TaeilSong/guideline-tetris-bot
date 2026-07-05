// 봇 성능을 시드 고정으로 재현 측정하는 헤드리스 벤치마크 CLI
import { createEngine } from '../src/core/engine.js';
import { bestMove } from '../src/core/bot.js';
import { deriveSeed } from '../src/core/rng.js';

const WIDTH_GUARD = 12;

export function applyMove(engine, move) {
  if (move.useHold) engine.holdPiece();
  // 목표 회전까지 회전(최대 3회)
  let guard = 0;
  while (engine.active.rotation !== move.rotation && guard++ < 4) {
    if (!engine.rotate(1)) break;
  }
  // 목표 x까지 좌우 이동
  guard = 0;
  while (engine.active.x < move.x && guard++ < WIDTH_GUARD) {
    if (!engine.moveRight()) break;
  }
  guard = 0;
  while (engine.active.x > move.x && guard++ < WIDTH_GUARD) {
    if (!engine.moveLeft()) break;
  }
  engine.hardDrop();
}

export function playOneGame(seed, maxPieces = 5000) {
  const engine = createEngine({ seed, nextCount: 5 });
  let pieces = 0;
  let reason = 'maxPieces';
  while (pieces < maxPieces) {
    if (engine.gameOver) { reason = 'gameover'; break; }
    const move = bestMove(engine.board, engine.active.type, engine.hold, engine.canHold, engine.queue[0]);
    applyMove(engine, move);
    pieces++;
    if (engine.gameOver) { reason = 'gameover'; break; }
  }
  return { lines: engine.score.lines, score: engine.score.score, pieces, reason };
}

function stats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n/2 - 1] + sorted[n/2]) / 2;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, median, std: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
}

export function runBench({ games, seed, maxPieces = 5000 }) {
  const results = [];
  for (let i = 0; i < games; i++) {
    results.push(playOneGame(deriveSeed(seed, i), maxPieces));
  }
  const summary = {
    lines: stats(results.map(r => r.lines)),
    score: stats(results.map(r => r.score)),
    pieces: stats(results.map(r => r.pieces)),
    reasons: results.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc; }, {}),
  };
  return { results, summary };
}

function parseArgs(argv) {
  const args = { games: 100, seed: 42, maxPieces: 5000, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') args.games = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--maxPieces') args.maxPieces = Number(argv[++i]);
    else if (a === '--json') args.json = argv[++i];
  }
  return args;
}

function fmt(s) {
  return `mean=${s.mean.toFixed(1)} median=${s.median} std=${s.std.toFixed(1)} min=${s.min} max=${s.max}`;
}

// CLI 진입점(직접 실행 시에만)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const { results, summary } = runBench(args);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== Tetris Bot Benchmark ===`);
  console.log(`games=${args.games} seed=${args.seed} maxPieces=${args.maxPieces}  (${dt}s)`);
  console.log(`lines   : ${fmt(summary.lines)}`);
  console.log(`score   : ${fmt(summary.score)}`);
  console.log(`pieces  : ${fmt(summary.pieces)}`);
  console.log(`reasons : ${JSON.stringify(summary.reasons)}`);
  if (args.json) {
    const fs = await import('node:fs');
    fs.writeFileSync(args.json, JSON.stringify({ args, summary, results }, null, 2));
    console.log(`\nsaved: ${args.json}`);
  }
}
