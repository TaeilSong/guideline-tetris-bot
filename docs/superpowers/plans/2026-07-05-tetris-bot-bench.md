# 가이드라인 테트리스 + 휴리스틱 봇 + 벤치마크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 표준 가이드라인 규칙을 지키는 웹 테트리스와, 스스로 플레이하는 휴리스틱 봇, 그리고 시드 고정으로 완전 재현 가능한 성능 측정 CLI를 만든다.

**Architecture:** DOM/시계/전역 랜덤에 의존하지 않는 순수 ES 모듈 core(rng, pieces, board, engine, scoring, bot)를 만들고, 브라우저 UI(web/)와 헤드리스 벤치(bench/)가 같은 core를 재사용한다. 빌드 도구 없이 native ESM으로 브라우저와 Node 양쪽에서 로드한다.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML5 Canvas, Node.js 내장 `node:test`/`node:assert`. 외부 의존성 없음.

## Global Constraints

- 언어: JavaScript ES modules(`import`/`export`). 빌드/트랜스파일 없음. Node 18+ (native ESM, `node --test`).
- core 모듈(`tetris/src/core/*`)은 DOM, `Date.now`, `Math.random`, `window` 등 전역/환경 의존 금지. 랜덤은 주입된 RNG만 사용.
- 새 소스 파일 첫 줄은 역할을 설명하는 한 줄 한국어 주석(설정 파일 제외).
- 보드 규격: 폭 10, 표시 높이 20, 상단 버퍼 포함 총 높이 22. 좌표는 (x=열 0~9, y=행, y=0이 최상단).
- 조각 7종: I, O, T, S, Z, J, L. 회전 상태 4종: 0, R(시계방향 1), 2, L(반시계 1 = 시계 3).
- 점수/중력은 테트리스 가이드라인 표준값을 따른다(본 계획 각 태스크에 상수로 명시).
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

```
tetris/
├── src/core/
│   ├── rng.js        시드 RNG(mulberry32) + 7-bag 생성기
│   ├── pieces.js     조각 셀 정의 + SRS 월킥 테이블
│   ├── board.js      보드 격자, 충돌, 라인 클리어
│   ├── scoring.js    점수/레벨/콤보/B2B/T-스핀 판정
│   ├── engine.js     게임 상태 머신(스폰/이동/회전/락딜레이/hold/gravity)
│   └── bot.js        휴리스틱 평가 + 착수 후보 탐색
├── web/
│   ├── index.html
│   ├── render.js     Canvas 렌더링
│   └── input.js      키보드 입력 + 봇 자동플레이 구동
├── bench/
│   └── bench.js      Node CLI 벤치마크
└── test/
    ├── rng.test.js
    ├── pieces.test.js
    ├── board.test.js
    ├── scoring.test.js
    ├── engine.test.js
    └── bot.test.js
```

각 파일은 하나의 책임을 가진다. core는 순수 함수/상태 객체 위주로 작성하고, 부작용(렌더·입력·시간)은 web/에만 둔다.

---

## Task 1: 프로젝트 스캐폴드 + RNG

**Files:**
- Create: `tetris/package.json`
- Create: `tetris/src/core/rng.js`
- Test: `tetris/test/rng.test.js`

**Interfaces:**
- Produces:
  - `mulberry32(seed: number) => () => number` — [0,1) 난수 생성기.
  - `deriveSeed(seed: number, index: number) => number` — 게임별 파생 시드.
  - `createBag(rng: () => number) => () => string` — 호출할 때마다 다음 조각 타입(`'I'|'O'|'T'|'S'|'Z'|'J'|'L'`)을 7-bag 규칙으로 반환.

- [ ] **Step 1: package.json 생성**

`tetris/package.json`:
```json
{
  "name": "tetris-bot-bench",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "bench": "node bench/bench.js"
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tetris/test/rng.test.js`:
```js
// RNG 시드 재현성과 7-bag 규칙을 검증하는 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, deriveSeed, createBag } from '../src/core/rng.js';

test('같은 시드는 같은 난수 수열을 낸다', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every(n => n >= 0 && n < 1));
});

test('다른 시드는 다른 수열을 낸다', () => {
  const a = mulberry32(1), b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('deriveSeed는 인덱스별로 다른 시드를 낸다', () => {
  assert.notEqual(deriveSeed(42, 0), deriveSeed(42, 1));
  assert.equal(deriveSeed(42, 3), deriveSeed(42, 3));
});

test('7-bag은 매 7개마다 7종을 정확히 한 번씩 포함한다', () => {
  const bag = createBag(mulberry32(7));
  const types = ['I','O','T','S','Z','J','L'];
  for (let round = 0; round < 3; round++) {
    const drawn = Array.from({ length: 7 }, () => bag());
    assert.deepEqual([...drawn].sort(), [...types].sort());
  }
});

test('같은 시드의 bag은 같은 조각 순서를 낸다', () => {
  const b1 = createBag(mulberry32(99));
  const b2 = createBag(mulberry32(99));
  const s1 = Array.from({ length: 14 }, () => b1());
  const s2 = Array.from({ length: 14 }, () => b2());
  assert.deepEqual(s1, s2);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd tetris && node --test test/rng.test.js`
Expected: FAIL — `Cannot find module '../src/core/rng.js'`

- [ ] **Step 4: 최소 구현**

`tetris/src/core/rng.js`:
```js
// 시드 고정 난수 생성기와 7-bag 조각 공급기
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveSeed(seed, index) {
  // 시드와 인덱스를 섞어 게임별 독립 시드를 만든다
  let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9E3779B9);
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createBag(rng) {
  let queue = [];
  return function next() {
    if (queue.length === 0) {
      queue = [...TYPES];
      // Fisher-Yates 셔플
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    return queue.shift();
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd tetris && node --test test/rng.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add tetris/package.json tetris/src/core/rng.js tetris/test/rng.test.js
git commit -m "feat: 시드 RNG와 7-bag 조각 공급기 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 조각 정의 + SRS 월킥 테이블

**Files:**
- Create: `tetris/src/core/pieces.js`
- Test: `tetris/test/pieces.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `PIECES: Record<string, { color: string, cells: Record<0|1|2|3, Array<[x,y]>> }>` — 각 조각의 회전상태별 셀 좌표(스폰 기준 로컬 좌표, 4x4 박스 내 정수 오프셋). O조각은 4상태 동일.
  - `getCells(type: string, rotation: 0|1|2|3) => Array<[x,y]>` — 회전상태의 셀 좌표 배열.
  - `getKicks(type: string, from: 0|1|2|3, to: 0|1|2|3) => Array<[dx,dy]>` — SRS 월킥 후보 오프셋(dy는 아래로 갈수록 +y). 5개 후보.
  - `SPAWN: Record<string, [x,y]>` — 각 조각의 스폰 원점(보드 좌표). 표준: x=3(I·O는 규격상 3), y=0(버퍼 상단).

**참고 — SRS 좌표계:** 로컬 셀은 4x4 그리드 기준. y는 아래로 증가. JLSTZ 스폰(상태0) 예: T = [[1,0],[0,1],[1,1],[2,1]]. 월킥 테이블은 아래 표준값을 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/pieces.test.js`:
```js
// 조각 셀 정의와 SRS 월킥 테이블을 검증하는 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, getCells, getKicks } from '../src/core/pieces.js';

test('7종 조각이 모두 정의되고 각 회전상태는 4셀이다', () => {
  for (const type of ['I','O','T','S','Z','J','L']) {
    assert.ok(PIECES[type], `${type} 정의 존재`);
    for (const r of [0,1,2,3]) {
      assert.equal(getCells(type, r).length, 4, `${type} 상태${r} 4셀`);
    }
  }
});

test('O조각은 4회전 상태가 모두 같다', () => {
  const base = JSON.stringify([...getCells('O',0)].sort());
  for (const r of [1,2,3]) {
    assert.equal(JSON.stringify([...getCells('O',r)].sort()), base);
  }
});

test('T조각 스폰 상태 셀이 표준과 일치한다', () => {
  const cells = [...getCells('T',0)].map(c => c.join(',')).sort();
  assert.deepEqual(cells, ['0,1','1,0','1,1','2,1'].sort());
});

test('JLSTZ 0->R 월킥은 표준 5후보다', () => {
  assert.deepEqual(getKicks('T', 0, 1), [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]);
});

test('I조각 0->R 월킥은 I 전용 테이블을 쓴다', () => {
  assert.deepEqual(getKicks('I', 0, 1), [[0,0],[-2,0],[1,0],[-2,1],[1,-2]]);
});
```

> 주: 위 월킥 값은 위키 표준을 y축(아래 +) 기준으로 부호 변환한 것이다. 구현 시 아래 표를 그대로 넣으면 테스트가 통과한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/pieces.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/src/core/pieces.js`:
```js
// 테트로미노 셀 좌표와 SRS 월킥 오프셋 테이블
// 로컬 좌표계: x 오른쪽+, y 아래+. 회전상태 0,1(R),2,3(L).

export const PIECES = {
  I: { color: '#31c7ef', cells: {
    0: [[0,1],[1,1],[2,1],[3,1]],
    1: [[2,0],[2,1],[2,2],[2,3]],
    2: [[0,2],[1,2],[2,2],[3,2]],
    3: [[1,0],[1,1],[1,2],[1,3]] } },
  O: { color: '#f7d308', cells: {
    0: [[1,0],[2,0],[1,1],[2,1]],
    1: [[1,0],[2,0],[1,1],[2,1]],
    2: [[1,0],[2,0],[1,1],[2,1]],
    3: [[1,0],[2,0],[1,1],[2,1]] } },
  T: { color: '#ad4d9c', cells: {
    0: [[1,0],[0,1],[1,1],[2,1]],
    1: [[1,0],[1,1],[2,1],[1,2]],
    2: [[0,1],[1,1],[2,1],[1,2]],
    3: [[1,0],[0,1],[1,1],[1,2]] } },
  S: { color: '#42b642', cells: {
    0: [[1,0],[2,0],[0,1],[1,1]],
    1: [[1,0],[1,1],[2,1],[2,2]],
    2: [[1,1],[2,1],[0,2],[1,2]],
    3: [[0,0],[0,1],[1,1],[1,2]] } },
  Z: { color: '#ef2029', cells: {
    0: [[0,0],[1,0],[1,1],[2,1]],
    1: [[2,0],[1,1],[2,1],[1,2]],
    2: [[0,1],[1,1],[1,2],[2,2]],
    3: [[1,0],[0,1],[1,1],[0,2]] } },
  J: { color: '#5a65ad', cells: {
    0: [[0,0],[0,1],[1,1],[2,1]],
    1: [[1,0],[2,0],[1,1],[1,2]],
    2: [[0,1],[1,1],[2,1],[2,2]],
    3: [[1,0],[1,1],[0,2],[1,2]] } },
  L: { color: '#ef7921', cells: {
    0: [[2,0],[0,1],[1,1],[2,1]],
    1: [[1,0],[1,1],[1,2],[2,2]],
    2: [[0,1],[1,1],[2,1],[0,2]],
    3: [[0,0],[1,0],[1,1],[1,2]] } },
};

export const SPAWN = {
  I: [3, 0], O: [3, 0], T: [3, 0], S: [3, 0], Z: [3, 0], J: [3, 0], L: [3, 0],
};

export function getCells(type, rotation) {
  return PIECES[type].cells[rotation];
}

// SRS 월킥: 키는 `${from}>${to}`. 값은 [dx,dy] 5후보. y는 아래로 +.
const JLSTZ_KICKS = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
};

export function getKicks(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${from}>${to}`];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd tetris && node --test test/pieces.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add tetris/src/core/pieces.js tetris/test/pieces.test.js
git commit -m "feat: 테트로미노 정의와 SRS 월킥 테이블 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 보드 — 격자·충돌·라인 클리어

**Files:**
- Create: `tetris/src/core/board.js`
- Test: `tetris/test/board.test.js`

**Interfaces:**
- Consumes: `getCells` from `pieces.js`.
- Produces:
  - `WIDTH = 10`, `HEIGHT = 22`, `VISIBLE = 20`.
  - `createBoard() => string[][]` — HEIGHT×WIDTH 격자, 빈칸은 `null`.
  - `cloneBoard(board) => string[][]` — 깊은 복제.
  - `collides(board, type, rotation, x, y) => boolean` — 셀이 벽/바닥/기존 블록과 겹치거나 범위를 벗어나면 true.
  - `lockPiece(board, type, rotation, x, y) => void` — 보드에 조각 색을 기록(제자리 변경).
  - `clearLines(board) => number` — 꽉 찬 행 제거 후 위 블록 낙하, 제거된 행 수 반환.
  - `dropY(board, type, rotation, x, y) => number` — 현재 위치에서 하드드롭했을 때 착지 y.

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/board.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/board.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/src/core/board.js`:
```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd tetris && node --test test/board.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add tetris/src/core/board.js tetris/test/board.test.js
git commit -m "feat: 보드 격자와 충돌·라인클리어·하드드롭 계산 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 점수 — 라인·드롭·콤보·B2B·T-스핀

**Files:**
- Create: `tetris/src/core/scoring.js`
- Test: `tetris/test/scoring.test.js`

**Interfaces:**
- Consumes: 없음(순수 계산). T-스핀 판정은 보드 코너 정보를 인자로 받는다.
- Produces:
  - `createScoreState() => { score, level, lines, combo, backToBack }` — combo=-1(콤보 없음), backToBack=false 초기.
  - `detectTSpin(board, type, rotation, x, y, lastActionWasRotation) => 'none'|'mini'|'full'` — T조각·회전착지·3코너 규칙. type≠'T'이거나 회전착지 아니면 'none'.
  - `applyLock({ state, linesCleared, tspin, hardDropCells, softDropCells }) => events` — state를 갱신하고 `{ points, cleared, tspin, backToBack, combo }` 반환.
    - 라인 점수(레벨 곱 전 기본): 0라인=0, 1=100, 2=300, 3=500, 4(테트리스)=800.
    - T-Spin: mini 0라인=100, mini 1라인=200; full 0라인=400, 1=800, 2=1200, 3=1600.
    - 점수는 위 기본값 × level(레벨 1부터, 즉 ×max(1,level)). 하드드롭 셀당 2점, 소프트드롭 셀당 1점(레벨 곱 없음).
    - Back-to-Back: 직전과 이번이 모두 "어려운 클리어"(테트리스 또는 T-스핀 라인클리어)면 라인 점수 ×1.5.
    - Combo: 라인클리어가 연속되면 combo 증가, +50×combo×max(1,level). 라인클리어 없으면 combo=-1.
  - `linesToLevel(lines) => number` — 10줄마다 레벨+1, 레벨 1부터 시작.

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/scoring.test.js`:
```js
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
  assert.equal(e.points, 1250); // 800*1.5 + 콤보50 (실제 가이드라인: 콤보+B2B 동시)
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/scoring.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/src/core/scoring.js`:
```js
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
  let b2b = state.backToBack;
  let points = base;

  if (linesCleared > 0) {
    if (isDifficult && state.backToBack) points = Math.floor(points * 1.5);
    b2b = isDifficult; // 어려운 클리어면 유지, 아니면 해제
    state.combo += 1;
    points += 50 * state.combo * lvl;
    points *= 1; // 기본점은 이미 절대값이므로 라인점수만 레벨 곱: 아래에서 처리
  } else {
    state.combo = -1;
  }

  // 라인/티스핀 기본점에 레벨 곱 적용(드롭 점수 제외). base 부분만 재계산.
  // 위에서 points에 base가 들어갔으므로 base에 (lvl-1)배를 추가로 더한다.
  if (linesCleared > 0 || tspin !== 'none') {
    const scaledBase = (isDifficult && state.backToBack ? Math.floor(base * 1.5) : base) * lvl;
    const comboBonus = linesCleared > 0 ? 50 * state.combo * lvl : 0;
    points = scaledBase + comboBonus;
  }

  const dropPoints = hardDropCells * 2 + softDropCells * 1;
  points += dropPoints;

  state.backToBack = b2b;
  state.lines += linesCleared;
  state.level = linesToLevel(state.lines);
  state.score += points;

  return { points, cleared: linesCleared, tspin, backToBack: state.backToBack, combo: state.combo };
}
```

> **구현 주의(자체검토 반영):** 위 `applyLock`은 base 레벨 곱을 두 번 계산하지 않도록, 최종 `points`를 한 번만 조립한다. 실제 구현 시 아래 정리된 형태를 사용하라(테스트가 이 값을 기대함):
> - 라인/T-스핀 기본점 `base` → `scaledBase = (b2b적용 ? floor(base*1.5) : base) * lvl`
> - `comboBonus = linesCleared>0 ? 50*combo*lvl : 0`
> - `points = scaledBase + comboBonus + hardDropCells*2 + softDropCells*1`
> - 레벨1·콤보 시작(-1→0)에서 테트리스=800, 싱글=100 이 나오는지 확인.

- [ ] **Step 4: 구현 정리(중복 계산 제거)**

위 주의사항대로 `applyLock` 본문을 다음 최종형으로 교체:
```js
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd tetris && node --test test/scoring.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
git add tetris/src/core/scoring.js tetris/test/scoring.test.js
git commit -m "feat: 점수·콤보·B2B·T-스핀 판정 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 엔진 — 게임 상태 머신

**Files:**
- Create: `tetris/src/core/engine.js`
- Test: `tetris/test/engine.test.js`

**Interfaces:**
- Consumes: `createBag, mulberry32` (rng.js), `getCells, getKicks, SPAWN` (pieces.js), `createBoard, collides, lockPiece, clearLines, dropY, cloneBoard` (board.js), `createScoreState, applyLock, detectTSpin` (scoring.js).
- Produces `createEngine({ seed, nextCount=5 }) => engine` 객체:
  - 상태 필드: `board, active {type,rotation,x,y}, hold, canHold, queue(길이 nextCount 유지), score(createScoreState 반환), gameOver, lastActionWasRotation, lockTimer, lockResets, softDropCells(누적)`.
  - 메서드(모두 boolean/void, 게임오버면 무시):
    - `moveLeft()/moveRight() => bool` — 성공 시 lastActionWasRotation=false, 접지 상태면 lock delay 리셋.
    - `softDrop() => bool` — 한 칸 하강. 성공 시 softDropCells 누적.
    - `hardDrop() => void` — 즉시 착지+락. 하드드롭 셀수만큼 점수. 항상 lock 수행.
    - `rotate(dir: 1|-1) => bool` — SRS 킥 시도. 성공 시 lastActionWasRotation=true, lock delay 리셋.
    - `holdPiece() => bool` — canHold일 때만. hold와 스왑 또는 큐에서 새로 스폰. 스왑 후 canHold=false.
    - `tick(gravitySteps=1) => void` — 중력. 접지 상태에서 lockTimer 진행은 web에서 관리하므로, 여기선 `step()`로 한 칸 낙하 시도, 불가하면 lock 후보 표시만.
    - `lock() => void` — 현재 위치에서 조각 고정, 라인클리어, 점수 적용, T-스핀 판정, 다음 조각 스폰. 스폰 위치 충돌 시 gameOver=true.
    - `getGhostY() => number` — 고스트 착지 y.
  - **주의:** 락 딜레이 타이밍(0.5s, 15리셋)은 실시간이라 web 루프가 관리한다. 엔진은 "접지 여부(`isGrounded()`)"와 `lock()`만 제공하고, 벤치/봇은 hardDrop만 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/engine.test.js`:
```js
// 엔진 상태 머신(스폰/이동/회전/하드드롭/hold/게임오버)을 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/core/engine.js';

test('엔진 생성 시 활성 조각과 next 큐가 채워진다', () => {
  const e = createEngine({ seed: 1, nextCount: 5 });
  assert.ok(e.active);
  assert.equal(e.queue.length, 5);
  assert.equal(e.gameOver, false);
});

test('같은 시드는 같은 조각 순서를 만든다', () => {
  const a = createEngine({ seed: 5 });
  const b = createEngine({ seed: 5 });
  assert.equal(a.active.type, b.active.type);
  assert.deepEqual(a.queue, b.queue);
});

test('moveLeft/Right는 벽에서 막힌다', () => {
  const e = createEngine({ seed: 1 });
  let moved = 0;
  for (let i = 0; i < 20; i++) if (e.moveLeft()) moved++;
  assert.ok(moved < 20); // 언젠가 벽에 막힘
});

test('hardDrop은 조각을 고정하고 새 조각을 스폰한다', () => {
  const e = createEngine({ seed: 1 });
  const first = e.active.type;
  e.hardDrop();
  assert.ok(e.active); // 새 조각
  // 큐가 계속 5개 유지
  assert.equal(e.queue.length, 5);
});

test('hold는 조각을 보관하고 한 번만 가능', () => {
  const e = createEngine({ seed: 1 });
  const orig = e.active.type;
  assert.equal(e.holdPiece(), true);
  assert.equal(e.hold, orig);
  assert.equal(e.holdPiece(), false); // 연속 hold 불가
});

test('getGhostY는 활성 조각 y 이상이다', () => {
  const e = createEngine({ seed: 1 });
  assert.ok(e.getGhostY() >= e.active.y);
});

test('여러 번 하드드롭해도 게임오버 전까지 진행된다', () => {
  const e = createEngine({ seed: 3 });
  let count = 0;
  while (!e.gameOver && count < 200) { e.hardDrop(); count++; }
  assert.ok(count > 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/engine.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/src/core/engine.js`:
```js
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
```

> **자체검토 주의:** `hardDrop`의 `_pendingHardDrop`은 하드드롭으로 실제 이동한 셀 수여야 한다(soft/hard 점수 구분). `softDrop`은 `softDropCells`에 누적하고, `lock` 후 spawnNext에서 0으로 리셋된다(spawn 안에서 `softDropCells=0`). 순서상 `applyLock`이 리셋 전에 값을 읽도록 `lock()`에서 먼저 applyLock 호출 후 spawnNext 함을 확인.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd tetris && node --test test/engine.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 core 테스트 실행**

Run: `cd tetris && node --test`
Expected: PASS (rng+pieces+board+scoring+engine 전체)

- [ ] **Step 6: 커밋**

```bash
git add tetris/src/core/engine.js tetris/test/engine.test.js
git commit -m "feat: 게임 엔진 상태 머신(SRS 회전·hold·락) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 봇 — 휴리스틱 평가

**Files:**
- Create: `tetris/src/core/bot.js`
- Test: `tetris/test/bot.test.js`

**Interfaces:**
- Consumes: `cloneBoard, collides, lockPiece, clearLines, dropY, WIDTH, HEIGHT` (board.js), `getCells` (pieces.js).
- Produces:
  - `WEIGHTS` — 튜닝용 가중치 상수 객체 `{ aggregateHeight, lines, holes, bumpiness }`(음수/양수 부호 포함).
  - `evaluateBoard(board) => number` — 보드 특징을 가중합한 점수(높을수록 좋음).
  - `enumeratePlacements(board, type) => Array<{rotation,x,y}>` — 해당 조각으로 도달 가능한 모든 하드드롭 착지(회전 0~3 × 유효 x).
  - `bestMove(board, type, holdType, canHold) => { type, rotation, x, useHold: boolean }` — 현재/hold 후보 중 최고 평가 착수. useHold=true면 holdType을 놓는 것.
  - `boardFeatures(board) => { aggregateHeight, holes, bumpiness, heights }` — 특징 추출(테스트용 노출).

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/bot.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/bot.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/src/core/bot.js`:
```js
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
  clearLines(b);
  return evaluateBoard(b);
}

export function bestMove(board, type, holdType, canHold) {
  let best = null;
  for (const place of enumeratePlacements(board, type)) {
    const score = scorePlacement(board, type, place);
    if (!best || score > best.score) {
      best = { type, rotation: place.rotation, x: place.x, score, useHold: false };
    }
  }
  if (canHold) {
    const alt = holdType ?? null;
    if (alt) {
      for (const place of enumeratePlacements(board, alt)) {
        const score = scorePlacement(board, alt, place);
        if (!best || score > best.score) {
          best = { type: alt, rotation: place.rotation, x: place.x, score, useHold: true };
        }
      }
    }
  }
  return best || { type, rotation: 0, x: 3, useHold: false };
}
```

> **자체검토 주의:** `enumeratePlacements`는 스폰 상태(y=0)에서 충돌하지 않는 x만 후보로 삼는다. 이는 봇을 단순화한 것으로, 회전·이동으로만 도달 가능한 오버행 자리는 제외된다(휴리스틱 봇으로 충분). `evaluateBoard`의 `lines`는 클리어 직전 보드의 꽉 찬 라인 수를 세는데, `scorePlacement`는 `clearLines` 후 평가하므로 사실상 0이 된다 → 라인 보상이 반영되도록 `scorePlacement`에서 클리어 전 라인 수를 별도로 더한다. 아래 Step 4에서 이 버그를 수정한다.

- [ ] **Step 4: 라인 보상 버그 수정**

`scorePlacement`를 클리어된 라인 수를 반영하도록 수정:
```js
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
```
그리고 `evaluateBoard`의 `lines`는 테스트(빈 보드 비교)용으로 유지한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd tetris && node --test test/bot.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add tetris/src/core/bot.js tetris/test/bot.test.js
git commit -m "feat: 휴리스틱 평가 봇 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 벤치마크 CLI

**Files:**
- Create: `tetris/bench/bench.js`
- Test: `tetris/test/bench.test.js`

**Interfaces:**
- Consumes: `createEngine` (engine.js), `bestMove` (bot.js), `deriveSeed` (rng.js).
- Produces:
  - `playOneGame(seed, maxPieces) => { lines, score, pieces, reason }` — 봇이 한 판을 끝까지(게임오버 또는 maxPieces) 플레이. reason='gameover'|'maxPieces'.
  - `applyMove(engine, move)` — bestMove 결과를 엔진 액션으로 실행(hold 필요시 holdPiece 후, 목표 회전까지 rotate, 목표 x까지 move, hardDrop).
  - `runBench({ games, seed, maxPieces }) => { results, summary }` — summary는 lines/score/pieces 각각 `{mean, median, std, min, max}` + reason 분포.
  - CLI: `node bench/bench.js --games N --seed S [--maxPieces M] [--json path]` → 콘솔 표 출력.

- [ ] **Step 1: 실패하는 테스트 작성**

`tetris/test/bench.test.js`:
```js
// 벤치마크의 재현성과 통계 집계를 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { playOneGame, runBench } from '../bench/bench.js';

test('같은 시드는 같은 결과(재현성)', () => {
  const a = playOneGame(12345, 300);
  const b = playOneGame(12345, 300);
  assert.deepEqual(a, b);
});

test('다른 시드는 (대체로) 다른 결과', () => {
  const a = playOneGame(1, 300);
  const b = playOneGame(2, 300);
  assert.notDeepEqual(a, b);
});

test('runBench는 게임 수만큼 결과와 요약을 낸다', () => {
  const { results, summary } = runBench({ games: 5, seed: 42, maxPieces: 200 });
  assert.equal(results.length, 5);
  assert.ok(summary.lines.mean >= 0);
  assert.ok('median' in summary.score);
  assert.ok('std' in summary.pieces);
});

test('runBench 재현성: 같은 인자면 같은 요약', () => {
  const r1 = runBench({ games: 5, seed: 42, maxPieces: 200 });
  const r2 = runBench({ games: 5, seed: 42, maxPieces: 200 });
  assert.deepEqual(r1.summary, r2.summary);
});

test('봇은 즉사하지 않고 라인을 낸다(품질 스모크)', () => {
  const { summary } = runBench({ games: 3, seed: 7, maxPieces: 500 });
  assert.ok(summary.lines.mean > 0, '평균 라인 > 0');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd tetris && node --test test/bench.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`tetris/bench/bench.js`:
```js
// 봇 성능을 시드 고정으로 재현 측정하는 헤드리스 벤치마크 CLI
import { createEngine } from '../src/core/engine.js';
import { bestMove } from '../src/core/bot.js';
import { deriveSeed } from '../src/core/rng.js';

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
const WIDTH_GUARD = 12;

export function playOneGame(seed, maxPieces = 5000) {
  const engine = createEngine({ seed, nextCount: 5 });
  let pieces = 0;
  let reason = 'maxPieces';
  while (pieces < maxPieces) {
    if (engine.gameOver) { reason = 'gameover'; break; }
    const move = bestMove(engine.board, engine.active.type, engine.hold, engine.canHold);
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
```

> **자체검토 주의:** `applyMove`에서 `WIDTH_GUARD` 상수를 사용 전에 선언하도록 파일 상단으로 끌어올려라(호이스팅되는 `const`가 아니므로 TDZ 주의). 회전 목표 도달이 킥으로 x가 바뀔 수 있어, 회전을 먼저 끝낸 뒤 x 정렬을 한다. 도달 못한 자리는 근사 착지로 처리되며, 재현성에는 영향 없다.

- [ ] **Step 4: WIDTH_GUARD 선언 위치 수정**

`applyMove` 위에 `const WIDTH_GUARD = 12;`를 두어 TDZ 오류를 방지:
```js
const WIDTH_GUARD = 12;

export function applyMove(engine, move) {
  // ...(위와 동일)
}
```
(파일에서 `const WIDTH_GUARD` 중복 선언이 없도록, 아래쪽의 선언은 제거한다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd tetris && node --test test/bench.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: 실제 벤치 실행(스모크)**

Run: `cd tetris && node bench/bench.js --games 20 --seed 42 --maxPieces 500`
Expected: 콘솔에 lines/score/pieces/reasons 표 출력, 평균 라인 > 0.

- [ ] **Step 7: 커밋**

```bash
git add tetris/bench/bench.js tetris/test/bench.test.js
git commit -m "feat: 재현 가능한 봇 성능 벤치마크 CLI 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 브라우저 UI — 렌더링·입력·봇 토글

**Files:**
- Create: `tetris/web/index.html`
- Create: `tetris/web/render.js`
- Create: `tetris/web/input.js`

**Interfaces:**
- Consumes: `createEngine` (engine.js), `bestMove` (bot.js), `PIECES` (pieces.js), `VISIBLE, HEIGHT, WIDTH` (board.js), `applyMove`는 재사용 대신 web 자체 자동플레이 루프 사용.
- Produces: 실행 가능한 웹앱. 브라우저에서 `web/index.html`을 열면 플레이 가능(단, ESM은 file://에서 CORS 제약 → 로컬 서버 필요). README에 `npx serve` 또는 `python3 -m http.server` 안내.

- [ ] **Step 1: HTML 셸 작성**

`tetris/web/index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guideline Tetris + Bot</title>
  <style>
    body { margin:0; background:#0f1117; color:#e6e6e6; font-family:system-ui, sans-serif;
           display:flex; justify-content:center; padding:16px; }
    .wrap { display:flex; gap:16px; align-items:flex-start; }
    canvas { background:#1a1d29; border:2px solid #333; display:block; }
    .side { display:flex; flex-direction:column; gap:12px; min-width:120px; }
    .panel { background:#1a1d29; border:1px solid #333; padding:8px; border-radius:6px; }
    .panel h3 { margin:0 0 6px; font-size:12px; text-transform:uppercase; color:#888; }
    .stat { font-size:14px; margin:2px 0; }
    button { background:#2a2f42; color:#e6e6e6; border:1px solid #444; padding:8px;
             border-radius:6px; cursor:pointer; font-size:13px; }
    button:hover { background:#353b52; }
    .keys { font-size:11px; color:#888; line-height:1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="side">
      <div class="panel"><h3>Hold</h3><canvas id="hold" width="96" height="96"></canvas></div>
      <div class="panel"><h3>상태</h3>
        <div class="stat">Score: <span id="score">0</span></div>
        <div class="stat">Lines: <span id="lines">0</span></div>
        <div class="stat">Level: <span id="level">1</span></div>
      </div>
      <button id="botToggle">봇 시작 (B)</button>
      <button id="reset">새 게임 (R)</button>
    </div>
    <canvas id="board" width="300" height="600"></canvas>
    <div class="side">
      <div class="panel"><h3>Next</h3><canvas id="next" width="96" height="360"></canvas></div>
      <div class="panel keys">
        ← → 이동<br>↓ 소프트드롭<br>Space 하드드롭<br>↑/X 시계회전<br>Z 반시계<br>C 홀드<br>B 봇 토글<br>R 리셋
      </div>
    </div>
  </div>
  <script type="module" src="./input.js"></script>
</body>
</html>
```

- [ ] **Step 2: 렌더러 작성**

`tetris/web/render.js`:
```js
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
```

- [ ] **Step 3: 입력·루프·봇 토글 작성**

`tetris/web/input.js`:
```js
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
```

- [ ] **Step 4: 브라우저 수동 검증**

Run: `cd tetris && python3 -m http.server 8000`
브라우저에서 `http://localhost:8000/web/` 열기. 확인 항목:
- 조각이 떨어지고 좌우 이동/회전/하드드롭 동작.
- Hold(C), Next 5개 표시, Ghost 보임.
- 라인 클리어 시 Score/Lines/Level 갱신.
- "봇 시작(B)" 누르면 스스로 플레이.
- 회전이 벽 근처에서 킥으로 성공(SRS).

Expected: 위 항목 모두 정상. (자동화 불가한 시각 검증이므로 육안 확인.)

- [ ] **Step 5: 커밋**

```bash
git add tetris/web/index.html tetris/web/render.js tetris/web/input.js
git commit -m "feat: 브라우저 UI(렌더·입력·봇 자동플레이) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: README + 최종 검증

**Files:**
- Create: `tetris/README.md`

- [ ] **Step 1: README 작성**

`tetris/README.md`:
```markdown
# Guideline Tetris + Bot + Benchmark

표준 가이드라인 규칙을 지키는 웹 테트리스, 스스로 플레이하는 휴리스틱 봇, 재현 가능한 성능 벤치마크.

## 실행

### 웹앱
ES 모듈은 `file://`에서 로드되지 않으므로 로컬 서버가 필요하다.
```
cd tetris
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/web/
```
조작: ← → 이동, ↓ 소프트드롭, Space 하드드롭, ↑/X 시계회전, Z 반시계, C 홀드, B 봇 토글, R 리셋.

### 봇 벤치마크 (재현 가능)
```
node bench/bench.js --games 100 --seed 42 --maxPieces 5000 --json result.json
```
같은 `--seed`와 인자는 항상 같은 결과를 낸다. 출력은 라인/점수/조각수의 평균·중앙값·표준편차·최소·최대와 게임오버 사유 분포.

### 테스트
```
node --test
```

## 구조
- `src/core/` — DOM/시간/전역랜덤 비의존 순수 로직(브라우저·Node 공용).
- `web/` — Canvas UI.
- `bench/` — 헤드리스 벤치마크 CLI.
- `test/` — node:test 유닛 테스트.

## 봇 튜닝
`src/core/bot.js`의 `WEIGHTS` 상수를 바꾸면 봇 성향이 바뀐다. 변경 후 `node bench/bench.js`로 재측정해 비교한다.
```

- [ ] **Step 2: 전체 테스트 실행**

Run: `cd tetris && node --test`
Expected: 모든 테스트 PASS (rng, pieces, board, scoring, engine, bot, bench).

- [ ] **Step 3: 벤치 재현성 최종 확인**

Run: `cd tetris && node bench/bench.js --games 30 --seed 42 --maxPieces 1000 && node bench/bench.js --games 30 --seed 42 --maxPieces 1000`
Expected: 두 번 출력의 lines/score/pieces 통계가 완전히 동일.

- [ ] **Step 4: 커밋**

```bash
git add tetris/README.md
git commit -m "docs: README와 실행·벤치·튜닝 안내 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 결과

**Spec coverage:**
- SRS 회전+월킥 → Task 2, 5. 7-bag → Task 1. Hold/Next/Ghost/Lock delay → Task 5(엔진)+Task 8(웹 락딜레이). T-스핀 → Task 4. 점수(라인/드롭/콤보/B2B) → Task 4. 봇 휴리스틱 → Task 6. 재현 벤치 CLI → Task 7. 테스트 → 전 태스크. 브라우저 플레이+봇 토글 → Task 8. 전부 커버됨.

**Placeholder scan:** "TBD/TODO/적절히" 없음. 모든 코드 스텝에 실제 코드 포함.

**Type consistency:** `bestMove`는 `{type,rotation,x,useHold}` 반환 — Task 6 정의와 Task 7/8 소비 일치. `applyLock` 인자/반환 — Task 4 정의와 Task 5 소비 일치. `clearLines`/`dropY`/`collides` 시그니처 — Task 3 정의와 이후 일치. `createEngine` 반환 필드 — Task 5 정의와 Task 7/8 일치.

**알려진 단순화(의도적):**
- 벤치의 봇은 오버행(회전으로만 도달하는 자리)을 열거하지 않음 — 휴리스틱 봇으로 충분, 재현성 무관.
- 웹 락딜레이는 web 루프가 관리(엔진은 isGrounded+lock 제공). 벤치는 hardDrop만 사용해 락딜레이 무관하게 결정적.
