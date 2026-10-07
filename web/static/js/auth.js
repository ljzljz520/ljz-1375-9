/* 登录/注册小组件：渲染顶栏，提供匿名合并到账号入口。 */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function renderAuthBox() {
    const box = document.getElementById('authbox');
    if (!box) return;
    if (GQStore.isLoggedIn()) {
      API.get('/api/auth/me').then(me => {
        const pending = GQStore.pendingCount();
        box.innerHTML =
          '<span>你好，<b>' + esc(me.username) + '</b>' +
          (me.role === 'admin' ? '（管理员）' : '') + '</span>' +
          '<button class="ghost" id="btn-merge" title="将本机匿名进度合并到账号">合并匿名进度' +
          (pending ? '(' + pending + ')' : '') + '</button>' +
          '<button class="ghost" id="btn-logout">退出</button>';
        document.getElementById('btn-logout').onclick = () => {
          GQStore.setToken(null); location.reload();
        };
        document.getElementById('btn-merge').onclick = mergeAnonymous;
      }).catch(() => {
        GQStore.setToken(null); renderAuthBox();
      });
    } else {
      box.innerHTML =
        '<input id="login-user" placeholder="用户名" style="width:110px">' +
        '<input id="login-pass" type="password" placeholder="密码" style="width:110px">' +
        '<button class="btn" id="btn-login">登录</button>' +
        '<button class="ghost" id="btn-reg">注册</button>' +
        '<span class="small muted" title="无需登录即可在本机保存进度">匿名进度已本地启用</span>';
      document.getElementById('btn-login').onclick = doLogin;
      document.getElementById('btn-reg').onclick = doRegister;
    }
  }

  async function doLogin() {
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;
    try {
      const r = await API.post('/api/auth/login', { username, password });
      GQStore.setToken(r.token);
      location.reload();
    } catch (e) { alert('登录失败：' + e.message); }
  }
  async function doRegister() {
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;
    if (!username || !password) { alert('请输入用户名和密码（密码≥4位）'); return; }
    try {
      await API.post('/api/auth/register', { username, password });
      await doLogin();
    } catch (e) { alert('注册失败：' + e.message); }
  }

  /* 验收点：匿名进度合并到账号。登录后若本地有未同步事件，可一键合并（事件级去重 + 冲突对账）。 */
  async function mergeAnonymous() {
    const events = GQStore.localEvents();
    const snapshots = GQStore.localSnapshots();
    if (!events.length && !snapshots.length) { alert('本机没有待合并的匿名进度'); return; }
    try {
      const r = await API.post('/api/progress/merge-anonymous', {
        anon_id: GQStore.anonId(), events, snapshots,
      });
      GQStore.clearAnonymous();
      GQStore.replaceProjection(r.states);
      alert('合并完成：导入事件 ' + (r.report.imported_events || 0) +
            ' 条，去重丢弃 ' + (r.report.duplicates_dropped || 0) +
            ' 条，检测冲突 ' + (r.report.conflicts || 0) + ' 处');
      location.hash = '#merged';
      location.reload();
    } catch (e) { alert('合并失败：' + e.message); }
  }
  window.GQAuth = { renderAuthBox, mergeAnonymous };

  document.addEventListener('DOMContentLoaded', renderAuthBox);
})();
