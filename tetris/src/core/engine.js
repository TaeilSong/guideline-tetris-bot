// 테트리스 게임 상태 머신: 스폰·이동·회전(SRS)·hold·락·게임오버
import { mulberry32, createBag } from './rng.js';
import { getKicks, SPAWN } from './pieces.js';
import { createBoard, collides, lockPiece, clearLines, dropY } from './board.js';
import { createScoreState, applyLock, detectTSpin } from './scoring.js';

export function createEngine({ seed = 0, nextCount = 5 } = {}) {
  const rng = mulberry32(seed >>> 0);
  const bag = createBag(rng);
  const board = createBoard();

  const engine = {
    board,
    active: null,
    hold: null,
    canHold: true,
    queue: [],
    score: createScoreState(),
    gameOver: false,
    lastActionWasRotation: false,
    softDropCells: 0,
  };

  function refillQueue() {
    while (engine.queue.length < nextCount) engine.queue.push(bag());
  }

  function spawn(type) {
    const [sx, sy] = SPAWN[type];
    const piece = { type, rotation: 0, x: sx, y: sy };
    if (collides(board, type, 0, sx, sy)) {
      engine.gameOver = true;
    }
    engine.active = piece;
    engine.lastActionWasRotation = false;
    engine.softDropCells = 0;
  }

  function spawnNext() {
    refillQueue();
    const type = engine.queue.shift();
    refillQueue();
    spawn(type);
    engine.canHold = true;
  }

  refillQueue();
  spawnNext();

  engine.isGrounded = function () {
    const a = engine.active;
    return collides(board, a.type, a.rotation, a.x, a.y + 1);
  };

  engine.getGhostY = function () {
    const a = engine.active;
    return dropY(board, a.type, a.rotation, a.x, a.y);
  };

  function tryMove(dx, dy) {
    if (engine.gameOver) return false;
    const a = engine.active;
    if (!collides(board, a.type, a.rotation, a.x + dx, a.y + dy)) {
      a.x += dx; a.y += dy;
      return true;
    }
    return false;
  }

  engine.moveLeft = function () {
    const ok = tryMove(-1, 0);
    if (ok) engine.lastActionWasRotation = false;
    return ok;
  };
  engine.moveRight = function () {
    const ok = tryMove(1, 0);
    if (ok) engine.lastActionWasRotation = false;
    return ok;
  };
  engine.softDrop = function () {
    const ok = tryMove(0, 1);
    if (ok) { engine.lastActionWasRotation = false; engine.softDropCells += 1; }
    return ok;
  };

  engine.rotate = function (dir) {
    if (engine.gameOver) return false;
    const a = engine.active;
    const to = ((a.rotation + dir) % 4 + 4) % 4;
    for (const [dx, dy] of getKicks(a.type, a.rotation, to)) {
      if (!collides(board, a.type, to, a.x + dx, a.y + dy)) {
        a.rotation = to; a.x += dx; a.y += dy;
        engine.lastActionWasRotation = true;
        return true;
      }
    }
    return false;
  };

  engine.lock = function () {
    const a = engine.active;
    const landedY = a.y;
    const tspin = detectTSpin(board, a.type, a.rotation, a.x, landedY, engine.lastActionWasRotation);
    lockPiece(board, a.type, a.rotation, a.x, landedY);
    const cleared = clearLines(board);
    applyLock({
      state: engine.score,
      linesCleared: cleared,
      tspin,
      hardDropCells: engine._pendingHardDrop || 0,
      softDropCells: engine.softDropCells,
    });
    engine._pendingHardDrop = 0;
    spawnNext();
  };

  engine.hardDrop = function () {
    if (engine.gameOver) return;
    const a = engine.active;
    const ghost = dropY(board, a.type, a.rotation, a.x, a.y);
    engine._pendingHardDrop = (ghost - a.y) * 1; // 셀 수
    a.y = ghost;
    engine.lock();
  };

  engine.holdPiece = function () {
    if (engine.gameOver || !engine.canHold) return false;
    const cur = engine.active.type;
    if (engine.hold === null) {
      engine.hold = cur;
      spawnNext();
    } else {
      const swap = engine.hold;
      engine.hold = cur;
      spawn(swap);
    }
    engine.canHold = false;
    return true;
  };

  // 중력 한 스텝: 내려갈 수 있으면 내려가고, 접지면 lock
  engine.step = function () {
    if (engine.gameOver) return;
    if (!tryMove(0, 1)) engine.lock();
  };

  return engine;
}
