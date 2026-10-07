"""跨设备学习记录：幂等去重、事件合并、最后修改覆盖对照与冲突检测。

事件合并(authoritative)：同一实体按 occurred_at 排序，最后一条 check/uncheck 决定完成态。
最后修改覆盖(LWW)：设备上报状态快照 {entity, completed, modified_at}，时间戳最大者覆盖。
两者结果不一致时标记冲突，采用事件合并结果，保留 LWW 结果供审计/人工裁决。
"""
from collections import OrderedDict


def dedupe_events(new_events, seen_client_ids=None):
    """按 client_event_id 幂等；无该键时按内容指纹去重。保持到达顺序。"""
    seen_client_ids = set(seen_client_ids or ())
    seen_fingerprint, out = set(), []
    dup = 0
    for e in new_events:
        cid = e.get("client_event_id")
        if cid:
            if cid in seen_client_ids:
                dup += 1
                continue
            seen_client_ids.add(cid)
        fp = (e["entity_type"], e["entity_id"], e["action"],
              e["occurred_at"], e.get("device_id"))
        if fp in seen_fingerprint:
            dup += 1
            continue
        seen_fingerprint.add(fp)
        out.append(e)
    return out, dup


def fold_event_merge(events):
    """事件合并：每个实体取 occurred_at 最晚（平手看 received_at、device_id）的动作。"""
    def sort_key(e):
        return (e["occurred_at"], e.get("received_at", ""), e.get("device_id") or "")
    latest = {}
    for e in events:
        k = (e["entity_type"], e["entity_id"])
        if k not in latest or sort_key(e) > sort_key(latest[k]):
            latest[k] = e
    return {k: {"completed": e["action"] == "check",
                "last_occurred_at": e["occurred_at"],
                "last_device_id": e.get("device_id")}
            for k, e in latest.items()}


def apply_lww(snapshots):
    """最后修改覆盖：按 modified_at（平手 device_id）取最新快照。"""
    out = {}
    for s in snapshots:
        k = (s["entity_type"], s["entity_id"])
        cur = out.get(k)
        key = (s.get("modified_at", ""), s.get("device_id") or "")
        if cur is None or key > (cur[0], cur[1]):
            out[k] = (s.get("modified_at", ""), s.get("device_id"),
                      bool(s["completed"]))
    return {k: {"completed": v[2], "lww_state_ts": v[0], "lww_completed": int(v[2])}
            for k, v in out.items()}


def reconcile(events, snapshots):
    """返回实体状态列表：事件合并为权威结果，附 LWW 对照与冲突标记。"""
    merged, lww = fold_event_merge(events), apply_lww(snapshots)
    keys = sorted(set(merged) | set(lww))
    rows = []
    conflicts = 0
    for k in keys:
        m, l = merged.get(k), lww.get(k)
        if m is None:
            # 只有快照、没有事件（极端情况）：以 LWW 落值，不判冲突
            rows.append(_row(k, l["completed"], None, None,
                             l["lww_completed"], l["lww_state_ts"], False,
                             "仅有状态快照，按最后修改覆盖落值"))
            continue
        conflict = l is not None and l["completed"] != m["completed"]
        if conflict:
            conflicts += 1
            detail = (f"事件合并={m['completed']} 与最后修改覆盖={l['completed']} 不一致；"
                      f"采用事件合并，待人工裁决")
        else:
            detail = "两种策略一致" if l is not None else "无快照，按事件合并"
        rows.append(_row(k, m["completed"], m["last_occurred_at"],
                         m["last_device_id"],
                         l["lww_completed"] if l else None,
                         l["lww_state_ts"] if l else None,
                         conflict, detail))
    return rows, conflicts


def _row(k, completed, last_ts, last_dev, lww_completed, lww_ts, conflict, detail):
    return {
        "entity_type": k[0], "entity_id": k[1],
        "completed": int(bool(completed)),
        "last_occurred_at": last_ts, "last_device_id": last_dev,
        "lww_completed": lww_completed, "lww_state_ts": lww_ts,
        "conflict_flag": int(conflict), "conflict_detail": detail,
    }
