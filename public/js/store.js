'use strict';
// 匿名本地进度：事件队列。离线操作先入队，上线后整队列同步，服务端按 eventId 去重。
(function () {
  const KEY_CLIENT = 'guqin.clientId';
  const KEY_QUEUE = 'guqin.eventQueue';
  const KEY_SESSION = 'guqin.session';

  function clientId() {
    let id = localStorage.getItem(KEY_CLIENT);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(KEY_CLIENT, id);
    }
    return id;
  }
  function queue() { try { return JSON.parse(localStorage.getItem(KEY_QUEUE) || '[]'); } catch { return []; } }
  function saveQueue(q) { localStorage.setItem(KEY_QUEUE, JSON.stringify(q)); }

  function uuid() {
    return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // 本地对 target 的“最后已知完成态”，作为离线并发 base
  function knownState() {
    try { return JSON.parse(localStorage.getItem('guqin.knownState') || '{}'); } catch { return {}; }
  }
  function setKnown(target, done) {
    const s = knownState(); s[target] = done;
    localStorage.setItem('guqin.knownState', JSON.stringify(s));
  }

  const GuqinStore = {
    clientId,
    session() { try { return JSON.parse(localStorage.getItem(KEY_SESSION) || 'null'); } catch { return null; } },
    setSession(s) { s ? localStorage.setItem(KEY_SESSION, JSON.stringify(s)) : localStorage.removeItem(KEY_SESSION); },
    loggedIn() { return !!this.session(); },

    record(target, type) {
      const state = knownState();
      const e = {
        id: uuid(),
        target,
        type,                       // 'check' | 'uncheck'
        ts: Date.now(),
        deviceId: clientId(),
      };
      if (target in state) e.base = state[target];
      const q = queue(); q.push(e); saveQueue(q);
      setKnown(target, type === 'check');
      return e;
    },
    queuedEvents() { return queue(); },
    queuedCount() { return queue().length; },
    clearQueue() { saveQueue([]); },

    online() { return navigator.onLine; },

    // 同步队列；离线时不报错，等下次 flush
    async flush(api) {
      const q = queue();
      if (!q.length) return { skipped: true };
      if (!navigator.onLine) return { offline: true, pending: q.length };
      const body = { events: q };
      if (!this.loggedIn()) body.clientId = clientId();
      const r = await api.post('/api/progress/events', body);
      // 服务端已按 id 去重，整队列清空（其中含被判定冗余/重复的条目）
      this.clearQueue();
      if (r.state) {
        const s = knownState();
        for (const [t, c] of Object.entries(r.state)) s[t] = c.done;
        localStorage.setItem('guqin.knownState', JSON.stringify(s));
      }
      return r;
    },

    knownState, setKnown,
  };
  window.GuqinStore = GuqinStore;
})();
