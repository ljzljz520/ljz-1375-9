'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { load, save, flush } = require('./db');
const graph = require('./graph');
const { evaluateMigration } = require('./migration');
const ev = require('./events');
const { issueToken, authorizeStream, verify } = require('./mediaAuth');
const { generateWav } = require('./audio');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const db = () => load();

// ---------- 工具 ----------
function findScore(id) {
  return db().scores.find((s) => s.id === id);
}
function findVersion(score, vid) {
  return score.versions.find((v) => v.id === vid);
}
function currentVersion(score) {
  return score.versions.find((v) => v.current && v.published);
}
function licenseOk(v, now = Date.now()) {
  return v.license && Number.isFinite(v.license.validUntil) && v.license.validUntil > now;
}
function principalKey(req, clientId) {
  return req.user ? req.user.id : `anon:${clientId || 'default'}`;
}
function eventsOf(key) {
  return db().events[key] || [];
}
// 某档案在指定版本上直接完成的段落（旧事件保留，按 versionId 取）
function completedSections(key, versionId) {
  const state = ev.reduce(eventsOf(key));
  const done = new Set();
  const prefix = `section:`;
  for (const [target, cell] of state) {
    if (!cell.done || !target.startsWith(prefix)) continue;
    const parts = target.split(':'); // section:scoreId:versionId:sectionId
    if (parts[2] === versionId) done.add(parts.slice(3).join(':'));
  }
  return done;
}

/**
 * 沿已发布版本链，把档案在更老版本上的完成逐级映射到 toVersion。
 * 直接在该版本完成的段落也并入；任何一级出现 partial（merge 只完成部分）则不映射该目标。
 * 这样“发布新版本”时，只在更早版本有记录的档案也能被正确评估，而不是被漏掉或当作全继承。
 */
function chainedCompleted(key, score, toVersion) {
  const chain = score.versions
    .filter((x) => x.published && x.createdAt <= toVersion.createdAt)
    .sort((a, b) => a.createdAt - b.createdAt);
  const startIdx = chain.findIndex((x) => x.id === toVersion.id);
  const chainUpTo = chain.slice(0, startIdx + 1);

  // 找该档案有任何完成记录的最早版本作为起点
  let done = new Set();
  let firstWithData = -1;
  for (let i = 0; i < chainUpTo.length; i++) {
    const direct = completedSections(key, chainUpTo[i].id);
    if (direct.size) { firstWithData = i; done = new Set(direct); break; }
  }
  if (firstWithData === -1) return new Set();
  for (let i = firstWithData; i < chainUpTo.length - 1; i++) {
    const from = chainUpTo[i];
    const next = chainUpTo[i + 1];
    done = propagateMapping(from, next, next.mappingFromPrevious || [], done);
    for (const id of completedSections(key, next.id)) done.add(id); // 档案已在新版直接完成的段落并入
  }
  return done;
}

// 依据映射把“旧完成集合”传播为“新满足集合”：same/split 直接满足；merge 需全部源段完成
function propagateMapping(oldVersion, newVersion, mapping, completedOld) {
  const out = new Set();
  const sourcesByTarget = new Map(newVersion.sections.map((s) => [s.id, []]));
  for (const m of mapping) {
    if (!oldVersion.sections.some((s) => s.id === m.from)) continue;
    if (!sourcesByTarget.has(m.to)) continue;
    sourcesByTarget.get(m.to).push(m.from);
  }
  for (const [target, srcs] of sourcesByTarget) {
    if (srcs.length && srcs.every((id) => completedOld.has(id))) out.add(target);
  }
  return out;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const session = token && db().sessions[token];
  if (session) req.user = db().users.find((u) => u.id === session.userId);
  next();
}
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
  next();
}
app.use(auth);

// ---------- 认证 ----------
app.post('/api/auth/register', (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'NAME_AND_PASSWORD_REQUIRED' });
  if (db().users.some((u) => u.name === name)) return res.status(409).json({ error: 'NAME_TAKEN' });
  const user = { id: 'u-' + crypto.randomBytes(5).toString('hex'), name, pass: password, role: 'user' };
  db().users.push(user);
  save();
  res.json({ id: user.id, name: user.name, role: user.role });
});
app.post('/api/auth/login', (req, res) => {
  const { name, password } = req.body || {};
  const user = db().users.find((u) => u.name === name && u.pass === password);
  if (!user) return res.status(401).json({ error: 'BAD_CREDENTIALS' });
  const token = crypto.randomBytes(24).toString('hex');
  db().sessions[token] = { userId: user.id, createdAt: Date.now() };
  save();
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});
app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role });
});

// ---------- 内容：琴史 / 流派 ----------
app.get('/api/history', (_req, res) => res.json(db().history));
app.get('/api/schools', (_req, res) => res.json(db().schools));

// ---------- 术语 / 来源 管理 ----------
app.get('/api/terms', (_req, res) => res.json(db().terms));
app.post('/api/terms', requireAdmin, (req, res) => {
  const { term, pinyin, definition, sources } = req.body || {};
  if (!term || !definition) return res.status(400).json({ error: 'TERM_AND_DEFINITION_REQUIRED' });
  const t = { id: 't-' + crypto.randomBytes(4).toString('hex'), term, pinyin: pinyin || '', definition, sources: sources || [] };
  db().terms.push(t); save();
  res.status(201).json(t);
});
app.put('/api/terms/:id', requireAdmin, (req, res) => {
  const t = db().terms.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'NOT_FOUND' });
  Object.assign(t, {
    term: req.body.term ?? t.term,
    pinyin: req.body.pinyin ?? t.pinyin,
    definition: req.body.definition ?? t.definition,
    sources: req.body.sources ?? t.sources,
  });
  save(); res.json(t);
});
app.delete('/api/terms/:id', requireAdmin, (req, res) => {
  const d = db();
  d.terms = d.terms.filter((x) => x.id !== req.params.id);
  save(); res.status(204).end();
});
app.get('/api/sources', (_req, res) => res.json(db().sources));
app.post('/api/sources', requireAdmin, (req, res) => {
  const { title, author, year, publisher, kind } = req.body || {};
  if (!title) return res.status(400).json({ error: 'TITLE_REQUIRED' });
  const s = { id: 'src-' + crypto.randomBytes(4).toString('hex'), title, author: author || '', year: year || null, publisher: publisher || '', kind: kind || '其他' };
  db().sources.push(s); save();
  res.status(201).json(s);
});
app.put('/api/sources/:id', requireAdmin, (req, res) => {
  const s = db().sources.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  Object.assign(s, req.body);
  save(); res.json(s);
});
app.delete('/api/sources/:id', requireAdmin, (req, res) => {
  const d = db();
  d.sources = d.sources.filter((x) => x.id !== req.params.id);
  for (const t of d.terms) t.sources = (t.sources || []).filter((x) => x !== req.params.id);
  save(); res.status(204).end();
});

// ---------- 学习路线图（共享节点的依赖图） ----------
app.get('/api/graph', (req, res) => {
  const d = db();
  const key = principalKey(req, req.query.clientId);
  // 已完成节点
  const state = ev.reduce(eventsOf(key));
  const doneNodes = new Set();
  for (const [t, c] of state) if (c.done && t.startsWith('node:')) doneNodes.add(t.slice(5));
  let lv;
  try { lv = [...graph.levels(d.nodes, d.edges)].map(([id, level]) => ({ id, level })); }
  catch { lv = []; }
  const gaps = graph.dependencyGaps(d.nodes, d.edges, doneNodes);
  res.json({
    nodes: d.nodes,
    edges: d.edges.map(([nodeId, prereqId]) => ({ nodeId, prereqId })),
    levels: lv,
    completedNodes: [...doneNodes],
    danglingEdges: gaps.dangling,
    topo: graph.topoSort(d.nodes, d.edges),
  });
});
app.post('/api/graph/nodes', requireAdmin, (req, res) => {
  const { title, kind, desc, scoreId } = req.body || {};
  if (!title) return res.status(400).json({ error: 'TITLE_REQUIRED' });
  const node = { id: 'n-' + crypto.randomBytes(4).toString('hex'), title, kind: kind || 'theory', desc: desc || '', scoreId: scoreId || null };
  db().nodes.push(node); save();
  res.status(201).json(node);
});
// 新增先修关系：循环检测
app.post('/api/graph/edges', requireAdmin, (req, res) => {
  const { nodeId, prereqId } = req.body || {};
  const d = db();
  if (!nodeId || !prereqId) return res.status(400).json({ error: 'NODE_ID_AND_PREREQ_REQUIRED' });
  if (!d.nodes.some((n) => n.id === nodeId) || !d.nodes.some((n) => n.id === prereqId)) {
    return res.status(404).json({ error: 'NODE_NOT_FOUND' });
  }
  const check = graph.checkPrerequisite(d.edges, nodeId, prereqId);
  if (!check.ok) return res.status(409).json({ error: check.reason, path: check.path });
  d.edges.push([nodeId, prereqId]);
  save();
  res.status(201).json({ nodeId, prereqId });
});
app.delete('/api/graph/edges', requireAdmin, (req, res) => {
  const { nodeId, prereqId } = req.body || {};
  const d = db();
  const before = d.edges.length;
  d.edges = d.edges.filter(([a, b]) => !(a === nodeId && b === prereqId));
  if (d.edges.length === before) return res.status(404).json({ error: 'EDGE_NOT_FOUND' });
  save(); res.status(204).end();
});

// ---------- 谱例 ----------
app.get('/api/scores', (_req, res) => {
  res.json(db().scores.map((s) => ({
    id: s.id, title: s.title, school: s.school, attribution: s.attribution,
    shareEnabled: s.shareEnabled,
    currentVersion: currentVersion(s) && { id: currentVersion(s).id, label: currentVersion(s).label },
  })));
});
app.get('/api/scores/:id', (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const cur = currentVersion(s);
  res.json({
    id: s.id, title: s.title, school: s.school, attribution: s.attribution,
    shareEnabled: s.shareEnabled,
    versions: s.versions.map((v) => ({
      id: v.id, label: v.label, published: v.published, current: v.current,
      createdAt: v.createdAt,
      license: { validUntil: v.license.validUntil, valid: licenseOk(v), note: v.license.note || '' },
      sectionCount: v.sections.length,
      hasMedia: !!v.media,
      hasMapping: !!v.mappingFromPrevious,
    })),
    currentVersionId: cur && cur.id,
  });
});

// 版本媒体清单：服务端许可控制（含时码是否齐全的标注）
app.get('/api/scores/:id/versions/:vid/manifest', (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const v = findVersion(s, req.params.vid);
  if (!v) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
  if (!licenseOk(v)) {
    return res.status(410).json({
      error: 'LICENSE_EXPIRED',
      message: '该版本数字授权已到期，无法获取音频与可打印谱面；文字谱例仍可在站内阅读。',
    });
  }
  const mediaTimecodesComplete = !!(v.media && Array.isArray(v.media.timecodes) &&
    v.media.timecodes.length === v.sections.length);
  const token = v.media ? issueToken('stream', s.id, v.id) : null;
  res.json({
    scoreId: s.id, versionId: v.id,
    sections: v.sections,
    media: v.media ? {
      id: v.media.id,
      title: (db().media.find((m) => m.id === v.media.id) || {}).title || v.media.id,
      durationSec: v.media.durationSec,
      timecodes: v.media.timecodes || null,
      // 段落数与时码数不一致或缺时码 -> 锚点跳转降级（只做高亮，不跳转）
      anchorSync: mediaTimecodesComplete ? 'full' : (v.media ? 'highlight-only' : 'none'),
      streamUrl: `/api/media/${v.media.id}/stream?token=${token}`,
    } : null,
    canPrint: licenseOk(v),
    canShare: !!s.shareEnabled && licenseOk(v),
  });
});

// 新建版本草稿 + 旧版->新版段映射（不删除任何完成记录）
app.post('/api/scores/:id/versions', requireAdmin, (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const { label, sections, mapping, media } = req.body || {};
  if (!label || !Array.isArray(sections) || !sections.length) {
    return res.status(400).json({ error: 'LABEL_AND_SECTIONS_REQUIRED' });
  }
  const v = {
    id: 'v-' + crypto.randomBytes(5).toString('hex'), label,
    published: false, current: false, createdAt: Date.now(),
    license: { validUntil: req.body.licenseValidUntil ?? (Date.now() + 365 * 86400000), note: req.body.licenseNote || '' },
    sections: sections.map((x, i) => ({ id: x.id || `sec-${crypto.randomBytes(3).toString('hex')}`, title: x.title || `第${i + 1}段`, notation: x.notation || '' })),
    media: media || null,
    mappingFromPrevious: Array.isArray(mapping) ? mapping : [],
  };
  s.versions.push(v);
  save();
  res.status(201).json(v);
});

// 发布版本：对全部学习档案执行迁移判定并留档
app.post('/api/scores/:id/publish', requireAdmin, (req, res) => {
  const d = db();
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const v = findVersion(s, req.body.versionId);
  if (!v) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
  const prev = s.versions.find((x) => x.current && x.published && x.id !== v.id);
  // 映射健全性检查
  if (prev && v.mappingFromPrevious) {
    for (const m of v.mappingFromPrevious) {
      if (!prev.sections.some((x) => x.id === m.from)) return res.status(400).json({ error: 'MAPPING_SOURCE_UNKNOWN', mapping: m });
      if (!v.sections.some((x) => x.id === m.to)) return res.status(400).json({ error: 'MAPPING_TARGET_UNKNOWN', mapping: m });
    }
  }
  for (const x of s.versions) x.current = false;
  v.published = true; v.current = true;

  const migrationReports = [];
  if (prev) {
    for (const key of Object.keys(d.events)) {
      // 沿已发布版本链追溯该档案的完成（哪怕只在更老版本有记录），再对“紧邻旧版->新版”判定
      const done = chainedCompleted(key, s, prev);
      if (!done.size) continue;
      const report = evaluateMigration(prev, v, v.mappingFromPrevious || [], done);
      migrationReports.push({ principal: key, ...report });
    }
  }
  const run = {
    id: 'mr-' + crypto.randomBytes(4).toString('hex'),
    type: 'publish', scoreId: s.id, at: Date.now(),
    fromVersionId: prev ? prev.id : null, toVersionId: v.id,
    principalsEvaluated: migrationReports.length,
    summary: summarizeReports(migrationReports),
    reports: migrationReports,
  };
  d.migrationRuns.unshift(run);
  save();
  res.json({ published: v.id, previousVersionId: prev ? prev.id : null, migration: run });
});

// 发布回退：current 指针退回旧版本；完成事件一条不动；重新留档迁移判定
app.post('/api/scores/:id/rollback', requireAdmin, (req, res) => {
  const d = db();
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const target = findVersion(s, (req.body && req.body.versionId) || currentVersion(s)?.id);
  const candidates = s.versions.filter((x) => x.id !== (currentVersion(s) || {}).id && x.published);
  const fallback = target && target.published && !target.current ? target : candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!fallback) return res.status(400).json({ error: 'NO_PUBLISHED_VERSION_TO_ROLL_BACK' });
  const was = currentVersion(s);
  for (const x of s.versions) x.current = false;
  fallback.current = true;

  const reports = [];
  if (was) {
    // 反向映射取“被撤回版本自己”的映射（from=回退目标段 -> to=被撤回段），翻转后得到 被撤回段 -> 回退目标段
    const reverse = (was.mappingFromPrevious || []).map((m) => ({
      from: m.to, to: m.from,
      kind: m.kind === 'split' ? 'merge' : m.kind === 'merge' ? 'split' : 'same',
    }));
    for (const key of Object.keys(d.events)) {
      const doneOnWas = chainedCompleted(key, s, was);
      const directOnFallback = completedSections(key, fallback.id);
      if (!doneOnWas.size && !directOnFallback.size) continue;
      const report = evaluateMigration(was, fallback, reverse, doneOnWas);
      // 档案在回退目标版本上直接完成的段落，回退后当然满足
      for (const row of report.perSection) {
        if (directOnFallback.has(row.sectionId)) row.status = 'satisfied';
      }
      report.counts = report.perSection.reduce((acc, r) => { acc[r.status]++; return acc; },
        { satisfied: 0, partial: 0, unsatisfied: 0, new: 0 });
      report.status = report.counts.satisfied === report.perSection.length ? 'satisfied'
        : report.counts.satisfied > 0 || report.counts.partial > 0 ? 'partial' : 'unsatisfied';
      reports.push({ principal: key, ...report });
    }
  }
  const run = {
    id: 'mr-' + crypto.randomBytes(4).toString('hex'),
    type: 'rollback', scoreId: s.id, at: Date.now(),
    fromVersionId: was ? was.id : null, toVersionId: fallback.id,
    principalsEvaluated: reports.length,
    summary: summarizeReports(reports),
    reports,
  };
  d.migrationRuns.unshift(run);
  save();
  res.json({ rolledBackTo: fallback.id, withdrawnVersionId: was ? was.id : null, migration: run });
});

function summarizeReports(reports) {
  const summary = { satisfied: 0, partial: 0, unsatisfied: 0 };
  for (const r of reports) summary[r.status] = (summary[r.status] || 0) + 1;
  return summary;
}

// 针对当前学习档案的迁移判定（旧完成保留，是否满足新版按映射判）
app.get('/api/scores/:id/migration', (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const to = findVersion(s, req.query.toVersionId) || s.versions.find((v) => !v.current);
  if (!to) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
  const from = s.versions.find((v) => v.id !== to.id && v.createdAt < to.createdAt) ||
    s.versions.find((v) => v.id !== to.id);
  if (!from) return res.status(400).json({ error: 'NO_PREVIOUS_VERSION' });
  const key = principalKey(req, req.query.clientId);
  const done = completedSections(key, from.id);
  const report = evaluateMigration(from, to, to.mappingFromPrevious || [], done);
  res.json({ principal: key, ...report, completedOldSections: [...done] });
});

// ---------- 媒体：签名取流，授权到期 no-store ----------
app.get('/api/media/:mediaId/token', (req, res) => {
  const d = db();
  const asset = d.media.find((m) => m.id === req.params.mediaId);
  if (!asset) return res.status(404).json({ error: 'MEDIA_NOT_FOUND' });
  const s = findScore(asset.scoreId);
  const v = findVersion(s, asset.versionId);
  if (!licenseOk(v)) {
    // 旧版本授权到期：不签发新令牌，缓存索引无法续命
    res.set('Cache-Control', 'no-store');
    return res.status(410).json({ error: 'LICENSE_EXPIRED' });
  }
  res.json({ token: issueToken('stream', s.id, v.id), streamUrl: `/api/media/${asset.id}/stream` });
});
app.get('/api/media/:mediaId/stream', (req, res) => {
  const d = db();
  const asset = d.media.find((m) => m.id === req.params.mediaId);
  if (!asset) return res.status(404).json({ error: 'MEDIA_NOT_FOUND' });
  const s = findScore(asset.scoreId);
  const v = findVersion(s, asset.versionId);
  const auth = authorizeStream(req.query.token, v.id, v.license.validUntil);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache'); res.set('Expires', '0');
  if (!auth.ok) return res.status(auth.status).json({ error: auth.reason });
  const wav = generateWav(v.media.durationSec, hashSeed(v.media.id));
  res.set('Content-Type', 'audio/wav');
  res.set('Content-Length', wav.length);
  res.send(wav);
});
function hashSeed(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// 打印令牌与受保护的打印视图数据
app.post('/api/scores/:id/versions/:vid/print-token', (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const v = findVersion(s, req.params.vid);
  if (!v) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
  if (!licenseOk(v)) return res.status(410).json({ error: 'LICENSE_EXPIRED' });
  res.json({ printToken: issueToken('print', s.id, v.id, Date.now(), 10 * 60 * 1000), expiresInSec: 600 });
});
app.get('/api/scores/:id/versions/:vid/print', (req, res) => {
  const s = findScore(req.params.id);
  const v = s && findVersion(s, req.params.vid);
  const check = req.query.token && v && verify(req.query.token);
  if (!check || !check.ok) return res.status(403).json({ error: 'FORBIDDEN' });
  if (Date.now() > check.expiresAt) return res.status(403).json({ error: 'TOKEN_EXPIRED' });
  const [kind, , vv] = check.payload.split(':');
  if (kind !== 'print' || vv !== v.id || !licenseOk(v)) return res.status(403).json({ error: 'SCOPE_OR_LICENSE' });
  res.set('Cache-Control', 'no-store');
  res.json({ printable: true, title: s.title, version: v.label, sections: v.sections });
});

// 分享链接：服务端许可 + 谱例开关
app.get('/api/scores/:id/share', (req, res) => {
  const s = findScore(req.params.id);
  if (!s) return res.status(404).json({ error: 'NOT_FOUND' });
  const v = currentVersion(s);
  if (!s.shareEnabled) return res.status(403).json({ error: 'SHARING_DISABLED' });
  if (!licenseOk(v)) return res.status(410).json({ error: 'LICENSE_EXPIRED' });
  const shareToken = issueToken('share', s.id, v.id, Date.now(), 7 * 86400000);
  res.json({
    url: `/share.html?score=${s.id}&v=${v.id}&t=${shareToken}`,
    expiresAt: Date.now() + 7 * 86400000,
  });
});
app.get('/api/shared/:id', (req, res) => {
  const s = findScore(req.params.id);
  const v = s && findVersion(s, req.query.v);
  const check = req.query.t && v && verify(req.query.t);
  if (!check || !check.ok || Date.now() > check.expiresAt) return res.status(403).json({ error: 'INVALID_SHARE' });
  const [kind, , vv] = check.payload.split(':');
  if (kind !== 'share' || vv !== v.id) return res.status(403).json({ error: 'SCOPE_MISMATCH' });
  if (!s.shareEnabled) return res.status(403).json({ error: 'SHARING_REVOKED' });
  if (!licenseOk(v)) return res.status(410).json({ error: 'LICENSE_EXPIRED' });
  res.json({ title: s.title, attribution: s.attribution, version: v.label, sections: v.sections });
});

// ---------- 学习进度：匿名本地 / 账号同步 ----------
app.get('/api/progress/state', (req, res) => {
  const key = principalKey(req, req.query.clientId);
  const state = {};
  for (const [t, c] of ev.reduce(eventsOf(key))) state[t] = c;
  res.json({ principal: key, state });
});
app.post('/api/progress/events', (req, res) => {
  const d = db();
  const key = principalKey(req, req.body.clientId);
  const incoming = Array.isArray(req.body.events) ? req.body.events : [];
  const merged = ev.mergeEventStreams([
    { deviceId: 'server', events: eventsOf(key) },
    { deviceId: 'incoming', events: incoming },
  ]);
  d.events[key] = merged.events;
  save();
  res.json({
    principal: key,
    accepted: incoming.length - merged.duplicates.length,
    duplicates: merged.duplicates,
    redundant: merged.redundant,
    conflicts: merged.conflicts,
    state: stateFromMap(merged.state),
  });
});
function stateFromMap(m) { const o = {}; for (const [k, v] of m) o[k] = v; return o; }

// 匿名进度合并到账号：去重 + 冲突报告，合并后清空服务端匿名桶
app.post('/api/progress/anonymous/merge', requireUser, (req, res) => {
  const d = db();
  const anonKey = `anon:${req.body.clientId}`;
  const anonEvents = d.events[anonKey] || [];
  const userEvents = d.events[req.user.id] || [];
  const merged = ev.mergeEventStreams([
    { deviceId: 'account', events: userEvents },
    { deviceId: 'anonymous', events: anonEvents },
  ]);
  d.events[req.user.id] = merged.events;
  delete d.events[anonKey];
  save();
  res.json({
    mergedInto: req.user.id,
    anonymousEventCount: anonEvents.length,
    accountEventCountBefore: userEvents.length,
    resultCount: merged.events.length,
    duplicates: merged.duplicates,
    redundant: merged.redundant,
    conflicts: merged.conflicts,
    state: stateFromMap(merged.state),
  });
});

// 事件合并 vs 最后修改覆盖 对比
app.post('/api/sync/compare', (req, res) => {
  const inputs = Array.isArray(req.body.inputs) ? req.body.inputs : [];
  res.json(ev.compare(inputs));
});

// ---------- 后台：依赖缺项 + 版本迁移结果 ----------
app.get('/api/admin/gaps', requireAdmin, (_req, res) => {
  const d = db();
  const g = graph.dependencyGaps(d.nodes, d.edges);
  // 结构性“缺项”：悬挂边 + 没有任何先修声明的孤立节点（后台提示补全）
  const prereqCount = new Map(d.nodes.map((n) => [n.id, 0]));
  for (const [a, b] of d.edges) {
    if (prereqCount.has(a) && d.nodes.some((n) => n.id === b)) prereqCount.set(a, prereqCount.get(a) + 1);
  }
  const isolated = d.nodes.filter((n) => prereqCount.get(n.id) === 0 && n.kind !== 'fundamental')
    .map((n) => ({ nodeId: n.id, title: n.title, warning: '该节点未声明任何先修' }));
  res.json({
    danglingEdges: g.dangling.map(([nodeId, prereqId]) => ({ nodeId, prereqId })),
    isolatedNodes: isolated,
    edges: d.edges.map(([nodeId, prereqId]) => ({ nodeId, prereqId })),
    migrationRuns: d.migrationRuns,
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  load(); flush();
  app.listen(PORT, () => console.log(`古琴学习资料站 http://localhost:${PORT}`));
}
module.exports = app;
