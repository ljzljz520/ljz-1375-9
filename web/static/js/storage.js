/* 匿名本地进度：localStorage 事件队列 + 状态快照。离线可勾选，上线后同步。 */
(function () {
  const KEY_TOKEN = 'guqin.token';
  const KEY_DEVICE = 'guqin.deviceId';
  const KEY_EVENTS = 'guqin.localEvents';
  const KEY_SNAPS = 'guqin.localSnapshots';
  const KEY_PROJ = 'guqin.localProjection';
  const KEY_ANON = 'guqin.anonId';
  const SEP = '::';

  function uuid() {
    return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }
  function read(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  }
  function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function keyOf(type, id) { return type + SEP + id; }

  const Store = {
    getToken: () => localStorage.getItem(KEY_TOKEN),
    setToken: t => t ? localStorage.setItem(KEY_TOKEN, t) : localStorage.removeItem(KEY_TOKEN),
    deviceId() {
      let d = localStorage.getItem(KEY_DEVICE);
      if (!d) { d = 'dev-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY_DEVICE, d); }
      return d;
    },
    anonId() {
      let a = localStorage.getItem(KEY_ANON);
      if (!a) { a = 'anon-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY_ANON, a); }
      return a;
    },
    isLoggedIn() { return !!this.getToken(); },

    record(entityType, entityId, completed) {
      const events = read(KEY_EVENTS, []);
      const ev = {
        client_event_id: uuid(),
        entity_type: entityType, entity_id: entityId,
        action: completed ? 'check' : 'uncheck',
        occurred_at: new Date().toISOString(),
        device_id: this.deviceId(), anon_id: this.anonId(),
      };
      events.push(ev); write(KEY_EVENTS, events);
      const snaps = read(KEY_SNAPS, []);
      snaps.push({ entity_type: entityType, entity_id: entityId, completed: !!completed,
                   modified_at: ev.occurred_at, device_id: this.deviceId(), anon_id: this.anonId() });
      write(KEY_SNAPS, snaps);
      this.applyProjection(ev);
      return ev;
    },
    applyProjection(ev) {
      const p = read(KEY_PROJ, {});
      const k = keyOf(ev.entity_type, ev.entity_id);
      const cur = p[k];
      if (!cur || ev.occurred_at >= cur.last_occurred_at) {
        p[k] = { completed: ev.action === 'check', last_occurred_at: ev.occurred_at,
                 last_device_id: ev.device_id };
      }
      write(KEY_PROJ, p);
    },
    projection() { return read(KEY_PROJ, {}); },
    isCompleted(type, id) {
      const v = read(KEY_PROJ, {})[keyOf(type, id)];
      return !!(v && v.completed);
    },
    localEvents() { return read(KEY_EVENTS, []); },
    localSnapshots() { return read(KEY_SNAPS, []); },
    pendingCount() { return read(KEY_EVENTS, []).filter(e => !e.synced).length; },
    markSynced(clientIds) {
      const s = new Set(clientIds || []);
      const evs = read(KEY_EVENTS, []).filter(e => !s.has(e.client_event_id));
      write(KEY_EVENTS, evs);
      const sn = read(KEY_SNAPS, []);
      write(KEY_SNAPS, sn.slice(-200));
    },
    replaceProjection(states) {
      const p = {};
      (states || []).forEach(s => {
        p[keyOf(s.entity_type, s.entity_id)] = {
          completed: !!s.completed, last_occurred_at: s.last_occurred_at,
          last_device_id: s.last_device_id, conflict: !!s.conflict_flag };
      });
      write(KEY_PROJ, p);
    },
    clearAnonymous() { write(KEY_EVENTS, []); write(KEY_SNAPS, []); write(KEY_PROJ, {}); }
  };
  window.GQStore = Store;
})();
