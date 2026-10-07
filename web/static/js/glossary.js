(async function () {
  const termBox = document.getElementById('terms');
  const srcBox = document.getElementById('sources');

  async function loadTerms(q) {
    const rows = await API.get('/api/terms' + (q ? '?q=' + encodeURIComponent(q) : ''));
    termBox.innerHTML = rows.map(t =>
      '<div class="card" data-id="' + t.id + '"><h3>' + esc(t.term) +
      (t.pinyin ? ' <span class="small muted">' + esc(t.pinyin) + '</span>' : '') + '</h3>' +
      '<p>' + esc(t.definition) + '</p>' +
      '<div class="small muted">更新于 ' + fmt(t.updated_at) + '</div></div>').join('');
  }
  async function loadSources() {
    const rows = await API.get('/api/sources');
    srcBox.innerHTML = rows.map(s =>
      '<div class="card"><h3>' + esc(s.title) + '</h3>' +
      '<p class="small muted">' + [s.dynasty, s.author, s.kind].filter(Boolean).map(esc).join(' · ') + '</p>' +
      (s.note ? '<p class="small">' + esc(s.note) + '</p>' : '') + '</div>').join('');
  }
  document.getElementById('q').oninput = (() => {
    let tm; return e => { clearTimeout(tm); tm = setTimeout(() => loadTerms(e.target.value.trim()), 200); };
  })();
  document.getElementById('tab-terms').onclick = () => switchTab('terms');
  document.getElementById('tab-sources').onclick = () => switchTab('sources');
  function switchTab(name) {
    document.getElementById('pane-terms').style.display = name === 'terms' ? '' : 'none';
    document.getElementById('pane-sources').style.display = name === 'sources' ? '' : 'none';
    document.getElementById('tab-terms').classList.toggle('active', name === 'terms');
    document.getElementById('tab-sources').classList.toggle('active', name === 'sources');
  }

  /* 后台持久管理：新增术语/来源（admin） */
  API.get('/api/auth/me').then(me => {
    if (me.role !== 'admin') return;
    document.getElementById('admin-terms').innerHTML =
      '<div class="card"><h3>新增术语</h3><div class="row">' +
      '<div><label>术语</label><input id="t-term"></div>' +
      '<div><label>拼音</label><input id="t-pinyin"></div>' +
      '<div style="flex:2"><label>释义</label><input id="t-def"></div>' +
      '<div style="flex:0"><button class="btn" id="btn-add-term">添加</button></div></div></div>';
    document.getElementById('admin-sources').innerHTML =
      '<div class="card"><h3>新增来源</h3><div class="row">' +
      '<div style="flex:2"><label>书名</label><input id="s-title"></div>' +
      '<div><label>作者</label><input id="s-author"></div>' +
      '<div><label>朝代</label><input id="s-dynasty"></div>' +
      '<div><label>类型</label><input id="s-kind" placeholder="琴谱/琴论"></div>' +
      '<div style="flex:0"><button class="btn" id="btn-add-src">添加</button></div></div></div>';
    document.getElementById('btn-add-term').onclick = async () => {
      try {
        await API.post('/api/terms', {
          term: document.getElementById('t-term').value.trim(),
          pinyin: document.getElementById('t-pinyin').value.trim(),
          definition: document.getElementById('t-def').value.trim(),
        });
        document.getElementById('t-term').value = '';
        document.getElementById('t-def').value = '';
        loadTerms(document.getElementById('q').value.trim());
        toast('术语已保存');
      } catch (e) { toast(e.message, 'warn'); }
    };
    document.getElementById('btn-add-src').onclick = async () => {
      try {
        await API.post('/api/sources', {
          title: document.getElementById('s-title').value.trim(),
          author: document.getElementById('s-author').value.trim(),
          dynasty: document.getElementById('s-dynasty').value.trim(),
          kind: document.getElementById('s-kind').value.trim(),
        });
        loadSources(); toast('来源已保存');
      } catch (e) { toast(e.message, 'warn'); }
    };
  }).catch(() => {});

  loadTerms(); loadSources();
})();
