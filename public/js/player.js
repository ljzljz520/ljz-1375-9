'use strict';
// 谱例锚点 <-> 媒体时间 同步：
//  - 点段落 -> 跳转时码；点播放段落高亮跟随
//  - 缺时码/时码数与段落数不一致：降级为仅高亮，不做跳转
//  - 旧版本授权到期：manifest 即 410，播放器区域显示“无音频可读”，缓存 URL 也无法恢复
(function () {
  function renderAudioPlayer(mount, manifest, onActiveSection) {
    mount.innerHTML = '';
    if (!manifest.media) {
      mount.innerHTML = '<p class="muted">本版本无配套音频，谱例可正常阅读与勾选。</p>';
      return { setActive() {} };
    }
    const media = manifest.media;
    const sections = manifest.sections;
    const codes = media.timecodes || [];
    const syncMode = media.anchorSync; // full | highlight-only | none

    const bar = document.createElement('div');
    bar.className = 'speedbar no-print';
    bar.innerHTML = '<span class="muted">减速：</span>';
    [1, 0.75, 0.5].forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'btn ghost' + (i === 0 ? '' : '');
      b.textContent = r + '×';
      b.onclick = () => { audio.playbackRate = r; [...bar.querySelectorAll('button')].forEach((x) => x.classList.remove('active-speed')); b.style.background = 'var(--qin)'; b.style.color = '#fff'; toast('播放速率 ' + r + '×'); };
      if (i === 0) b.style.background = 'var(--qin)', b.style.color = '#fff';
      bar.appendChild(b);
    });
    mount.appendChild(bar);

    const audio = document.createElement('audio');
    audio.className = 'qin-audio';
    audio.controls = true;
    audio.preload = 'none';
    audio.src = media.streamUrl;
    mount.appendChild(audio);

    let failed = false;
    audio.addEventListener('error', () => {
      if (failed) return; failed = true;
      mount.querySelectorAll('.audio-note').forEach((n) => n.remove());
      const note = document.createElement('p');
      note.className = 'audio-note bad';
      note.textContent = '音频取流被拒绝（可能授权已到期）。即使本机曾缓存该索引，也无法重新取流。';
      mount.appendChild(note);
    });

    if (syncMode !== 'full') {
      const warn = document.createElement('p');
      warn.className = 'muted audio-note';
      warn.textContent = syncMode === 'highlight-only'
        ? '提示：媒体缺少与段落一一对应的时间码（缺时码），段落按钮仅高亮当前位置，不自动跳转。'
        : '提示：该媒体无时间码锚点。';
      mount.appendChild(warn);
    }

    let activeIdx = -1;
    function poll() {
      const t = audio.currentTime;
      let idx = -1;
      for (let i = 0; i < codes.length; i++) {
        if (codes[i] != null && t >= codes[i] && (i === codes.length - 1 || t < codes[i + 1])) idx = i;
      }
      if (idx !== activeIdx) { activeIdx = idx; onActiveSection && onActiveSection(idx, syncMode); }
    }
    audio.addEventListener('timeupdate', poll);

    return {
      setActive(sectionIndex) {
        if (syncMode === 'full' && codes[sectionIndex] != null) {
          audio.currentTime = codes[sectionIndex];   // 段落跳转
          audio.play().catch(() => {});
        } else {
          onActiveSection && onActiveSection(sectionIndex, syncMode);
        }
      },
    };
  }
  window.renderAudioPlayer = renderAudioPlayer;
})();
