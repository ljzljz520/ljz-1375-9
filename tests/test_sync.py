"""事件合并 vs 最后修改覆盖、去重。"""
from app.sync import dedupe_events, fold_event_merge, apply_lww, reconcile


def test_dedupe_by_client_event_id():
    evs = [
        {"entity_type": "section", "entity_id": "x", "action": "check",
         "occurred_at": "2026-10-01T00:00:00+00:00", "device_id": "d1", "client_event_id": "c1"},
        {"entity_type": "section", "entity_id": "x", "action": "check",
         "occurred_at": "2026-10-01T00:00:00+00:00", "device_id": "d1", "client_event_id": "c1"},
    ]
    out, dup = dedupe_events(evs)
    assert len(out) == 1 and dup == 1


def test_event_merge_latest_wins_by_occurred_at():
    events = [
        {"entity_type": "section", "entity_id": "x", "action": "check",
         "occurred_at": "2026-10-01T00:00:00+00:00", "device_id": "A"},
        {"entity_type": "section", "entity_id": "x", "action": "uncheck",
         "occurred_at": "2026-10-02T00:00:00+00:00", "device_id": "B"},
        {"entity_type": "section", "entity_id": "x", "action": "check",
         "occurred_at": "2026-10-03T00:00:00+00:00", "device_id": "A"},
    ]
    merged = fold_event_merge(events)
    assert merged[("section", "x")]["completed"] is True
    assert merged[("section", "x")]["last_device_id"] == "A"


def test_conflict_when_lww_differs_from_event_merge():
    # 设备 A：事件时间晚但先同步；设备 B：快照修改时间戳更晚 → 两策略分歧
    events = [
        {"entity_type": "section", "entity_id": "x", "action": "uncheck",
         "occurred_at": "2026-10-05T10:00:00+00:00", "device_id": "A", "received_at": "2026-10-05T10:01"},
    ]
    snapshots = [
        {"entity_type": "section", "entity_id": "x", "completed": True,
         "modified_at": "2026-10-05T11:00:00+00:00", "device_id": "B"},
    ]
    rows, conflicts = reconcile(events, snapshots)
    assert conflicts == 1
    row = rows[0]
    assert row["completed"] == 0          # 权威：事件合并
    assert row["lww_completed"] == 1      # 对照：最后修改覆盖
    assert row["conflict_flag"] == 1


def test_no_conflict_when_strategies_agree():
    events = [{"entity_type": "node", "entity_id": "R1", "action": "check",
               "occurred_at": "2026-10-05T11:30:00+00:00", "device_id": "A"}]
    snaps = [{"entity_type": "node", "entity_id": "R1", "completed": True,
              "modified_at": "2026-10-05T11:30:00+00:00", "device_id": "A"}]
    rows, conflicts = reconcile(events, snaps)
    assert conflicts == 0 and rows[0]["completed"] == 1
