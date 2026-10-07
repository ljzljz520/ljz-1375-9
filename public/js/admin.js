'use strict';
async function renderAdmin() {
  view().innerHTML = `<div class="card"><h2>后台管理</h2>
    <div class="tabs-inner row" style="gap:8px;margin-bottom:10px">
      <button class="btn ghost adm-tab active" data-at="gaps">依赖缺项 / 迁移结果</button>
      <button class="btn ghost adm-tab" data-at="terms">术语</button>
      <button class="btn ghost adm-tab" data-at="sources">来源</button>
      <button class="btn ghost adm-tab" data-at="graph">先修关系</button>
      <button class="btn ghost adm-tab" data-at="versions">谱例换版</button>
    </div>
    <div id="admBody"></div></div>`;
  document.querySelectorAll('.adm-tab').forEach((b) => b.onclick = () => {
    document.querySelectorAll('.adm-tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    ({ gaps: admGaps, terms: admTerms, sources: admSources, graph: admGraph, versions: admVersions })[b.dataset.at]();
  });
  admGaps();
}

async function admGaps() {
  const body = document.getElementById('admBody');
  const g = await Api.get('/api/admin/gaps');
  body.innerHTML = `
    <div class="admin-panel"><h3>依赖缺项</h3>
      <p>悬挂边（引用了不存在的节点）：</p>
      ${g.danglingEdges.length ? `<table class="data"><tr><th>节点</th><th>引用的缺失先修</th></tr>
        ${g.danglingEdges.map((e) => `<tr><td>${esc(e.nodeId)}</td><td class="bad">${esc(e.prereqId)}</td></tr>`).join('')}</table>`
      : '<p class="ok">无悬挂边。</p>'}
      <p>未声明先修的节点：</p>
      ${g.isolatedNodes.length ? `<table class="data"><tr><th>节点</th><th>标题</th><th>提示</th></tr>
        ${g.isolatedNodes.map((e) => `<tr><td>${esc(e.nodeId)}</td><td>${esc(e.title)}</td><td>${esc(e.warning)}</td></tr>`).join('')}</table>`
      : '<p class="ok">所有非入门节点都已声明先修。</p>'}
    </div>
    <div class="admin-panel"><h3>版本迁移结果（发布 / 回退留档）</h3>
      ${g.migrationRuns.length ? g.migrationRuns.map((r) => `
        <details><summary><b>${r.type === 'publish' ? '发布' : '回退'}</b> · 谱 ${esc(r.scoreId)} ·
          ${new Date(r.at).toLocaleString()} · ${r.fromVersionId ? esc(r.fromVersionId) + ' → ' : ''}${esc(r.toVersionId)}
          （评估 ${r.principalsEvaluated} 份档案：满足 ${r.summary.satisfied || 0} / 部分 ${r.summary.partial || 0} / 不满足 ${r.summary.unsatisfied || 0}）</summary>
          <pre class="json">${esc(JSON.stringify(r.reports, null, 2))}</pre></details>`).join('')
      : '<p class="muted">尚无迁移记录（发布或回退版本后在此列出逐档案判定）。</p>'}
    </div>`;
}

async function admTerms() {
  const body = document.getElementById('admBody');
  const [terms, sources] = await Promise.all([Api.get('/api/terms'), Api.get('/api/sources')]);
  body.innerHTML = `<div class="admin-panel"><h3>新增术语</h3>
    <label class="fld">术语<input id="tTerm"></label>
    <label class="fld">拼音<input id="tPy"></label>
    <label class="fld">释义<textarea id="tDef" rows="2"></textarea></label>
    <label class="fld">来源<select id="tSrc" multiple size="4">${sources.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label>
    <button class="btn" id="tSave">保存术语</button></div>
    <div class="admin-panel"><h3>术语列表</h3><table class="data"><tr><th>术语</th><th>拼音</th><th>释义</th><th>来源</th><th></th></tr>
    ${terms.map((t) => `<tr><td>${esc(t.term)}</td><td>${esc(t.pinyin)}</td><td>${esc(t.definition)}</td>
      <td>${(t.sources || []).map(esc).join('、')}</td>
      <td><button class="btn danger" data-del="${t.id}">删</button></td></tr>`).join('')}</table></div>`;
  document.getElementById('tSave').onclick = async () => {
    const src = [...document.getElementById('tSrc').selectedOptions].map((o) => o.value);
    await Api.post('/api/terms', { term: id('tTerm').value, pinyin: id('tPy').value, definition: id('tDef').value, sources: src });
    toast('术语已保存'); admTerms();
  };
  body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    await Api.del('/api/terms/' + b.dataset.del); toast('已删除'); admTerms();
  });
}

async function admSources() {
  const body = document.getElementById('admBody');
  const sources = await Api.get('/api/sources');
  body.innerHTML = `<div class="admin-panel"><h3>新增来源</h3>
    <div class="row">
      <input id="sTitle" placeholder="书名/篇名" style="width:200px">
      <input id="sAuthor" placeholder="作者/编者" style="width:160px">
      <input id="sYear" placeholder="年份" style="width:100px">
      <input id="sPub" placeholder="出版者" style="width:180px">
      <select id="sKind" style="width:100px"><option>专著</option><option>教材</option><option>古籍</option><option>论文</option><option>其他</option></select>
      <button class="btn" id="sSave">保存来源</button>
    </div></div>
    <div class="admin-panel"><table class="data"><tr><th>题名</th><th>作者</th><th>年份</th><th>出版者</th><th>类型</th><th></th></tr>
    ${sources.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.author)}</td><td>${esc(s.year)}</td><td>${esc(s.publisher)}</td><td>${esc(s.kind)}</td>
      <td><button class="btn danger" data-del="${s.id}">删</button></td></tr>`).join('')}</table></div>`;
  document.getElementById('sSave').onclick = async () => {
    await Api.post('/api/sources', { title: id('sTitle').value, author: id('sAuthor').value, year: Number(id('sYear').value) || null, publisher: id('sPub').value, kind: id('sKind').value });
    toast('来源已保存'); admSources();
  };
  body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    await Api.del('/api/sources/' + b.dataset.del); admSources(); toast('已删除');
  });
}

async function admGraph() {
  const body = document.getElementById('admBody');
  const g = await Api.get('/api/graph');
  const titleOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.title]));
  body.innerHTML = `<div class="admin-panel"><h3>新增先修关系（服务端循环检测）</h3>
    <p class="muted">“节点”完成前必须先完成“先修节点”。若新增边会构成循环，服务端返回 <code>CYCLE</code> 及闭环路径，拒绝写入。</p>
    <div class="row">
      节点 <select id="eNode" style="width:240px">${g.nodes.map((n) => `<option value="${n.id}">${esc(n.title)}</option>`).join('')}</select>
      先修 <select id="ePre" style="width:240px">${g.nodes.map((n) => `<option value="${n.id}">${esc(n.title)}</option>`).join('')}</select>
      <button class="btn" id="eSave">添加先修</button>
    </div><p id="eMsg"></p></div>
    <div class="admin-panel"><h3>当前先修边（${g.edges.length}）</h3><table class="data"><tr><th>节点</th><th>先修</th><th></th></tr>
    ${g.edges.map((e) => `<tr><td>${esc(titleOf[e.nodeId] || e.nodeId)}</td><td>${esc(titleOf[e.prereqId] || e.prereqId)}</td>
      <td><button class="btn danger" data-edge="${e.nodeId}|${e.prereqId}">删</button></td></tr>`).join('')}</table></div>`;
  document.getElementById('eSave').onclick = async () => {
    const nodeId = id('eNode').value, prereqId = id('ePre').value;
    const msg = document.getElementById('eMsg');
    try {
      await Api.post('/api/graph/edges', { nodeId, prereqId });
      msg.innerHTML = '<span class="ok">已添加，未形成循环。</span>'; admGraph();
    } catch (e) {
      if (e.status === 409 && e.data.error === 'CYCLE') {
        msg.innerHTML = `<span class="bad">拒绝：会形成循环。闭环路径：${e.data.path.map((p) => esc(titleOf[p] || p)).join(' → ')}</span>`;
      } else {
        msg.innerHTML = `<span class="bad">${esc(e.data && e.data.error || e.message)}</span>`;
      }
    }
  };
  body.querySelectorAll('[data-edge]').forEach((b) => b.onclick = async () => {
    const [nodeId, prereqId] = b.dataset.edge.split('|');
    await Api.del('/api/graph/edges', { nodeId, prereqId }); admGraph();
  });
}

async function admVersions() {
  const body = document.getElementById('admBody');
  const scores = await Api.get('/api/scores');
  body.innerHTML = `<div class="admin-panel"><h3>谱例版本操作</h3>
    <label class="fld">选择谱例<select id="vScore">${scores.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label>
    <div id="vDetail"></div></div>`;
  id('vScore').onchange = () => vDetail(id('vScore').value);
  vDetail(id('vScore').value);

  async function vDetail(scoreId) {
    const detail = await Api.get('/api/scores/' + scoreId);
    const m = document.getElementById('vDetail');
    m.innerHTML = `
      <table class="data"><tr><th>版本</th><th>状态</th><th>授权</th><th>段</th><th>操作</th></tr>
      ${detail.versions.map((ver) => `<tr>
        <td>${esc(ver.label)}<br><span class="muted">${ver.id}</span></td>
        <td>${ver.current ? '<span class="pill ok">现行</span>' : ver.published ? '<span class="pill warn">已发布旧版</span>' : '<span class="pill">草稿</span>'}</td>
        <td>${ver.license.valid ? '<span class="ok">有效</span>' : '<span class="bad">到期</span>'}</td>
        <td>${ver.sectionCount}${ver.hasMapping ? ' · 有换版映射' : ''}</td>
        <td>${ver.current ? '' : `<button class="btn" data-pub="${ver.id}">发布（执行迁移判定）</button>`}
            ${ver.current && detail.versions.some((x) => x.published && !x.current) ? `<button class="btn ghost" data-rb>回退到上一已发布版</button>` : ''}
        </td></tr>`).join('')}</table>
      <details style="margin-top:12px"><summary>新建版本草稿（含旧段→新段映射 JSON）</summary>
        <label class="fld">版本名<input id="nvLabel"></label>
        <label class="fld">段落 JSON（[{id,title,notation}]）<textarea id="nvSecs" rows="6"></textarea></label>
        <label class="fld">映射 JSON（[{from,to,kind:same|split|merge}]）<textarea id="nvMap" rows="5"></textarea></label>
        <label class="fld">授权至（毫秒时间戳，留空=365天后）<input id="nvLic" placeholder=""></label>
        <button class="btn" id="nvSave">创建草稿</button> <span id="nvMsg"></span></details>`;
    m.querySelectorAll('[data-pub]').forEach((b) => b.onclick = async () => {
      if (!confirm('发布该版本将对所有学习档案做迁移判定并留档，旧完成记录不会被清空。继续？')) return;
      const r = await Api.post(`/api/scores/${scoreId}/publish`, { versionId: b.dataset.pub });
      toast(`已发布；评估 ${r.migration.principalsEvaluated} 份档案`); vDetail(scoreId);
    });
    const rb = m.querySelector('[data-rb]');
    if (rb) rb.onclick = async () => {
      const r = await Api.post(`/api/scores/${scoreId}/rollback`, {});
      toast(`已回退到 ${r.rolledBackTo}；完成事件未删除，已生成反向迁移判定`); vDetail(scoreId);
    };
    // 预填示例：以当前版段落为基础复制
    const cur = detail.versions.find((x) => x.current);
    const curFull = await fetchVersionSections(detail, cur);
    id('nvSecs').value = JSON.stringify(curFull.sections.map((s) => ({ id: s.id + '-new', title: s.title, notation: s.notation })), null, 2);
    id('nvMap').value = JSON.stringify(curFull.sections.map((s) => ({ from: s.id, to: s.id + '-new', kind: 'same' })), null, 2);
    id('nvSave').onclick = async () => {
      try {
        await Api.post(`/api/scores/${scoreId}/versions`, {
          label: id('nvLabel').value || '新版本 ' + new Date().toISOString().slice(0, 10),
          sections: JSON.parse(id('nvSecs').value),
          mapping: JSON.parse(id('nvMap').value),
          licenseValidUntil: Number(id('nvLic').value) || undefined,
        });
        toast('草稿已创建，发布时才会执行迁移判定'); vDetail(scoreId);
      } catch (e) { id('nvMsg').innerHTML = '<span class="bad">' + esc(e.data && e.data.error || e.message) + '</span>'; }
    };
  }
  async function fetchVersionSections(detail, ver) {
    if (ver.license.valid) return Api.get(`/api/scores/${detail.id}/versions/${ver.id}/manifest`);
    return { sections: [] };
  }
}
function id(x) { return document.getElementById(x); }
