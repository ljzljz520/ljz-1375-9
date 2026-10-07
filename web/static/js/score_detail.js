/* 谱例详情：版本切换、谱段锚点勾选、授权音频、分享/打印许可、发布回退（管理员）。 */
(async function () {
  const sid = document.getElementById('root').dataset.sid;
  const root = document.getElementById('root');
  let data = null;
  let player = null;
  let currentAudio = null;   // 当前版本有效音频对象

  function statusBadge(st) {
    return {
      inherited: '<span class="badge ok">满足·继承</span>',
      partial: '<span class="badge warn">部分满足·需补练</span>',
      not_met: '<span class="badge bad">不满足</span>',
      new: '<span class="badge new">新版新增</span>',
      archived: '<span class="badge warn">已归档</span>',
    }[st] || '';
  }

  async function load() {
    data = await API.get('/api/scores/' + sid);
    render();
    initPlayer();
  }

  function initPlayer() {
    player = GQPlayer({ sections: data.sections });
    player.on('tick', ({ activeSectionId }) => {
      els('.section').forEach(node =>
        node.classList.toggle('playing', node.dataset.sid === activeSectionId));
    });
  }

  function render() {
    const s = data.score, v = data.current_version;
    const good = (v && data.versions.find(x => x.id === v.id) || {}).audio || [];
    const expired = (v && data.versions.find(x => x.id === v.id) || {}).expired_audio || [];
    currentAudio = good[0] || null;
    root.innerHTML =
      '<h1>《' + esc(s.title) + '》</h1>' +
      '<p class="muted">' + esc(s.attribution || '') + ' · 当前版本 <b>' +
        esc(v ? v.version : '未发布') + '</b></p>' +
      '<p>' + esc(s.intro || '') + '</p>' +
      versionBar() +
      audioPanel(good, expired) +
      '<h2>谱段（减字谱锚点）</h2>' +
      '<div id="sections">' + sectionsHtml(data.sections) + '</div>' +
      sharePanel() + releaseLogPanel();
    bindSectionClicks();
    bindVersionSwitch();
    bindAdmin();
  }

  function versionBar() {
    return '<div class="tabs no-print">' + data.versions.map(vv =>
      '<button data-vid="' + vv.id + '" class="' + (vv.current ? 'active' : '') + '">' +
      esc(vv.version) + (vv.current ? '（当前）' : '') +
      (vv.expired_audio && vv.expired_audio.length ? ' ⚠授权到期' : '') + '</button>').join('') +
      '</div><p class="small muted" id="vnote">' + esc(data.current_version ? data.current_version.note : '') + '</p>';
  }

  function audioPanel(good, expired) {
    let html = '<div class="player"><div class="controls"><b>音频</b>';
    if (good.length) {
      html += '<button class="btn" id="btn-load-audio">加载并播放：' + esc(good[0].title) + '</button>';
      html += '<span class="speed"><label>减速</label><select id="speed">' +
        [0.5, 0.65, 0.75, 0.9, 1].map(r =>
          '<option value="' + r + '"' + (r === 0.75 ? ' selected' : '') + '>' + r + '×</option>').join('') +
        '</select></span>';
      html += '<span class="small muted">点击谱段“跳转”按锚点时间定位；授权至 ' +
        esc(good[0].license_until ? good[0].license_until.slice(0, 10) : '永久') + '</span>';
    } else {
      html += '<span class="muted small">当前版本暂无可播放音频（可无音频阅读谱例）</span>';
    }
    html += '</div><div id="audio-slot" style="display:none"><audio controls style="width:100%;margin-top:10px"></audio></div>';
    if (expired.length) {
      html += '<div class="alert err" style="margin-bottom:0">旧版本音频授权已于 ' +
        esc(expired[0].license_until) + ' 到期：缓存索引已失效，不能重新取到音频；文字谱例仍可阅读。</div>';
    }
    html += '</div>';
    setTimeout(() => {
      const btn = document.getElementById('btn-load-audio');
      if (btn) btn.onclick = loadAudio;
      const sp = document.getElementById('speed');
      if (sp) sp.onchange = () => player && player.setSpeed(parseFloat(sp.value));
    }, 0);
    return html;
  }

  async function loadAudio() {
    if (!currentAudio) return;
    try {
      await player.load(currentAudio.id);
      const slot = document.getElementById('audio-slot');
      slot.style.display = 'block';
      const native = slot.querySelector('audio');
      native.src = player.audioEl.src;
      native.playbackRate = player.audioEl.playbackRate;
      // 同步：原生控件与内部播放器互相同步速率与跳转
      native.onplay = () => { player.audioEl.currentTime = native.currentTime; };
      await player.play();
      native.currentTime = player.audioEl.currentTime;
      toast('音频已按授权缓存键加载，缓存到期或授权到期即失效');
    } catch (e) {
      toast('音频不可用：' + e.message, 'warn');
    }
  }

  function sectionsHtml(secs) {
    return secs.map(sec => {
      const done = GQStore.isCompleted('section', sec.id);
      return '<div class="section" data-sid="' + esc(sec.id) + '">' +
        '<input type="checkbox" class="chk" ' + (done ? 'checked' : '') +
          ' data-type="section" data-id="' + esc(sec.id) + '" title="完成此谱段">' +
        '<div style="flex:1"><b>' + esc(sec.code) + ' · ' + esc(sec.label) + '</b>' +
        '<div class="notation">' + esc(sec.notation || '（无文本）') + '</div>' +
        (sec.has_timecode
          ? '<span class="small muted">媒体时间 ' + playerFmt(sec.t_in) + '–' + playerFmt(sec.t_out) + '</span>'
          : '<span class="no-timecode">⚠ 媒体缺时码：不可跳转/自动锚定，仅文本阅读</span>') +
        '</div>' +
        (sec.has_timecode
          ? '<button class="btn secondary jump" data-tin="' + sec.t_in + '">跳转播放</button>'
          : '<button class="btn secondary jump" disabled title="缺时码">无锚点</button>') +
        '</div>';
    }).join('');
  }
  function playerFmt(t) { return t == null ? '—' : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }

  function bindSectionClicks() {
    els('#sections .chk').forEach(cb => cb.onchange = () =>
      toggleProgress(cb.dataset.type, cb.dataset.id, cb));
    els('#sections .jump').forEach(btn => btn.onclick = () => {
      if (!player || !player.hasAudio) { toast('请先加载音频；无音频仍可阅读', 'warn'); return; }
      const node = btn.closest('.section');
      const sec = data.sections.find(x => x.id === node.dataset.sid);
      const ok = player.jumpTo(sec);
      if (!ok) toast('该段落缺少时码，无法跳转', 'warn');
    });
  }

  function bindVersionSwitch() {
    els('.tabs button').forEach(b => b.onclick = async () => {
      const vid = parseInt(b.dataset.vid, 10);
      if (data.current_version && data.current_version.id === vid) return;
      // 只读查看其他版本（发布/回退由管理员操作）；切换视图重新拉版本详情
      try {
        const detail = await API.get('/api/scores/' + sid + '/versions/' + vid);
        data.sections = detail.sections.map(x => ({
          id: x.id, code: x.code, label: x.label, notation: x.notation,
          t_in: x.t_in, t_out: x.t_out, has_timecode: !!x.has_timecode,
        }));
        data.current_version = detail.version;
        render();
      } catch (e) { toast('切换版本失败：' + e.message, 'warn'); }
    });
  }

  function sharePanel() {
    return '<h2>分享 / 打印（服务端许可）</h2><div class="card no-print">' +
      '<label class="small" style="display:inline"><input type="checkbox" id="sh-print" style="width:auto"> 允许打印</label>' +
      '<label class="small" style="display:inline;margin-left:14px">授权音频（白名单）</label>' +
      '<select id="sh-audios" multiple style="width:100%;height:64px;margin-top:4px">' +
        data.versions.flatMap(vv => vv.audio.map(a =>
          '<option value="' + esc(a.id) + '">' + esc(a.title) + '（' + esc(vv.version) + '）</option>')).join('') +
      '</select>' +
      '<div style="margin-top:8px"><button class="btn" id="btn-share">生成分享链接</button> ' +
      '<button class="btn secondary" id="btn-test-print">按当前许可测试打印</button></div>' +
      '<div id="share-out" class="small" style="margin-top:8px"></div></div>';
    setTimeout(bindShare, 0);
  }

  function bindShare() {
    const btnS = document.getElementById('btn-share');
    if (!btnS) return;
    btnS.onclick = async () => {
      if (!GQStore.isLoggedIn()) { toast('请先登录再生成分享链接', 'warn'); return; }
      const audios = Array.from(document.getElementById('sh-audios').selectedOptions).map(o => o.value);
      try {
        const r = await API.post('/api/share', {
          score_id: sid, allow_print: document.getElementById('sh-print').checked,
          allowed_audios: audios,
        });
        document.getElementById('share-out').innerHTML =
          '分享链接（服务端控制打印/音频）：<a href="' + esc(r.url) + '" target="_blank">' +
          location.origin + esc(r.url) + '</a>';
      } catch (e) { toast('生成失败：' + e.message, 'warn'); }
    };
    document.getElementById('btn-test-print').onclick = async () => {
      const link = (document.getElementById('share-out').textContent.match(/\/share\/[\w-]+/) || [])[0];
      if (!link) { toast('请先生成分享链接', 'warn'); return; }
      const token = link.split('/').pop();
      try {
        await API.post('/api/share/' + token + '/print', {});
        toast('许可通过，可打印'); window.print();
      } catch (e) { toast('打印被拒绝：' + e.message, 'warn'); }
    };
  }

  function releaseLogPanel() {
    setTimeout(async () => {
      try {
        const rels = await API.get('/api/scores/' + sid + '/releases');
        const box = document.getElementById('release-log');
        if (box) box.innerHTML = rels.map(r =>
          '<div class="edge">' + esc(r.created_at) +
          ' <span class="badge ' + (r.action === 'rollback' ? 'warn' : 'ok') + '">' +
          esc(r.action) + '</span> 版本#' + r.to_version_id +
          (r.from_version_id ? '（自 #' + r.from_version_id + '）' : '') +
          ' — ' + esc(r.reason || '') + '</div>').join('');
      } catch (e) {}
      bindAdmin();
    }, 50);
    return '<h2>发布记录（可审计）</h2><div id="release-log" class="graph"></div>' +
      '<div id="admin-panel" class="no-print"></div>';
  }

  function bindAdmin() {
    const panel = document.getElementById('admin-panel');
    if (!panel || panel.dataset.bound) return;
    API.get('/api/auth/me').then(me => {
      if (me.role !== 'admin') return;
      panel.dataset.bound = '1';
      const versions = data.versions.filter(vv => !vv.current);
      panel.innerHTML = '<h2>管理员：发布 / 回退</h2><div class="card">' +
        (versions.map(vv => '<div class="row" style="margin-bottom:8px">' +
          '<div>回退到 <b>' + esc(vv.version) + '</b>' +
          (vv.expired_audio.length ? ' <span class="badge bad">该版本音频授权到期</span>' : '') +
          '</div><button class="btn danger" data-vid="' + vv.id + '">执行回退</button></div>').join('') ||
         '<p class="small muted">当前已为最新版本，无可回退目标（可先发布新版本再回退）。</p>') +
        '<p class="small muted">回退旧版本：文字谱例照常可读；若音频授权到期，服务端立即清除缓存索引并拒绝取音频。</p></div>';
      panel.querySelectorAll('button[data-vid]').forEach(btn => btn.onclick = async () => {
        if (!confirm('确认回退到该版本？系统将为每个用户运行映射迁移判定并记录发布事件。')) return;
        try {
          const r = await API.post('/api/scores/' + sid + '/publish/' + btn.dataset.vid,
            { reason: '管理后台手动回退' });
          alert('回退完成：' + r.release.action +
            (r.release.warnings.length ? '\n告警：\n' + r.release.warnings.join('\n') : ''));
          location.reload();
        } catch (e) { alert('回退失败：' + e.message); }
      });
    }).catch(() => {});
  }

  load().catch(e => { root.innerHTML = '<div class="alert err">加载失败：' + esc(e.message) + '</div>'; });
})();
