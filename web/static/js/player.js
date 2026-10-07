/* 音频播放：减速、段落跳转、谱段锚点与媒体时间同步。
   - 音频 URL 来自授权缓存键（见 /api/audio/<id>/cache-key）；
   - 缺时码的段落只显示文本，不参与跳转/高亮（媒体缺时码验收点）；
   - 播放速率 0.5~1.0 可调；当前时间穿越锚点区间时高亮对应段落。 */
(function () {
  function fmtTime(sec) {
    if (sec == null || isNaN(sec)) return '—';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  window.GQPlayer = function (opts) {
    const audio = new Audio();
    audio.preload = 'none';
    let sections = opts.sections || [];
    let active = null;
    const listeners = { tick: [], ready: [] };
    let state = { hasAudio: false, speed: 0.75 };

    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      const hit = sections.find(s =>
        s.has_timecode && t >= s.t_in && (s.t_out == null || t < s.t_out));
      const hitId = hit ? hit.id : null;
      if (hitId !== active) {
        active = hitId;
        listeners.tick.forEach(fn => fn({ time: t, activeSectionId: hitId, playing: !audio.paused }));
      }
    });
    audio.addEventListener('loadedmetadata', () => listeners.ready.forEach(fn => fn(audio.duration)));
    audio.addEventListener('ended', () => listeners.tick.forEach(fn =>
      fn({ time: audio.currentTime, activeSectionId: null, playing: false })));

    return {
      on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); },
      setSections(secs) { sections = secs; },
      async load(audioId) {
        if (!GQStore.isLoggedIn()) {
          throw new Error('播放音频需登录；不登录仍可阅读谱例文本');
        }
        const r = await API.post('/api/audio/' + encodeURIComponent(audioId) + '/cache-key', {});
        audio.src = r.stream_url;
        state.hasAudio = true; state.cacheExpires = r.expires_at;
        return r;
      },
      play() { return audio.play(); },
      pause() { audio.pause(); },
      jumpTo(sec) {
        if (!sec || !sec.has_timecode) return false;
        if (!state.hasAudio) return false;
        audio.currentTime = sec.t_in;
        audio.playbackRate = state.speed;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
        return true;
      },
      setSpeed(rate) {
        state.speed = rate;
        audio.playbackRate = rate;
      },
      get currentTime() { return audio.currentTime; },
      get hasAudio() { return state.hasAudio; },
      audioEl: audio, fmtTime,
    };
  };
})();
