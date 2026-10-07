(async function () {
  let isAdmin = false;
  function deny() {
    ['pane-dep','pane-mig','pane-rel'].forEach(id => document.getElementById(id).style.display = 'none');
    document.querySelectorAll('.tabs button').forEach(b => b.disabled = true);
    document.getElementById('not-admin').style.display = '';
  }
  try {
    const me = await API.get('/api/auth/me');
    if (me.role !== 'admin') return deny();
    isAdmin = true;
  } catch (e) { return deny(); }

  function badge(st) {
    return { inherited: 'ok', partial: 'warn', not_met: 'bad', new: 'new', archived: 'warn' }[st] || '';
  }

  async function loadDep() {
    const r = await API.get('/api/admin/missing-dependencies');
    const box = document.getElementById('dep-body');
    if (!r.reports.length) {
      box.innerHTML = '<div class="alert ok">没有依赖缺项：所有已完成节点的传递先修均已满足。</div>';
    } else {
      box.innerHTML = '<table><thead><tr><th>用户</th><th>已完成节点</th><th>缺失先修</th></tr></thead><tbody>' +
        r.reports.map(x => '<tr><td>#' + x.user_id + '</td><td>' + esc(x.node_id) + ' ' +
          esc(x.node_title || '') + '</td><td>' +
          x.missing.map(m => '<span class="tag">' + esc(m.id) + ' ' + esc(m.title || '') + '</span>').join('') +
          '</td></tr>').join('') + '</tbody></table>';
    }
    const g = document.createElement('div');
    g.innerHTML = '<h3>当前依赖图</h3><pre style="background:#fffdf7;border:1px solid #ddcfb8;padding:10px;border-radius:8px;overflow:auto">' +
      esc(JSON.stringify(r.graph, null, 2)) + '</pre>';
    box.appendChild(g);
  }

  async function loadMig(versionId) {
    const r = await API.get('/api/admin/migration-results' + (versionId ? '?version_id=' + versionId : ''));
    const box = document.getElementById('mig-body');
    if (!r.length) { box.innerHTML = '<p class="muted">暂无迁移记录（发生换版且用户有进度后生成）。</p>'; return; }
    box.innerHTML = '<table><thead><tr><th>用户</th><th>版本</th><th>新段</th><th>判定</th><th>说明</th><th>时间</th></tr></thead><tbody>' +
      r.map(m => '<tr><td>' + esc(m.username || ('#' + m.user_id)) + '</td>' +
        '<td>#' + m.from_version_id + '→#' + m.to_version_id + '</td>' +
        '<td><b>' + esc(m.new_code) + '</b></td>' +
        '<td><span class="badge ' + badge(m.status) + '">' + esc(m.status) + '</span></td>' +
        '<td class="small">' + esc(m.detail || '') + '</td>' +
        '<td class="small">' + fmt(m.created_at) + '</td></tr>').join('') + '</tbody></table>';
  }

  async function loadRel() {
    const scores = await API.get('/api/scores');
    let all = [];
    for (const s of scores) {
      const rs = await API.get('/api/scores/' + s.id + '/releases');
      rs.forEach(x => all.push(Object.assign({ score_id: s.id, title: s.title }, x)));
    }
    all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    document.getElementById('rel-body').innerHTML =
      '<table><thead><tr><th>时间</th><th>谱例</th><th>动作</th><th>版本变化</th><th>原因</th></tr></thead><tbody>' +
      all.map(x => '<tr><td class="small">' + fmt(x.created_at) + '</td><td>' + esc(x.title) + '</td>' +
        '<td><span class="badge ' + (x.action === 'rollback' ? 'warn' : 'ok') + '">' + esc(x.action) + '</span></td>' +
        '<td>' + (x.from_version_id || '∅') + ' → ' + x.to_version_id + '</td>' +
        '<td class="small">' + esc(x.reason || '') + '</td></tr>').join('') + '</tbody></table>';
  }

  function tab(name) {
    ['dep', 'mig', 'rel'].forEach(n => {
      document.getElementById('pane-' + n).style.display = n === name ? '' : 'none';
      document.getElementById('tab-' + n).classList.toggle('active', n === name);
    });
    if (name === 'dep') loadDep();
    if (name === 'mig') loadMig();
    if (name === 'rel') loadRel();
  }
  document.getElementById('tab-dep').onclick = () => tab('dep');
  document.getElementById('tab-mig').onclick = () => tab('mig');
  document.getElementById('tab-rel').onclick = () => tab('rel');
  document.getElementById('btn-mig-go').onclick = () =>
    loadMig(document.getElementById('mig-filter').value.trim());

  loadDep().catch(e => document.getElementById('dep-body').innerHTML =
    '<div class="alert err">' + esc(e.message) + '</div>');
})();
