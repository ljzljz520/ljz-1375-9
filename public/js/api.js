'use strict';
(function () {
  const Api = {
    async request(method, url, body) {
      const headers = { 'Accept': 'application/json' };
      const sess = window.GuqinStore && GuqinStore.session();
      if (sess) headers['Authorization'] = 'Bearer ' + sess.token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const resp = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await resp.text();
      let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!resp.ok) {
        const err = new Error((data && data.error) || ('HTTP ' + resp.status));
        err.status = resp.status; err.data = data;
        throw err;
      }
      return data;
    },
    get(u) { return this.request('GET', u); },
    post(u, b) { return this.request('POST', u, b || {}); },
    put(u, b) { return this.request('PUT', u, b || {}); },
    del(u, b) { return this.request('DELETE', u, b); },
  };
  window.Api = Api;
})();
