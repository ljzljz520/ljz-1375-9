/* 公共工具、在线状态、勾选/同步、打印。 */
(function () {
  window.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  };
  window.fmt = function (t) {
    if (t == null) return '—';
    const d = new Date(t);
    return d.toLocaleString('zh-CN', { hour12: false });
  };
  window.el = (sel, root) => (root || document).querySelector(sel);
  window.els = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* 在线状态 */
  function netBanner() {
    const b = document.createElement('div');
    b.className = 'alert warn no-print';
    b.style.cssText = 'margin:0;text-align:center;border-radius:0;display:none';
    b.textContent = '当前离线：勾选仅保存在本机，恢复联网后请点击“同步进度”';
    document.body.prepend(b);
    function upd() { b.style.display = navigator.onLine ? 'none' : 'block'; }
    window.addEventListener('online', () => { upd(); if (window.GQSync) GQSync.auto(); });
    window.addEventListener('offline', upd); upd();
  }

  /* 勾选一个实体：先本地（离线可用），登录且在线则尽量同步 */
  window.toggleProgress = async function (type, id, checkbox, onConflict) {
    const completed = checkbox.checked;
    GQStore.record(type, id, completed);
    if (!navigator.onLine || !GQStore.isLoggedIn()) {
      toast(navigator.onLine ? '已保存到本机（匿名），可登录后合并到账号'
                             : '离线：已保存到本机，联网后同步');
      return;
    }
    try {
      const r = await GQSync.pushAll();
      if (r && r.conflicts && r.conflicts.length) {
        toast('同步完成，但有 ' + r.conflicts.length + ' 处合并冲突，请到“我的进度”裁决', 'warn');
      } else {
        toast('已同步（事件合并去重）');
      }
      if (onConflict) onConflict(r);
    } catch (e) {
      toast(e.offline ? '离线：已保存到本机' : ('同步失败：' + e.message), 'warn');
    }
  };

  let toastTimer;
  window.toast = function (msg, kind) {
    let t = document.getElementById('gq-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gq-toast';
      t.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(t);
    }
    const d = document.createElement('div');
    d.className = 'alert ' + (kind === 'warn' ? 'warn' : 'ok') + ' no-print';
    d.style.cssText += ';margin:0;min-width:220px';
    d.textContent = msg;
    t.appendChild(d);
    clearTimeout(toastTimer);
    setTimeout(() => d.remove(), 3200);
  };

  document.addEventListener('DOMContentLoaded', () => {
    netBanner();
    const bp = document.getElementById('btn-print');
    if (bp) bp.onclick = () => window.print();
    if (window.GQSync) window.GQSync.auto(true);
  });
})();
