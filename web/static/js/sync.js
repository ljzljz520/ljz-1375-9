/* 同步：上传本地事件队列 + LWW 快照，接收权威投影与冲突报告。 */
(function () {
  let pushing = false;
  const GQSync = {
    async pushAll(silent) {
      if (!GQStore.isLoggedIn()) return null;
      if (pushing) return null;
      const events = GQStore.localEvents();
      const snapshots = GQStore.localSnapshots();
      if (!events.length && !silent) { toast('没有待同步的本地记录'); return null; }
      if (!events.length) return null;
      pushing = true;
      try {
        const r = await API.post('/api/progress/sync',
          { anon_id: GQStore.anonId(), events, snapshots: snapshots.slice(-events.length - 20) });
        GQStore.markSynced(events.map(e => e.client_event_id));
        GQStore.replaceProjection(r.states);
        if (!silent) {
          toast('同步：接收 ' + (r.report.accepted_events) + ' 事件，去重 ' +
                r.report.duplicates_dropped + '，冲突 ' + r.report.conflicts);
        }
        return r;
      } finally { pushing = false; }
    },
    async pull() {
      if (!GQStore.isLoggedIn()) return null;
      const r = await API.get('/api/progress');
      GQStore.replaceProjection(r.states);
      return r;
    },
    auto(silent) {
      if (GQStore.isLoggedIn() && navigator.onLine) this.pull().catch(() => {});
    }
  };
  window.GQSync = GQSync;
})();
