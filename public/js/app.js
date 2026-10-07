'use strict';
const view = () => document.getElementById('view');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 账号条 ----------
async function renderLoginStrip() {
  const strip = document.getElementById('loginStrip');
  const sess = GuqinStore.session();
  if (sess) {
    let role = '';
    try { const me = await Api.get('/api/auth/me'); role = me.role; strip.dataset.role = role; } catch { GuqinStore.setSession(null); }
    strip.innerHTML = `已登录：<b>${esc(sess.user.name)}</b>（${role === 'admin' ? '管理员' : '学员'}）
      <button id="btnFlush">立即同步</button> · <button id="btnLogout">退出</button>
      <div>设备：${esc(GuqinStore.clientId())} · 待同步 <span id="pendingCount">${GuqinStore.queuedCount()}</span> 条</div>`;
    document.getElementById('btnLogout').onclick = () => { GuqinStore.setSession(null); location.reload(); };
    document.getElementById('btnFlush').onclick = () => flushNow();
    document.getElementById('tabAdmin').style.display = strip.dataset.role === 'admin' ? '' : 'none';
  } else {
    strip.dataset.role = '';
    strip.innerHTML = `<a href="javascript:;" id="btnLogin">登录 / 注册</a>
      <div>匿名设备：${esc(GuqinStore.clientId())} · 待同步 <span id="pendingCount">${GuqinStore.queuedCount()}</span> 条（进度保存在本机）</div>`;
    document.getElementById('btnLogin').onclick = openLogin;
    document.getElementById('tabAdmin').style.display = 'none';
  }
}
function updatePending() {
  const el = document.getElementById('pendingCount'); if (el) el.textContent = GuqinStore.queuedCount();
}

function openLogin() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <h3 style="margin-top:0">登录或注册</h3>
    <label class="fld">名称<input id="lgName" value="u-student"></label>
    <label class="fld">口令<input id="lgPass" type="password" value="student123"></label>
    <p class="muted">演示账号：管理员 admin/admin123；学员 u-student/student123。</p>
    <div class="row" style="justify-content:flex-end">
      <button class="btn ghost" id="lgCancel">取消</button>
      <button class="btn" id="lgRegister">注册</button>
      <button class="btn" id="lgLogin">登录并合并本机进度</button>
    </div>`;
  document.body.appendChild(dlg); dlg.showModal();
  dlg.querySelector('#lgCancel').onclick = () => dlg.close();
  dlg.querySelector('#lgRegister').onclick = async () => {
    try {
      await Api.post('/api/auth/register', { name: v(dlg, '#lgName').value, password: v(dlg, '#lgPass').value });
      toast('注册成功，请登录');
    } catch (e) { toast('注册失败：' + e.message); }
  };
  dlg.querySelector('#lgLogin').onclick = async () => {
    try {
      const r = await Api.post('/api/auth/login', { name: v(dlg, '#lgName').value, password: v(dlg, '#lgPass').value });
      GuqinStore.setSession(r);
      // 先把本机匿名事件队列推到匿名桶，再执行“匿名合并到账号”
      await Api.post('/api/progress/events', { clientId: GuqinStore.clientId(), events: GuqinStore.queuedEvents() });
      const merged = await Api.post('/api/progress/anonymous/merge', { clientId: GuqinStore.clientId() });
      GuqinStore.clearQueue(); updatePending();
      toast(`已合并 ${merged.anonymousEventCount} 条匿名记录（去重 ${merged.duplicates.length}，冲突 ${merged.conflicts.length}）`);
      dlg.close(); renderLoginStrip(); route();
    } catch (e) { toast('登录失败：' + e.message); }
  };
}
function v(root, sel) { return root.querySelector(sel); }

async function flushNow() {
  try {
    const r = await GuqinStore.flush(Api);
    if (r.offline) return toast('当前离线，' + r.pending + ' 条操作暂存本机，上线后自动同步');
    if (r.skipped) return toast('没有待同步的操作');
    updatePending();
    let msg = `同步完成：接受 ${r.accepted} 条`;
    if (r.conflicts && r.conflicts.length) msg += `；检出 ${r.conflicts.length} 处离线冲突（已按时间决胜并记录）`;
    toast(msg);
    route();
  } catch (e) { toast('同步失败：' + e.message); }
}

// ---------- 琴史 ----------
async function renderHistory() {
  const items = await Api.get('/api/history');
  view().innerHTML = `<div class="card"><h2>琴史年表</h2><div class="timeline">
    ${items.map((h) => `<div class="ev"><span class="era">${esc(h.era)}</span><span class="period">${esc(h.period)}</span>
      <h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join('')}
  </div></div>`;
}

// ---------- 流派 ----------
async function renderSchools() {
  const items = await Api.get('/api/schools');
  view().innerHTML = `<div class="card"><h2>琴派流脉</h2>
    <p class="muted">琴派是地域、师承与审美共同塑造的演奏传统。同一曲目在不同流派间指法与气韵各异。</p>
    <div class="grid2">${items.map((s) => `<div class="school">
      <h3>${esc(s.name)}</h3>
      <div class="meta">${esc(s.region)} · 传自 ${esc(s.founder)} · ${esc(s.era)}</div>
      <p>${esc(s.trait)}</p>
      <div>${(s.works || []).map((w) => `<span class="tag">${esc(w)}</span>`).join('')}</div>
    </div>`).join('')}</div></div>`;
}

// ---------- 术语 ----------
async function renderTerms() {
  const [terms, sources] = await Promise.all([Api.get('/api/terms'), Api.get('/api/sources')]);
  const srcName = Object.fromEntries(sources.map((s) => [s.id, `${s.title}${s.author ? '（' + s.author + '）' : ''}`]));
  view().innerHTML = `<div class="card"><h2>琴学术语</h2>
    <p class="muted">术语与来源由后端 API 持久管理，管理员可在“后台”增改。</p>
    ${terms.map((t) => `<div class="term"><b>${esc(t.term)}</b> <span class="py">${esc(t.pinyin)}</span>
      <div>${esc(t.definition)}</div>
      ${(t.sources || []).length ? `<div class="src">出处：${t.sources.map((id) => esc(srcName[id] || id)).join('；')}</div>` : ''}
    </div>`).join('')}</div>`;
}

// ---------- 学习路线（依赖图，共享节点） ----------
async function renderRoute() {
  const g = await Api.get('/api/graph?clientId=' + encodeURIComponent(GuqinStore.clientId()));
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const levelOf = Object.fromEntries(g.levels.map((x) => [x.id, x.level]));
  const done = new Set(g.completedNodes);
  const cols = Math.max(0, ...g.levels.map((x) => x.level)) + 1;
  const buckets = Array.from({ length: cols }, () => []);
  for (const n of g.nodes) buckets[levelOf[n.id] || 0].push(n);
  const colW = 210, rowH = 92, padX = 30, padY = 30;
  const pos = {};
  buckets.forEach((list, ci) => list.forEach((n, ri) => {
    pos[n.id] = { x: padX + ci * colW, y: padY + ri * rowH, w: 184, h: 62 };
  }));
  const height = Math.max(...buckets.map((l) => l.length)) * rowH + 70;
  const width = cols * colW + 40;

  // 统计共享先修（被多个节点依赖）
  const prereqCount = {};
  g.edges.forEach((e) => { prereqCount[e.prereqId] = (prereqCount[e.prereqId] || 0) + 1; });

  view().innerHTML = `<div class="card">
    <h2>学习路线（有向依赖图，节点共享）</h2>
    <p class="legend">边 A → B 表示“学 A 前先修 B”；<span class="seal">红色边</span>指向被多个节点共享的先修节点。绿色=已完成。灰色=尚有未完成先修。</p>
    <div class="legend">${g.danglingEdges && g.danglingEdges.length ? `<span class="bad">检测到 ${g.danglingEdges.length} 条悬挂边（引用缺失节点），已在后台列出。</span>` : '无悬挂边。'}</div>
    <div class="graph-wrap"><svg class="graph-svg" width="${width}" height="${height}">
      <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="#5c5348"/></marker></defs>
      ${g.edges.map((e) => {
        const a = pos[e.nodeId], b = pos[e.prereqId];
        if (!a || !b) return '';
        const x1 = a.x, y1 = a.y + a.h / 2, x2 = b.x + b.w, y2 = b.y + b.h / 2;
        const shared = (prereqCount[e.prereqId] || 0) > 1;
        const mx = (x1 + x2) / 2;
        return `<path class="edge ${shared ? 'shared' : ''}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
      }).join('')}
      ${g.nodes.map((n) => {
        const p = pos[n.id]; if (!p) return '';
        const isDone = done.has(n.id);
        return `<g data-node="${n.id}" style="cursor:pointer">
          <rect class="node-box ${isDone ? 'done' : ''} ${n.kind === 'fundamental' ? 'fundamental' : ''}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>
          <text class="node-label" x="${p.x + 10}" y="${p.y + 24}">${isDone ? '✓ ' : ''}${esc(n.title)}</text>
          <text class="node-sub" x="${p.x + 10}" y="${p.y + 46}">${esc(n.kind)}${n.scoreId ? ' · 含谱' : ''}</text>
        </g>`;
      }).join('')}
    </svg></div>
    <div id="nodeDetail"></div>
  </div>`;

  document.querySelectorAll('g[data-node]').forEach((gEl) => {
    gEl.addEventListener('click', () => showNode(gEl.dataset.node));
  });
  async function showNode(id) {
    const n = byId[id];
    const prereqs = g.edges.filter((e) => e.nodeId === id).map((e) => byId[e.prereqId]).filter(Boolean);
    const followers = g.edges.filter((e) => e.prereqId === id).map((e) => byId[e.nodeId]).filter(Boolean);
    const isDone = done.has(id);
    const missing = prereqs.filter((p) => !done.has(p.id));
    const el = document.getElementById('nodeDetail');
    el.innerHTML = `<div class="admin-panel"><h3>${esc(n.title)}</h3>
      <p>${esc(n.desc || '')}</p>
      <div class="muted">先修：${prereqs.map((p) => esc(p.title)).join('、') || '无（入门节点）'}</div>
      <div class="muted">解锁：${followers.map((p) => esc(p.title)).join('、') || '无'}</div>
      ${missing.length ? `<p class="bad">尚不能开始：未完成先修 ${missing.map((m) => esc(m.title)).join('、')}</p>` : '<p class="ok">先修已满足，可以开始。</p>'}
      <button class="btn" ${missing.length ? 'disabled' : ''} id="toggleNode">${isDone ? '取消完成（离线可用）' : '标记完成（离线可用）'}</button>
      ${n.scoreId ? `<button class="btn ghost" id="goScore">去看谱例《${esc(n.scoreId)}》</button>` : ''}
    </div>`;
    document.getElementById('toggleNode').onclick = () => {
      GuqinStore.record('node:' + id, isDone ? 'uncheck' : 'check');
      updatePending();
      if (navigator.onLine) flushNow(); else { toast('已离线记录，稍后同步'); renderRoute(); }
    };
    const gs = document.getElementById('goScore');
    if (gs) gs.onclick = () => { location.hash = 'scores:' + n.scoreId; route(); };
  }
}

// ---------- 谱例 ----------
async function renderScores(scoreId) {
  const scores = await Api.get('/api/scores');
  const selected = scoreId || (scores[0] && scores[0].id);
  view().innerHTML = `<div class="card"><h2>谱例库</h2>
    <div class="row">${scores.map((s) => `<button class="btn ${s.id === selected ? '' : 'ghost'}" data-score="${s.id}">${esc(s.title)}</button>`).join('')}</div>
    <div id="scoreDetail" style="margin-top:14px"></div></div>`;
  view().querySelectorAll('[data-score]').forEach((b) => b.onclick = () => { location.hash = 'scores:' + b.dataset.score; renderScores(b.dataset.score); });
  if (selected) renderScoreDetail(selected);
}

async function renderScoreDetail(scoreId) {
  const mount = document.getElementById('scoreDetail');
  const detail = await Api.get('/api/scores/' + scoreId);
  const cur = detail.versions.find((x) => x.id === detail.currentVersionId);
  mount.innerHTML = `
    <h3 style="margin-bottom:2px">${esc(detail.title)} <span class="muted" style="font-size:14px">${esc(detail.school)} · ${esc(detail.attribution)}</span></h3>
    <div class="muted">版本：
      <select id="versionSelect">${detail.versions.map((x) => `<option value="${x.id}" ${x.id === cur.id ? 'selected' : ''}>${esc(x.label)}${x.current ? '（现行）' : ''}</option>`).join('')}</select>
    </div>
    <div id="licenseLine" style="margin:8px 0"></div>
    <div id="migPanel"></div>
    <div class="grid2" style="grid-template-columns:1.2fr .8fr;align-items:start">
      <div id="sectionsPanel"></div>
      <div><div class="admin-panel"><h3>音频与锚点</h3><div id="playerMount"><p class="muted">加载中…</p></div></div>
        <div class="admin-panel no-print"><h3>打印 / 分享</h3><div id="permsMount"></div></div>
      </div>
    </div>`;
  document.getElementById('versionSelect').onchange = (e) => loadVersion(detail, e.target.value);
  loadVersion(detail, cur.id);
}

async function loadVersion(detail, versionId) {
  const v = detail.versions.find((x) => x.id === versionId);
  const licenseLine = document.getElementById('licenseLine');
  licenseLine.innerHTML = v.license.valid
    ? `<span class="pill ok">授权有效</span> <span class="muted">至 ${new Date(v.license.validUntil).toISOString().slice(0, 10)}${v.license.note ? ' · ' + esc(v.license.note) : ''}</span>`
    : `<span class="pill bad">授权到期</span> <span class="muted">${esc(v.license.note || '数字授权已到期')}——音频与打印不可用，文字谱例仍可阅读</span>`;

  // 迁移判定（旧完成记录保留，是否满足新版按映射判）
  await renderMigration(detail, versionId);

  let manifest = null;
  const playerMount = document.getElementById('playerMount');
  if (v.license.valid) {
    try {
      manifest = await Api.get(`/api/scores/${detail.id}/versions/${versionId}/manifest`);
    } catch (e) {
      manifest = null;
      playerMount.innerHTML = `<p class="bad">无法加载媒体清单：${esc(e.data && e.data.message || e.message)}</p>`;
    }
  } else {
    playerMount.innerHTML = '<p class="muted">授权到期：不请求任何音频 URL，旧缓存索引也无法重新取流。</p>';
  }

  // 段落勾选（匿名/登录均走事件队列）
  const sectionsPanel = document.getElementById('sectionsPanel');
  const principal = GuqinStore.loggedIn() ? '' : '?clientId=' + encodeURIComponent(GuqinStore.clientId());
  const state = await Api.get('/api/progress/state' + (GuqinStore.loggedIn() ? '' : '?clientId=' + encodeURIComponent(GuqinStore.clientId()))).catch(() => ({ state: {} }));
  const targetOf = (sid) => `section:${detail.id}:${versionId}:${sid}`;
  sectionsPanel.innerHTML = manifest ? manifest.sections.map((sec, i) => {
    const done = state.state[targetOf(sec.id)] && state.state[targetOf(sec.id)].done;
    return `<div class="section-row" data-idx="${i}" id="secrow-${i}">
      <input type="checkbox" class="check" data-sec="${sec.id}" ${done ? 'checked' : ''}>
      <div><b>${esc(sec.title)}</b><div class="notation muted">${esc(sec.notation)}</div></div>
    </div>`;
  }).join('') : '<p class="muted">无可用清单。</p>';

  let player = null;
  if (manifest) player = renderAudioPlayer(playerMount, manifest, (idx, mode) => {
    document.querySelectorAll('.section-row').forEach((r) => r.classList.remove('active'));
    const row = document.getElementById('secrow-' + idx);
    if (row) row.classList.add('active');
  });

  sectionsPanel.querySelectorAll('.section-row').forEach((row) => {
    const idx = Number(row.dataset.idx);
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('check')) return;
      player && player.setActive(idx); // 段落跳转（full 模式）/仅高亮（缺时码）
    });
  });
  sectionsPanel.querySelectorAll('input.check').forEach((cb) => {
    cb.addEventListener('change', () => {
      GuqinStore.record(targetOf(cb.dataset.sec), cb.checked ? 'check' : 'uncheck');
      updatePending();
      if (navigator.onLine) flushNow(); else toast('已离线记录，稍后同步');
    });
  });

  // 打印 / 分享（服务端许可）
  renderPerms(detail, v, manifest);
}

async function renderMigration(detail, versionId) {
  const panel = document.getElementById('migPanel');
  const isCurrent = detail.currentVersionId === versionId;
  const older = detail.versions.filter((x) => x.createdAt < (detail.versions.find((v) => v.id === versionId) || {}).createdAt);
  if (!older.length) { panel.innerHTML = '<p class="muted">首个版本，无迁移。</p>'; return; }
  try {
    const suffix = '?toVersionId=' + encodeURIComponent(versionId) + (GuqinStore.loggedIn() ? '' : '&clientId=' + encodeURIComponent(GuqinStore.clientId()));
    const r = await Api.get('/api/scores/' + detail.id + '/migration' + suffix);
    const pill = { satisfied: ['ok', '全部满足'], partial: ['warn', '部分满足'], unsatisfied: ['bad', '均不满足'] }[r.status];
    panel.innerHTML = `<div class="admin-panel" style="background:#f3ead6"><h3>换版迁移判定 ${isCurrent ? '（现行版）' : ''}</h3>
      <p>旧版完成记录<b>保留不删</b>，按下发映射判断是否满足新版：<span class="pill ${pill[0]}">${pill[1]}</span>
      （满足 ${r.counts.satisfied} · 部分 ${r.counts.partial} · 不满足 ${r.counts.unsatisfied} · 新增段 ${r.counts.new}）</p>
      <table class="mig-table"><tr><th>新版段落</th><th>判定</th><th>依据映射</th></tr>
      ${r.perSection.map((p) => `<tr><td>${esc(p.title)}</td><td>${{ satisfied: '<span class="ok">满足</span>', partial: '<span style="color:#7a5a12">部分满足</span>', unsatisfied: '<span class="bad">不满足</span>', new: '<span class="muted">新增（无旧记录）</span>' }[p.status]}</td>
        <td>${p.sources.length ? p.sources.map((s) => `${esc(s.sectionId)} [${s.kind}] ${s.completed ? '✓已完成' : '✗'} `).join('；') : '—'}</td></tr>`).join('')}
      </table>
      ${r.unmappedOldSections.length ? `<p class="muted">未被新版引用的旧段（记录保留）：${r.unmappedOldSections.map(esc).join('、')}</p>` : ''}
    </div>`;
  } catch (e) {
    panel.innerHTML = `<p class="muted">迁移判定不可用：${esc(e.message)}</p>`;
  }
}

async function renderPerms(detail, v, manifest) {
  const mount = document.getElementById('permsMount');
  if (!v.license.valid) { mount.innerHTML = '<span class="pill bad">授权到期，打印/分享/取流均关闭</span>'; return; }
  mount.innerHTML = `
    <button class="btn" id="btnPrint">申请打印并打印本谱</button>
    <button class="btn ghost" id="btnShare" ${detail.shareEnabled ? '' : 'disabled'}>生成分享链接</button>
    <p class="muted" id="shareOut"></p>
    <p class="muted">${detail.shareEnabled ? '该谱允许分享；分享令牌由服务端签发并随授权失效。' : '该谱<b>未开放分享</b>（服务端许可关闭）。'}</p>`;
  document.getElementById('btnPrint').onclick = async () => {
    try {
      const t = await Api.post(`/api/scores/${detail.id}/versions/${v.id}/print-token`, {});
      const data = await Api.get(`/api/scores/${detail.id}/versions/${v.id}/print?token=${t.printToken}`);
      openPrintWindow(data);
    } catch (e) { toast('打印被拒绝：' + (e.data && e.data.error || e.message)); }
  };
  document.getElementById('btnShare').onclick = async () => {
    try {
      const r = await Api.get(`/api/scores/${detail.id}/share`);
      document.getElementById('shareOut').innerHTML = `分享链接（${new Date(r.expiresAt).toISOString().slice(0, 10)} 到期）：<br><code>${location.origin}${esc(r.url)}</code>`;
    } catch (e) { toast('分享被拒绝：' + (e.data && e.data.error || e.message)); }
  };
}

function openPrintWindow(data) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(data.title)}·打印</title>
    <style>body{font-family:"Songti SC","SimSun",serif;max-width:720px;margin:30px auto;color:#222}
    h1{letter-spacing:6px;text-align:center} .meta{text-align:center;color:#666;margin-bottom:24px}
    .sec{margin:18px 0;break-inside:avoid}.sec h3{border-bottom:1px solid #999;padding-bottom:4px}</style></head>
    <body><h1>${esc(data.title)}</h1><div class="meta">${esc(data.attribution || '')} · ${esc(data.version)}</div>
    ${data.sections.map((s, i) => `<div class="sec"><h3>${esc(s.title)}</h3><div>${esc(s.notation)}</div></div>`).join('')}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---------- 进度与同步 ----------
async function renderSync() {
  view().innerHTML = `<div class="card"><h2>学习进度与跨设备同步</h2>
    <p class="muted">所有勾选都先作为<b>不可变事件</b>存入本机（匿名可用）。登录后可合并到账号；多设备离线产生的事件由服务端去重并检测冲突。</p>
    <div class="row">
      <button class="btn" id="syncFlush">立即同步本机队列</button>
      ${GuqinStore.loggedIn() ? '' : '<button class="btn ghost" id="syncLogin">登录并合并匿名进度</button>'}
    </div>
    <h3>事件合并 vs 最后修改覆盖（LWW）</h3>
    <p class="muted">下方模拟器构造两台设备离线做出相反勾选的情形，对比两种策略。</p>
    <div class="grid2"><div class="admin-panel"><h3>输入（可改时间戳）</h3><div id="compareInputs"></div>
        <button class="btn" id="btnCompare">运行对比</button></div>
      <div class="admin-panel"><h3>结果</h3><pre class="json" id="compareOut">点击“运行对比”。</pre></div></div>
    <h3>本机状态</h3><pre class="json" id="stateDump"></pre>
  </div>`;
  if (!GuqinStore.loggedIn()) document.getElementById('syncLogin').onclick = openLogin;
  document.getElementById('syncFlush').onclick = flushNow;

  const t = 1000;
  const demoInputs = [
    { deviceId: 'device-A', lastSyncAt: 0, modifiedAt: 10 * t, events: [
      { id: 'a1', target: 'section:sc-liushui:v-liushui-2021:ls2-c', type: 'check', ts: 2 * t, deviceId: 'device-A', base: false },
      { id: 'a2', target: 'section:sc-liushui:v-liushui-2021:ls2-c', type: 'uncheck', ts: 9 * t, deviceId: 'device-A', base: true },
    ] },
    { deviceId: 'device-B', lastSyncAt: 0, modifiedAt: 8 * t, events: [
      { id: 'a1', target: 'section:sc-liushui:v-liushui-2021:ls2-c', type: 'check', ts: 2 * t, deviceId: 'device-A' }, // 同事件被两台设备都带上来 -> 去重
      { id: 'b1', target: 'section:sc-liushui:v-liushui-2021:ls2-c', type: 'check', ts: 5 * t, deviceId: 'device-B', base: false },
    ] },
  ];
  document.getElementById('compareInputs').innerHTML = `<textarea id="compareText" rows="14">${JSON.stringify(demoInputs, null, 2)}</textarea>`;
  document.getElementById('btnCompare').onclick = async () => {
    try {
      const inputs = JSON.parse(document.getElementById('compareText').value);
      const r = await Api.post('/api/sync/compare', { inputs });
      document.getElementById('compareOut').textContent = r.conclusion + '\n\n' + JSON.stringify(r, null, 2);
    } catch (e) { toast('输入有误：' + e.message); }
  };
  const suffix = GuqinStore.loggedIn() ? '' : '?clientId=' + encodeURIComponent(GuqinStore.clientId());
  const st = await Api.get('/api/progress/state' + suffix);
  document.getElementById('stateDump').textContent = `身份：${st.principal}\n` + JSON.stringify(st.state, null, 2);
}

// ---------- 路由 ----------
const tabs = ['history', 'schools', 'terms', 'route', 'scores', 'sync', 'admin'];
async function route() {
  const hash = location.hash.slice(1) || 'history';
  const [tab, arg] = hash.split(':');
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  await renderLoginStripSafe();
  const fn = { history: renderHistory, schools: renderSchools, terms: renderTerms, route: renderRoute, scores: () => renderScores(arg), sync: renderSync, admin: renderAdmin }[tab] || renderHistory;
  if (tab === 'admin' && document.getElementById('tabAdmin').style.display === 'none') return location.hash = 'history', renderHistory();
  try { await fn(); } catch (e) { view().innerHTML = `<div class="card"><p class="bad">加载失败：${esc(e.message)}</p></div>`; }
}
async function renderLoginStripSafe() { try { await renderLoginStrip(); } catch {} }
window.addEventListener('hashchange', route);
window.addEventListener('online', () => { toast('网络恢复，开始同步'); flushNow(); });
window.addEventListener('offline', () => toast('已离线：勾选仍保存在本机'));
renderLoginStrip().then(route);
