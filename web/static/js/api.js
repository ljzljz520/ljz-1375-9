/* 轻量 fetch 封装：自动带 token、JSON 解析、离线判断。 */
(function () {
  async function request(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    const token = window.GQStore.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let resp;
    try {
      resp = await fetch(path, {
        method, headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch (networkErr) {
      const err = new Error('网络不可用（离线），已保存在本地');
      err.offline = true; throw err;
    }
    let data = {};
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      const err = new Error(data.error || ('HTTP ' + resp.status));
      err.status = resp.status; err.data = data; throw err;
    }
    return data.data;
  }
  window.API = {
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b || {}),
    put: (p, b) => request('PUT', p, b || {}),
    del: p => request('DELETE', p),
  };
})();
