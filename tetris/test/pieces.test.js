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
