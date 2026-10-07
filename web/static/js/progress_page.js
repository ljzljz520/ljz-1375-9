(async function () {
  document.getElementById('dev-id').textContent = GQStore.deviceId();
  document.getElementById('anon-id').textContent = GQStore.anonId();

  function renderLocal() {
    const evs = GQStore.localEvents();
    document.getElementById('pending').textContent = evs.length;
    document.getElementById('anon-body').innerHTML = evs.map(e =>
      '<tr><td>' + esc(e.entity_id) + '</td><td>' +
      '<span class="badge ' + (e.action === 'check' ? 'ok' : 'bad') + '">' +
      (e.action === 'check' ? '勾选' : '取消') + '</span></td>' +
      '<td>' + fmt(e.occurred_at) + '</td><td>' + esc(e.device_id) + '</td></tr>').join('')
      || '<tr><td colspan="4" class="muted">无</td></tr>';
  }

  async function renderServer() {
    if (!GQStore.isLoggedIn()) {
      renderLocal();
      return;
    }
    document.getElementById('login-hint').textContent = '已登录，以下为账号同步后的权威投影。';
    const r = await API.get('/api/progress');
    const states = r.states || [];
    document.getElementById('ent-count').textContent = states.length;
    document.getElementById('conflict-count').textContent = (r.conflicts || []).length;
    document.querySelector('#states tbody').innerHTML = states.map(s =>
      '<tr' + (s.conflict_flag ? ' style="background:#f8ece8"' : '') + '>' +
      '<td>' + (s.entity_type === 'section' ? '谱段' : '节点') + '</td>' +
      '<td class="mono">' + esc(s.entity_id) + '</td>' +
      '<td>' + (s.completed ? '<span class="badge ok">完成</span>' : '<span class="badge bad">未完成</span>') + '</td>' +
      '<td>' + (s.lww_completed == null ? '—' :
        (s.lww_completed ? '<span class="badge ok">完成</span>' : '<span class="badge bad">未完成</span>')) + '</td>' +
      '<td class="small">' + fmt(s.last_occurred_at) + '</td>' +
      '<td class="small">' + esc(s.last_device_id || '—') + '</td>' +
      '<td class="small">' + esc(s.conflict_detail || '') + '</td></tr>').join('')
      || '<tr><td colspan="7" class="muted">暂无记录</td></tr>';
    const conf = r.conflicts || [];
    document.getElementById('conflicts').innerHTML = conf.length ? conf.map(c =>
      '<div class="card"><b class="mono">' + esc(c.entity_id) + '</b>' +
      '<p class="small">' + esc(c.conflict_detail) + '</p>' +
      '<div class="row"><div style="flex:0"><button class="btn" data-resolve="1" data-id="' +
        esc(c.entity_id) + '" data-type="' + c.entity_type + '">裁决为完成</button></div>' +
      '<div style="flex:0"><button class="btn danger" data-resolve="0" data-id="' +
        esc(c.entity_id) + '" data-type="' + c.entity_type + '">裁决为未完成</button></div></div></div>'
    ).join('') : '<p class="muted">暂无冲突</p>';
    document.querySelectorAll('button[data-resolve]').forEach(b => b.onclick = async () => {
      await API.post('/api/progress/resolve', {
        entity_type: b.dataset.type, entity_id: b.dataset.id,
        completed: b.dataset.resolve === '1',
      });
      renderServer(); toast('已记录裁决事件（事件合并采用）');
    });
    renderLocal();
  }

  document.getElementById('btn-sync').onclick = async () => {
    if (!GQStore.isLoggedIn()) { toast('请先登录；或使用“合并匿名进度”', 'warn'); return; }
    try { const r = await GQSync.pushAll(false); if (r) renderServer(); }
    catch (e) { toast(e.message, 'warn'); }
  };
  document.getElementById('btn-merge-top').onclick = () => GQAuth.mergeAnonymous();
  document.getElementById('btn-refresh').onclick = renderServer;

  try { await renderServer(); } catch (e) { renderLocal(); }
})();
