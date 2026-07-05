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
