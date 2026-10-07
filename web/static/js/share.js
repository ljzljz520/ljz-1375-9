/* 分享落地页：打印与音频均由服务端许可控制；无授权音频仍可阅读。 */
(async function () {
  const token = document.getElementById('root').dataset.token;
  const root = document.getElementById('root');
  let meta, player;
  try {
    meta = await API.get('/api/share/' + token + '/meta');
  } catch (e) {
    root.innerHTML = '<div class="alert err">分享链接无效、已撤销或已过期：' + esc(e.message) + '</div>';
    return;
  }
  const perm = meta.permissions;
  root.innerHTML =
    '<h1>《' + esc(meta.score.title) + '》<span class="tag">分享版 ' + esc(meta.version.version) + '</span></h1>' +
    '<p class="muted">' + esc(meta.score.attribution || '') + '</p>' +
    '<div class="alert ' + (perm.print ? 'ok' : 'warn') + '">打印权限：' +
      (perm.print ? '已授予（服务端已放行）' : '未授予，打印请求会被服务端拒绝') + '</div>' +
    (perm.audio_ids.length
      ? '<div class="player"><div class="controls"><b>音频</b>' +
        perm.audio_ids.map(a => '<button class="btn" data-audio="' + esc(a) + '">播放 ' + esc(a) + '</button>').join('') +
        '<span class="speed"><label>减速</label><select id="speed">' +
        [0.5, 0.65, 0.75, 0.9, 1].map(r => '<option value="' + r + '"' + (r === 0.75 ? ' selected' : '') + '>' + r + '×</option>').join('') +
        '</select></span></div><audio controls style="width:100%;margin-top:10px" id="share-audio"></audio></div>'
      : '<div class="alert warn">本分享不包含音频授权，可无音频阅读。</div>') +
    '<h2>谱段</h2><div>' + meta.sections.map(sec =>
      '<div class="section"><div style="flex:1"><b>' + esc(sec.code) + ' · ' + esc(sec.label) + '</b>' +
      '<div class="notation">' + esc(sec.notation || '') + '</div>' +
      (sec.has_timecode
        ? '<span class="small muted">媒体时间 ' + sec.t_in + '–' + sec.t_out + '</span>'
        : '<span class="no-timecode">⚠ 媒体缺时码，仅文本</span>') +
      '</div></div>').join('') + '</div>' +
    '<div class="no-print" style="margin-top:18px"><button class="btn" id="btn-print-share">按许可打印谱例</button></div>';

  player = GQPlayer({ sections: meta.sections });
  document.getElementById('btn-print-share').onclick = async () => {
    try {
      await API.post('/api/share/' + token + '/print', {});
      window.print();
    } catch (e) { alert('打印被服务端拒绝：' + e.message); }
  };
  document.querySelectorAll('button[data-audio]').forEach(b => b.onclick = async () => {
    try {
      const r = await API.post('/api/share/' + token + '/audio/' + b.dataset.audio + '/cache-key', {});
      const a = document.getElementById('share-audio');
      a.src = r.stream_url;
      a.playbackRate = parseFloat(document.getElementById('speed').value);
      a.play();
      toast('音频按分享白名单授权加载');
    } catch (e) { alert('音频被拒绝：' + e.message); }
  });
  const sp = document.getElementById('speed');
  if (sp) sp.onchange = () => { const a = document.getElementById('share-audio'); a.playbackRate = parseFloat(sp.value); };
})();
