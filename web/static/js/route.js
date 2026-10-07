(async function () {
  let route;
  const titleOf = {};
  async function load() {
    route = await API.get('/api/route');
    route.nodes.forEach(n => titleOf[n.id] = n.title);
    renderNodes(); renderEdges(); renderForm();
  }
  function renderNodes() {
    document.getElementById('nodes').innerHTML = route.nodes.map(n => {
      const pre = route.edges[n.id] || [];
      const done = GQStore.isCompleted('node', n.id);
      return '<div class="card"><label style="display:flex;gap:8px;align-items:center;margin:0">' +
        '<input type="checkbox" class="chk" ' + (done ? 'checked' : '') +
        ' data-type="node" data-id="' + esc(n.id) + '" style="width:auto;transform:scale(1.3);accent-color:#496b45">' +
        '<span><b>' + esc(n.id) + ' · ' + esc(n.title) + '</b></span></label>' +
        '<p class="small">' + esc(n.detail || '') + '</p>' +
        '<div class="small muted">先修：' +
        (pre.length ? pre.map(p => '<span class="tag">' + esc(p) + ' ' + esc(titleOf[p] || '') + '</span>').join('')
                    : '<span>无（入门起点）</span>') + '</div></div>';
    }).join('');
    els('.chk').forEach(cb => cb.onchange = () =>
      toggleProgress(cb.dataset.type, cb.dataset.id, cb, loadMissing));
  }
  function renderEdges() {
    const lines = [];
    Object.keys(route.edges).sort().forEach(node => {
      (route.edges[node] || []).forEach(pre => {
        lines.push('<div class="edge"><b>' + esc(node) + ' ' + esc(titleOf[node] || '') +
          '</b><span class="arrow">需先修 →</span>' + esc(pre) + ' ' + esc(titleOf[pre] || '') + '</div>');
      });
    });
    document.getElementById('edges').innerHTML = lines.join('') || '<p class="muted">暂无先修关系</p>';
  }
  function renderForm() {
    const sel1 = document.getElementById('edge-node'), sel2 = document.getElementById('edge-prereq');
    const opts = route.nodes.map(n => '<option value="' + n.id + '">' + n.id + ' ' + esc(n.title) + '</option>').join('');
    sel1.innerHTML = opts; sel2.innerHTML = opts;
    document.getElementById('btn-add-edge').onclick = async () => {
      const node_id = sel1.value, prereq_id = sel2.value;
      const msg = document.getElementById('edge-msg');
      try {
        await API.post('/api/route/edges', { node_id, prereq_id });
        msg.innerHTML = '<div class="alert ok">已添加：' + node_id + ' → ' + prereq_id + '</div>';
        load();
      } catch (e) {
        const cyc = e.data && e.data.cycle;
        msg.innerHTML = '<div class="alert err">' + esc(e.message) +
          (cyc ? '<br>环路径：' + esc(cyc.join(' → ')) : '') + '</div>';
      }
    };
  }
  function loadMissing() { /* 后台 /我的进度页面查看依赖缺项汇总 */ }
  load().catch(e => document.getElementById('nodes').innerHTML =
    '<div class="alert err">' + esc(e.message) + '</div>');
})();
