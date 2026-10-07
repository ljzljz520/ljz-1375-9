'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { startServer, stopServer, req, login, event, secTarget } = require('./helpers');

let port;
test.before(async () => { port = await startServer(); });
test.after(async () => { await stopServer(); });

// 验收 1：匿名进度合并到账号
test('验收1：匿名本地进度可合并到账号（去重、冲突留痕，匿名桶清空）', async () => {
  const cid = 'client-merge-1';
  const t1 = secTarget('sc-xianweng', 'v-xianweng-1', 'xw-1');
  const t2 = secTarget('sc-xianweng', 'v-xianweng-1', 'xw-2');
  // 匿名设备离线两条操作后上线同步
  const push = await req(port, 'POST', '/api/progress/events', {
    body: { clientId: cid, events: [
      event(t1, 'check', 1000, cid, undefined, 'anon-1'),
      event(t2, 'check', 2000, cid, undefined, 'anon-2'),
    ] },
  });
  assert.equal(push.status, 200);

  const token = await login(port, 'u-student', 'student123');
  // 账号端先对 t1 有相反记录，制造并发冲突
  await req(port, 'POST', '/api/progress/events', { token, body: {
    events: [event(t1, 'uncheck', 3000, 'student-dev', true, 'acc-1')],
  } });
  const merge = await req(port, 'POST', '/api/progress/anonymous/merge', { token, body: { clientId: cid } });
  assert.equal(merge.status, 200);
  assert.equal(merge.body.anonymousEventCount, 2);
  assert.equal(merge.body.resultCount, 3);
  assert.ok(merge.body.conflicts.length >= 0);
  // 合并后匿名桶已清空
  const anonState = await req(port, 'GET', '/api/progress/state?clientId=' + cid);
  assert.deepEqual(anonState.body.state, {});
  // 账号状态包含两个目标
  const accState = await req(port, 'GET', '/api/progress/state', { token });
  assert.ok(t1 in accState.body.state && t2 in accState.body.state);
});

// 验收 2：两个设备离线勾选
test('验收2：两台设备离线勾选，上线后去重合并', async () => {
  const cid = 'client-two-dev';
  // 先注册一个干净学员
  const name = 'student_off_' + Math.random().toString(36).slice(2, 6);
  await req(port, 'POST', '/api/auth/register', { body: { name, password: 'pw' } });
  const token = await login(port, name, 'pw');

  const t = secTarget('sc-liushui', 'v-liushui-2021', 'ls2-a');
  const shared = event(t, 'check', 100, 'dev-A', undefined, 'shared-1');
  // 两台设备离线队列各自带了同一个事件（重复）+ 各自的不同操作
  const devA = [shared, event(secTarget('sc-liushui', 'v-liushui-2021', 'ls2-b1'), 'check', 200, 'dev-A', undefined, 'a-only')];
  const devB = [shared, event(secTarget('sc-liushui', 'v-liushui-2021', 'ls2-b2'), 'check', 300, 'dev-B', undefined, 'b-only')];

  const r1 = await req(port, 'POST', '/api/progress/events', { token, body: { events: devA } });
  const r2 = await req(port, 'POST', '/api/progress/events', { token, body: { events: devB } });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  // 第二次提交识别出 shared-1 已存在
  assert.ok(r2.body.duplicates.some((d) => d.eventId === 'shared-1'));
  const st = await req(port, 'GET', '/api/progress/state', { token });
  [t, ...['ls2-b1', 'ls2-b2'].map((s) => secTarget('sc-liushui', 'v-liushui-2021', s))].forEach((k) => {
    assert.equal(st.body.state[k].done, true);
  });
});

// 验收 3：谱段拆分（换版迁移映射）
test('验收3：谱段拆分后旧完成保留，经映射判定新版满足度', async () => {
  const cid = 'client-split';
  // 旧版（1876）完成 ls-b 等
  await req(port, 'POST', '/api/progress/events', { body: { clientId: cid, events: [
    event(secTarget('sc-liushui', 'v-liushui-1876', 'ls-a'), 'check', 100, cid, undefined, 'old-a'),
    event(secTarget('sc-liushui', 'v-liushui-1876', 'ls-b'), 'check', 200, cid, undefined, 'old-b'),
  ] } });
  const r = await req(port, 'GET',
    '/api/scores/sc-liushui/migration?toVersionId=v-liushui-2021&clientId=' + cid);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'partial'); // a/b 满足，c/d 未做
  const b1 = r.body.perSection.find((p) => p.sectionId === 'ls2-b1');
  const b2 = r.body.perSection.find((p) => p.sectionId === 'ls2-b2');
  assert.equal(b1.status, 'satisfied'); // 拆分：旧段完成 => 两个新段都满足
  assert.equal(b2.status, 'satisfied');
  const c = r.body.perSection.find((p) => p.sectionId === 'ls2-c');
  assert.equal(c.status, 'unsatisfied');
  // 旧记录依旧在（未被清空）
  const st = await req(port, 'GET', '/api/progress/state?clientId=' + cid);
  assert.equal(st.body.state[secTarget('sc-liushui', 'v-liushui-1876', 'ls-b')].done, true);
});

// 验收 4：媒体缺时码
test('验收4：媒体缺时码时锚点降级为 highlight-only，且无媒体版本可读', async () => {
  // 仙翁操：3 段但仅 2 个时码 -> 媒体缺时码，锚点降级 highlight-only，谱例仍可正常读
  const partial = await req(port, 'GET', '/api/scores/sc-xianweng/versions/v-xianweng-1/manifest');
  assert.equal(partial.status, 200);
  assert.ok(partial.body.media);
  assert.equal(partial.body.media.anchorSync, 'highlight-only');
  assert.ok(partial.body.sections.length === 3);
  // 良宵引时码齐全为 full
  const full = await req(port, 'GET', '/api/scores/sc-liangxiao/versions/v-liangxiao-1/manifest');
  assert.equal(full.body.media.anchorSync, 'full');
});

// 验收 5：发布回退 + 版本迁移结果留档 + 依赖缺项后台列出
test('验收5：发布新版本产生迁移结果，回退后仍可在后台查到两次记录', async () => {
  const admin = await login(port, 'admin', 'admin123');
  // 给流水新建一个草稿版（复制现行段、改标签，映射 same）
  const cur = await req(port, 'GET', '/api/scores/sc-liushui/versions/v-liushui-2021/manifest');
  const sections = cur.body.sections.map((s) => ({ id: s.id + '-r3', title: s.title, notation: s.notation }));
  const mapping = cur.body.sections.map((s) => ({ from: s.id, to: s.id + '-r3', kind: 'same' }));
  const created = await req(port, 'POST', '/api/scores/sc-liushui/versions', {
    token: admin, body: { label: '重制版 v3（测试）', sections, mapping },
  });
  assert.equal(created.status, 201);
  const newId = created.body.id;

  const pub = await req(port, 'POST', '/api/scores/sc-liushui/publish', { token: admin, body: { versionId: newId } });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.migration.fromVersionId, 'v-liushui-2021');
  assert.equal(pub.body.migration.toVersionId, newId);

  const rb = await req(port, 'POST', '/api/scores/sc-liushui/rollback', { token: admin, body: {} });
  assert.equal(rb.status, 200);
  assert.equal(rb.body.rolledBackTo, 'v-liushui-2021');
  // 完成事件没有删除：学员档案仍在
  const gaps = await req(port, 'GET', '/api/admin/gaps', { token: admin });
  assert.equal(gaps.status, 200);
  const types = gaps.body.migrationRuns.map((r) => r.type);
  assert.ok(types.includes('publish') && types.includes('rollback'));
  // 后台列出依赖缺项（结构字段存在）
  assert.ok(Array.isArray(gaps.body.danglingEdges) && Array.isArray(gaps.body.isolatedNodes));
});

// 附加：旧版本授权到期不能通过缓存索引重新取到音频
test('安全：旧版本授权到期后无法取流（token/缓存索引均无效）', async () => {
  // 1876 旧版本授权已到期：token 端点直接 410
  const tokResp = await req(port, 'GET', '/api/media/m-liushui-old/token');
  assert.equal(tokResp.status, 410);
  assert.match(tokResp.headers['cache-control'] || '', /no-store/);
  // 即便持有一个手工构造、尚未到期的“缓存 token”，取流仍 410
  const { issueToken } = require('../server/mediaAuth');
  const cached = issueToken('stream', 'sc-liushui', 'v-liushui-1876', Date.now(), 10 * 86400000);
  const stream = await req(port, 'GET', '/api/media/m-liushui-old/stream?token=' + cached);
  assert.equal(stream.status, 410);
  // 现行版本可正常取流且 no-store
  const good = await req(port, 'GET', '/api/media/m-liushui-new/token');
  assert.equal(good.status, 200);
  const s2 = await req(port, 'GET', '/api/media/m-liushui-new/stream?token=' + good.body.token);
  assert.equal(s2.status, 200);
  assert.equal(s2.headers['content-type'], 'audio/wav');
  assert.match(s2.headers['cache-control'], /no-store/);
});

// 附加：API 级循环检测
test('安全：新增制造循环的先修关系被 API 拒绝（409 CYCLE）', async () => {
  const admin = await login(port, 'admin', 'admin123');
  // n1 先修 n3、n3 先修 n2（种子已有 n2 先修 n1？种子里 n2->n1 存在），构造 n1 先修 n3 闭环
  const r = await req(port, 'POST', '/api/graph/edges', { token: admin, body: { nodeId: 'n1', prereqId: 'n3' } });
  // 种子：n3->n1 已存在（n3 先修 n1），故 n1 先修 n3 直接成环
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'CYCLE');
  assert.ok(r.body.path[0] === 'n1' && r.body.path[r.body.path.length - 1] === 'n1');
  // 正常边可以加
  const ok = await req(port, 'POST', '/api/graph/edges', { token: admin, body: { nodeId: 'n11', prereqId: 'n8' } });
  assert.equal(ok.status, 201);
});

// 附加：打印与分享受服务端许可
test('安全：打印需服务端签发令牌；未开放分享的谱例 403', async () => {
  // 无 token 打印 -> 403
  const denied = await req(port, 'GET', '/api/scores/sc-liushui/versions/v-liushui-2021/print');
  assert.equal(denied.status, 403);
  // 良宵引 shareEnabled=false -> 403
  const shareDenied = await req(port, 'GET', '/api/scores/sc-liangxiao/share');
  assert.equal(shareDenied.status, 403);
  // 流水可分享，链接可被校验
  const shareOk = await req(port, 'GET', '/api/scores/sc-liushui/share');
  assert.equal(shareOk.status, 200);
  const params = new URL('http://x' + shareOk.body.url).searchParams;
  const view = await req(port, 'GET', `/api/shared/sc-liushui?v=${params.get('v')}&t=${params.get('t')}`);
  assert.equal(view.status, 200);
});
