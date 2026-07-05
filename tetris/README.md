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
