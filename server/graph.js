'use strict';
// 学习路线 = 有向图（节点可被多条路径共享）。边 nodeId -> prereqId 表示“先修”。
// 新增先修关系必须做循环检测。

/** 深度优先可达性：from 是否能到达 target（含直接边） */
function reaches(edges, from, target) {
  const adj = Object.create(null);
  for (const [a, b] of edges) (adj[a] ||= []).push(b);
  const seen = new Set();
  const stack = [...(adj[from] || [])];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj[cur] || []) stack.push(n);
  }
  return false;
}

/**
 * 校验“给 nodeId 增加 prereqId”是否会制造循环。
 * 循环条件：该边已存在；或 prereqId 经现有路径可达 nodeId（即下游指向上游）。
 */
function checkPrerequisite(edges, nodeId, prereqId) {
  if (nodeId === prereqId) {
    return { ok: false, reason: 'SELF_LOOP', path: [nodeId, prereqId] };
  }
  if (edges.some(([a, b]) => a === nodeId && b === prereqId)) {
    return { ok: false, reason: 'DUPLICATE_EDGE', path: [nodeId, prereqId] };
  }
  if (reaches(edges, prereqId, nodeId)) {
    const path = findPath(edges, prereqId, nodeId);
    return { ok: false, reason: 'CYCLE', path: [nodeId, ...path] };
  }
  return { ok: true };
}

/** BFS 找一条 from -> target 的路径 */
function findPath(edges, from, target) {
  const adj = Object.create(null);
  for (const [a, b] of edges) (adj[a] ||= []).push(b);
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const n of adj[cur] || []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === target) {
        const path = [n];
        let p = cur;
        while (p !== null) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      q.push(n);
    }
  }
  return [from, target];
}

/** Kahn 拓扑排序；返回 {order} 或 {cycle:[...]} */
function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    if (!indeg.has(a) || !indeg.has(b)) continue; // 缺项边在别处报告
    adj.get(a).push(b); // a 依赖 b，b 必须先完成
    indeg.set(a, (indeg.get(a) || 0) + 1);
  }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    // 边方向 id(前置) -> 依赖它的节点：重新按“前置->后继”组织
  }
  // 上面按 node->prereq 存邻接，为排序改为反向
  const rev = new Map(nodes.map((n) => [n.id, []]));
  const indeg2 = new Map(nodes.map((n) => [n.id, 0]));
  for (const [a, b] of edges) {
    if (!rev.has(a) || !rev.has(b)) continue;
    rev.get(b).push(a); // b 先修，完成后解锁 a
    indeg2.set(a, (indeg2.get(a) || 0) + 1);
  }
  const q2 = nodes.filter((n) => indeg2.get(n.id) === 0).map((n) => n.id);
  order.length = 0;
  while (q2.length) {
    const id = q2.shift();
    order.push(id);
    for (const d of rev.get(id)) {
      indeg2.set(d, indeg2.get(d) - 1);
      if (indeg2.get(d) === 0) q2.push(d);
    }
  }
  if (order.length < nodes.length) {
    const cyc = nodes.map((n) => n.id).filter((id) => !order.includes(id));
    return { cycle: cyc };
  }
  return { order };
}

/**
 * 学习路线层级（共享节点只算一次）：level(n)=0 无先修，否则 1+max(level(prereq))
 */
function levels(nodes, edges) {
  const pre = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) if (pre.has(a)) pre.get(a).push(b);
  const cache = new Map();
  const visiting = new Set();
  function lv(id) {
    if (cache.has(id)) return cache.get(id);
    if (visiting.has(id)) throw new Error('CYCLE');
    visiting.add(id);
    const ps = pre.get(id) || [];
    const v = ps.length ? 1 + Math.max(...ps.map(lv)) : 0;
    visiting.delete(id);
    cache.set(id, v);
    return v;
  }
  const out = new Map();
  for (const n of nodes) out.set(n.id, lv(n.id));
  return out;
}

/**
 * 依赖缺项检查：
 * 1. dangling —— 边引用了不存在的节点
 * 2. unsatisfiedPrereqs(nodeId) —— 给定“已完成集合”，返回尚未完成的先修节点
 */
function dependencyGaps(nodes, edges, completed = new Set()) {
  const ids = new Set(nodes.map((n) => n.id));
  const dangling = [];
  const pre = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) {
    if (!ids.has(a) || !ids.has(b)) {
      dangling.push([a, b]);
      continue;
    }
    pre.get(a).push(b);
  }
  const unsatisfied = [];
  for (const n of nodes) {
    const missing = pre.get(n.id).filter((p) => !completed.has(p));
    if (missing.length) unsatisfied.push({ nodeId: n.id, missing });
  }
  return { dangling, unsatisfied };
}

module.exports = { checkPrerequisite, reaches, findPath, topoSort, levels, dependencyGaps };
