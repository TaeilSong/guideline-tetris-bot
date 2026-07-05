// 키보드 입력, 게임 루프(중력·락딜레이), 봇 자동플레이를 구동
import { createEngine } from '../src/core/engine.js';
import { bestMove } from '../src/core/bot.js';
import { renderBoard, renderHold, renderNext, renderHUD } from './render.js';

const boardCtx = document.getElementById('board').getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');

let engine = createEngine({ seed: (Math.random() * 1e9) | 0, nextCount: 5 });
let botOn = false;
let botPlan = null; // { rotation, x, useHold } 진행중 계획

// 중력 타이밍(가이드라인 근사): 레벨별 프레임 → ms
function gravityMs(level) {
  const t = Math.pow(0.8 - (level - 1) * 0.007, level - 1); // 초 단위
  return Math.max(16, t * 1000);
}

let lastGravity = performance.now();
let lockTimer = null;   // 접지 시각
let lockResets = 0;
const LOCK_DELAY = 500;
const MAX_RESETS = 15;

function draw() {
  renderBoard(boardCtx, engine);
  renderHold(holdCtx, engine);
  renderNext(nextCtx, engine);
  renderHUD(engine);
}

function resetLock() {
  if (lockResets < MAX_RESETS) { lockTimer = performance.now(); lockResets++; }
}

function afterAction() {
  // 접지 상태에서 이동/회전 시 락딜레이 리셋
  if (engine.isGrounded()) { if (lockTimer === null) lockTimer = performance.now(); }
  else { lockTimer = null; lockResets = 0; }
  draw();
}

// 봇: 매 조각마다 계획 세우고 한 스텝씩 실행해 눈에 보이게 플레이
function botStep() {
  if (!engine.active) return;
  if (!botPlan) {
    botPlan = bestMove(engine.board, engine.active.type, engine.hold, engine.canHold);
    if (botPlan.useHold) { engine.holdPiece(); botPlan.useHold = false; afterAction(); return; }
  }
  const a = engine.active;
  if (a.rotation !== botPlan.rotation) { engine.rotate(1); afterAction(); return; }
  if (a.x < botPlan.x) { engine.moveRight(); afterAction(); return; }
  if (a.x > botPlan.x) { engine.moveLeft(); afterAction(); return; }
  engine.hardDrop();
  botPlan = null;
  lockTimer = null; lockResets = 0;
  afterAction();
}

let lastBot = performance.now();
const BOT_INTERVAL = 60; // ms, 봇 조작 속도

function loop(now) {
  if (!engine.gameOver) {
    if (botOn) {
      if (now - lastBot >= BOT_INTERVAL) { botStep(); lastBot = now; }
    } else {
      // 중력
      if (now - lastGravity >= gravityMs(engine.score.level)) {
        if (!engine.softDrop()) {
          if (lockTimer === null) lockTimer = now;
        }
        lastGravity = now;
        afterAction();
      }
      // 락 딜레이 만료
      if (lockTimer !== null && engine.isGrounded() && now - lockTimer >= LOCK_DELAY) {
        engine.lock();
        lockTimer = null; lockResets = 0;
        afterAction();
      }
    }
  }
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (engine.gameOver && e.key.toLowerCase() !== 'r') return;
  switch (e.key) {
    case 'ArrowLeft': engine.moveLeft(); resetLock(); afterAction(); break;
    case 'ArrowRight': engine.moveRight(); resetLock(); afterAction(); break;
    case 'ArrowDown': engine.softDrop(); afterAction(); break;
    case ' ': e.preventDefault(); engine.hardDrop(); lockTimer=null; lockResets=0; afterAction(); break;
    case 'ArrowUp': case 'x': case 'X': engine.rotate(1); resetLock(); afterAction(); break;
    case 'z': case 'Z': engine.rotate(-1); resetLock(); afterAction(); break;
    case 'c': case 'C': engine.holdPiece(); afterAction(); break;
    case 'b': case 'B': toggleBot(); break;
    case 'r': case 'R': doReset(); break;
  }
});

function toggleBot() {
  botOn = !botOn;
  botPlan = null;
  document.getElementById('botToggle').textContent = botOn ? '봇 정지 (B)' : '봇 시작 (B)';
}
function doReset() {
  engine = createEngine({ seed: (Math.random() * 1e9) | 0, nextCount: 5 });
  botPlan = null; lockTimer = null; lockResets = 0;
  draw();
}

document.getElementById('botToggle').addEventListener('click', toggleBot);
document.getElementById('reset').addEventListener('click', doReset);

draw();
requestAnimationFrame(loop);
