'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { checkPrerequisite, dependencyGaps, levels } = require('../server/graph');

test('直接自环被拒绝', () => {
  const r = checkPrerequisite([], 'n1', 'n1');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'SELF_LOOP');
});

test('重复边被拒绝', () => {
  const r = checkPrerequisite([['n2', 'n1']], 'n2', 'n1');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'DUPLICATE_EDGE');
});

test('会形成循环的先修被拒绝并给出闭环路径', () => {
  // 添加前为无环链 n2 先修 n1、n3 先修 n2；再让 n1 先修 n3，则 n3→n2→n1→n3 成环
  const edges = [['n2', 'n1'], ['n3', 'n2']];
  const r = checkPrerequisite(edges, 'n1', 'n3');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'CYCLE');
  assert.ok(r.path[0] === 'n1' && r.path[r.path.length - 1] === 'n1');
  // n1 增加先修 n3 时，n3 已可经 n2 到达 n1，闭环路径包含 n2 与 n3
  assert.ok(r.path.includes('n2') && r.path.includes('n3'));
});

test('合法先修允许（共享节点）', () => {
  // n8 与 n9 都依赖 n5：共享节点不产生循环
  const edges = [['n8', 'n5'], ['n9', 'n5']];
  assert.equal(checkPrerequisite(edges, 'n10', 'n5').ok, true);
});

test('层级计算体现共享先修', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const edges = [['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'c']];
  const lv = levels(nodes, edges);
  assert.equal(lv.get('a'), 0);
  assert.equal(lv.get('b'), 1);
  assert.equal(lv.get('d'), 2);
});

test('依赖缺项：悬挂边 + 未满足先修', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }];
  const edges = [['b', 'a'], ['b', 'ghost']];
  const g = dependencyGaps(nodes, edges, new Set());
  assert.equal(g.dangling.length, 1);
  assert.deepEqual(g.dangling[0], ['b', 'ghost']);
  assert.deepEqual(g.unsatisfied.find((x) => x.nodeId === 'b').missing, ['a']);
  // a 完成后不再有未满足
  const g2 = dependencyGaps(nodes, edges, new Set(['a']));
  assert.equal(g2.unsatisfied.length, 0);
});
