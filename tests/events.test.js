'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { reduce, mergeEventStreams, mergeLWW, compare } = require('../server/events');

const T = 'section:sc:v:sec';

test('事件归约：后发 uncheck 覆盖 check', () => {
  const s = reduce([
    { id: '1', target: T, type: 'check', ts: 1, deviceId: 'A' },
    { id: '2', target: T, type: 'uncheck', ts: 5, deviceId: 'A' },
  ]);
  assert.equal(s.get(T).done, false);
});

test('跨设备重复事件按 id 去重', () => {
  const shared = { id: 'dup1', target: T, type: 'check', ts: 2, deviceId: 'A' };
  const r = mergeEventStreams([
    { deviceId: 'A', events: [shared] },
    { deviceId: 'B', events: [shared, { id: 'b1', target: T, type: 'uncheck', ts: 5, deviceId: 'B', base: false }] },
  ]);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].reason, 'ALREADY_SEEN');
  assert.equal(r.events.length, 2);
  // 两台设备离线：A 已勾选（ts2），B 仍在“未勾选”基线上取消（ts5）——真实并发冲突，按时间决胜 uncheck 胜
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].resolution, 'LATEST_TS');
  assert.equal(r.state.get(T).done, false);
});

test('冗余（无状态变化）操作被标记但不影响结果', () => {
  const r = mergeEventStreams([
    { deviceId: 'A', events: [{ id: '1', target: T, type: 'check', ts: 1, deviceId: 'A' }] },
    { deviceId: 'B', events: [{ id: '2', target: T, type: 'check', ts: 2, deviceId: 'B', base: true }] },
  ]);
  assert.ok(r.redundant.some((x) => x.eventId === '2'));
  assert.equal(r.state.get(T).done, true);
});

test('LWW：后修改文档整体覆盖，静默丢失意图', () => {
  const r = mergeLWW([
    { deviceId: 'A', modifiedAt: 10, doc: { [T]: { done: false, ts: 9 } } },
    { deviceId: 'B', modifiedAt: 8, doc: { [T]: { done: true, ts: 5 } } },
  ]);
  assert.equal(r.state.get(T).done, false);
  assert.equal(r.overwritten.length, 1); // LWW 不报告“冲突”，只覆盖
});

test('compare：事件合并保留历史并报冲突；LWW 仅最终值且静默覆盖', () => {
  const inputs = [
    { deviceId: 'A', lastSyncAt: 0, events: [
      { id: 'a1', target: T, type: 'check', ts: 2, deviceId: 'A', base: false }] },
    { deviceId: 'B', lastSyncAt: 0, events: [
      { id: 'b1', target: T, type: 'uncheck', ts: 5, deviceId: 'B', base: false }] },
  ];
  const r = compare(inputs);
  assert.equal(r.eventSourced.conflicts.length, 1);
  assert.equal(r.lastWriteWins.conflictsDetected, 0);
  assert.equal(r.eventSourced.state[T].done, false);
  assert.equal(r.lastWriteWins.state[T].done, false);
  assert.ok(r.conclusion.includes('冲突'));
});

test('compare 能揭示差异：LWW 文档时间戳与操作历史脱钩时给出相反结果', () => {
  // 事件真相：A 在 ts10 重新勾选（有效操作）。
  // LWW 文档：B 保存文档时 modifiedAt 更晚且单元格 ts=20（文档时钟与操作历史脱钩），
  // 于是 LWW 判 false，事件合并依事件时间判 true，并保留全部历史。
  const inputs = [
    { deviceId: 'A', lastSyncAt: 0, events: [
      { id: 'a1', target: T, type: 'check', ts: 2, deviceId: 'A', base: false },
      { id: 'a2', target: T, type: 'check', ts: 10, deviceId: 'A', base: false }] },
    { deviceId: 'B', lastSyncAt: 0, events: [
      { id: 'a1', target: T, type: 'check', ts: 2, deviceId: 'A' },
      { id: 'b1', target: T, type: 'uncheck', ts: 5, deviceId: 'B', base: true }],
      doc: { [T]: { done: false, ts: 20 } }, modifiedAt: 20 },
  ];
  const r = compare(inputs);
  const d = r.differences.find((x) => x.target === T);
  assert.ok(d, '应报告两种策略结果不同');
  assert.equal(d.eventSourced, true);
  assert.equal(d.lastWriteWins, false);
});
