'use strict';
// 跨设备学习记录：事件溯源（Event-sourced）与 最后修改覆盖（LWW）两种策略。
// 事件不可变；完成状态由事件按时间归约得到。换版不删除旧事件。

/**
 * 事件结构:
 * { id, target, type:'check'|'uncheck', ts, deviceId, base?:boolean }
 * target 形如 'section:<scoreId>:<versionId>:<sectionId>' 或 'node:<nodeId>'
 * base = 客户端发起该操作时观察到的完成态（用于离线并发冲突检测）
 */

function byTime(a, b) {
  return a.ts - b.ts ||
    String(a.deviceId).localeCompare(String(b.deviceId)) ||
    String(a.id).localeCompare(String(b.id));
}

/** 归约：事件 -> 每个 target 的当前状态 */
function reduce(events) {
  const state = new Map();
  for (const e of [...events].sort(byTime)) {
    const prev = state.get(e.target);
    const done = e.type === 'check';
    state.set(e.target, { done, ts: e.ts, eventId: e.id, deviceId: e.deviceId });
  }
  return state;
}

/**
 * 合并多个（可能离线的）事件流。
 * streams: [{ deviceId, events:[...], lastSyncAt:number }]
 * 返回去重结果、冲突列表与最终状态。
 */
function mergeEventStreams(streams) {
  const seen = new Map();      // eventId -> event
  const duplicates = [];
  for (const s of streams) {
    for (const e of s.events) {
      if (seen.has(e.id)) {
        const first = seen.get(e.id);
        if (first.deviceId !== e.deviceId || first.type !== e.type || first.target !== e.target) {
          duplicates.push({ eventId: e.id, reason: 'ID_COLLISION', kept: first.id, dropped: e });
        } else {
          duplicates.push({ eventId: e.id, reason: 'ALREADY_SEEN' });
        }
        continue;
      }
      seen.set(e.id, { ...e });
    }
  }
  const all = [...seen.values()].sort(byTime);

  // 按 target 检测：冗余操作、离线并发冲突
  const conflicts = [];
  const redundant = [];
  const byTarget = new Map();
  for (const e of all) {
    const list = byTarget.get(e.target) || [];
    list.push(e);
    byTarget.set(e.target, list);
  }
  for (const [target, list] of byTarget) {
    let current; // 服务端已同步基线视角
    for (const e of list) {
      const done = e.type === 'check';
      if (current !== undefined) {
        if (current.done === done) {
          redundant.push({ eventId: e.id, target, reason: 'NO_STATE_CHANGE' });
        } else if (e.base !== undefined && e.base !== current.done &&
                   current.deviceId !== e.deviceId) {
          // 两台设备在不同基线上离线做出相反操作：真实冲突，不静默丢弃
          conflicts.push({
            target,
            winner: { eventId: e.id, deviceId: e.deviceId, ts: e.ts, type: e.type },
            loser: { eventId: current.eventId, deviceId: current.deviceId, ts: current.ts, type: current.done ? 'check' : 'uncheck' },
            resolution: 'LATEST_TS',
          });
        }
      }
      current = { done, ts: e.ts, eventId: e.id, deviceId: e.deviceId };
    }
  }

  return { events: all, state: reduce(all), duplicates, redundant, conflicts };
}

/**
 * LWW：各设备上传“完整文档 + 最后修改时间”，同一 target 时间戳大者整体覆盖。
 * documents: [{ deviceId, modifiedAt, doc:{ target:{done,ts} } }]
 */
function mergeLWW(documents) {
  const winners = new Map(); // target -> entry
  const overwritten = [];
  for (const d of [...documents].sort((a, b) => a.modifiedAt - b.modifiedAt)) {
    for (const [target, cell] of Object.entries(d.doc || {})) {
      const cur = winners.get(target);
      if (!cur || cell.ts > cur.ts ||
          (cell.ts === cur.ts && String(d.deviceId) > String(cur.deviceId))) {
        if (cur && cur.done !== cell.done) {
          overwritten.push({ target, from: { deviceId: cur.deviceId, done: cur.done, ts: cur.ts },
                             to: { deviceId: d.deviceId, done: cell.done, ts: cell.ts } });
        }
        winners.set(target, { ...cell, deviceId: d.deviceId });
      }
    }
  }
  return { state: winners, overwritten };
}

/**
 * 两种策略对比：同一组离线设备输入分别走事件合并与 LWW。
 * inputs: [{ deviceId, lastSyncAt, events, doc, modifiedAt }]
 */
function compare(strategyInputs) {
  const ev = mergeEventStreams(strategyInputs.map((i) => ({
    deviceId: i.deviceId, lastSyncAt: i.lastSyncAt, events: i.events || [],
  })));
  const lww = mergeLWW(strategyInputs.map((i) => ({
    deviceId: i.deviceId, modifiedAt: i.modifiedAt ?? Math.max(0, ...(i.events || []).map((e) => e.ts)),
    doc: i.doc || docFromEvents(i.events || []),
  })));

  const differences = [];
  const targets = new Set([...ev.state.keys(), ...lww.state.keys()]);
  for (const t of targets) {
    const a = ev.state.get(t);
    const b = lww.state.get(t);
    if (!a || !b || a.done !== b.done) {
      differences.push({
        target: t,
        eventSourced: a ? a.done : null,
        lastWriteWins: b ? b.done : null,
        note: !a ? '事件流无记录，LWW 文档携带了该键'
          : !b ? 'LWW 文档缺少该键，事件流保留了操作'
          : '两种策略对同一离线并发给出不同结果',
      });
    }
  }
  return {
    eventSourced: {
      state: stateToObject(ev.state),
      conflicts: ev.conflicts,
      duplicates: ev.duplicates,
      redundant: ev.redundant,
      eventCount: ev.events.length,
    },
    lastWriteWins: {
      state: stateToObject(lww.state),
      overwritten: lww.overwritten,
      conflictsDetected: 0, // LWW 不产生冲突，只有静默覆盖
    },
    differences,
    conclusion: ev.conflicts.length
      ? `事件合并显式报出 ${ev.conflicts.length} 处离线冲突；LWW 静默覆盖 ${lww.overwritten.length} 处，不保留对方意图。`
      : `本场景两策略结果一致；事件合并保留完整历史（${ev.events.length} 条，去重 ${ev.duplicates.length} 条，冗余折叠 ${ev.redundant.length} 条），LWW 仅存最终值。`,
  };
}

function docFromEvents(events) {
  const doc = {};
  for (const e of [...events].sort(byTime)) doc[e.target] = { done: e.type === 'check', ts: e.ts };
  return doc;
}

function stateToObject(state) {
  const o = {};
  for (const [k, v] of state) o[k] = v;
  return o;
}

module.exports = { reduce, mergeEventStreams, mergeLWW, compare };
