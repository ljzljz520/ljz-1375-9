'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { evaluateMigration } = require('../server/migration');

const oldV = {
  id: 'old',
  sections: [
    { id: 'ls-a' }, { id: 'ls-b' }, { id: 'ls-c' }, { id: 'ls-d' },
  ],
};
const newV = {
  id: 'new',
  sections: [
    { id: 'ls2-a' }, { id: 'ls2-b1' }, { id: 'ls2-b2' }, { id: 'ls2-c' }, { id: 'ls2-d' },
  ],
};
const mapping = [
  { from: 'ls-a', to: 'ls2-a', kind: 'same' },
  { from: 'ls-b', to: 'ls2-b1', kind: 'split' },
  { from: 'ls-b', to: 'ls2-b2', kind: 'split' },
  { from: 'ls-c', to: 'ls2-c', kind: 'same' },
  { from: 'ls-d', to: 'ls2-d', kind: 'same' },
];

test('谱段拆分：完成旧段后两个新段都满足', () => {
  const r = evaluateMigration(oldV, newV, mapping, new Set(['ls-a', 'ls-b', 'ls-c', 'ls-d']));
  assert.equal(r.status, 'satisfied');
  assert.equal(r.counts.satisfied, 5);
});

test('旧记录保留但不简单继承：只完成部分旧段 -> partial', () => {
  const r = evaluateMigration(oldV, newV, mapping, new Set(['ls-a', 'ls-b']));
  assert.equal(r.status, 'partial');
  const b1 = r.perSection.find((p) => p.sectionId === 'ls2-b1');
  const b2 = r.perSection.find((p) => p.sectionId === 'ls2-b2');
  const c = r.perSection.find((p) => p.sectionId === 'ls2-c');
  assert.equal(b1.status, 'satisfied');
  assert.equal(b2.status, 'satisfied');
  assert.equal(c.status, 'unsatisfied');
});

test('无任何旧完成 -> 全部 unsatisfied（不清空也不继承）', () => {
  const r = evaluateMigration(oldV, newV, mapping, new Set());
  assert.equal(r.status, 'unsatisfied');
  assert.ok(r.perSection.every((p) => p.status === 'unsatisfied'));
});

test('merge 映射：多个旧段只完成一部分 -> 新段 partial', () => {
  const oldV2 = { id: 'o2', sections: [{ id: 'x1' }, { id: 'x2' }] };
  const newV2 = { id: 'n2', sections: [{ id: 'y' }] };
  const map2 = [{ from: 'x1', to: 'y', kind: 'merge' }, { from: 'x2', to: 'y', kind: 'merge' }];
  const partial = evaluateMigration(oldV2, newV2, map2, new Set(['x1']));
  assert.equal(partial.perSection[0].status, 'partial');
  const full = evaluateMigration(oldV2, newV2, map2, new Set(['x1', 'x2']));
  assert.equal(full.perSection[0].status, 'satisfied');
});

test('新版新增无映射段落 -> 标记 new，整体不为 satisfied', () => {
  const oldV3 = { id: 'o3', sections: [{ id: 'x' }] };
  const newV3 = { id: 'n3', sections: [{ id: 'y' }, { id: 'z' }] };
  const r = evaluateMigration(oldV3, newV3, [{ from: 'x', to: 'y', kind: 'same' }], new Set(['x']));
  assert.equal(r.status, 'partial');
  assert.equal(r.perSection.find((p) => p.sectionId === 'z').status, 'new');
  assert.ok(r.unmappedOldSections.length === 0);
});
