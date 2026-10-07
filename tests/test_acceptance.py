"""端到端验收测试：对应用户点名的验收清单。"""
import time
from tests.conftest import auth


# 1) 匿名进度合并到账号
def test_anonymous_progress_merged_into_account(client, user_token):
    anon_events = [
        {"entity_type": "section", "entity_id": "SC1|v1|A", "action": "check",
         "occurred_at": "2026-09-01T08:00:00+00:00", "device_id": "dev-anon",
         "client_event_id": "anon-1", "anon_id": "anonX"},
        {"entity_type": "section", "entity_id": "SC1|v1|B", "action": "check",
         "occurred_at": "2026-09-02T08:00:00+00:00", "device_id": "dev-anon",
         "client_event_id": "anon-2", "anon_id": "anonX"},
    ]
    r = client.post("/api/progress/merge-anonymous",
                    json={"anon_id": "anonX", "events": anon_events, "snapshots": []},
                    headers=auth(user_token))
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["report"]["imported_events"] == 2
    states = {(s["entity_id"]): s["completed"] for s in data["states"]}
    assert states["SC1|v1|A"] == 1 and states["SC1|v1|B"] == 1

    # 再次合并同样事件 → 幂等去重，不产生重复
    r2 = client.post("/api/progress/merge-anonymous",
                     json={"anon_id": "anonX", "events": anon_events, "snapshots": []},
                     headers=auth(user_token))
    assert r2.get_json()["data"]["report"]["duplicates_dropped"] == 2
    assert r2.get_json()["data"]["report"]["imported_events"] == 0


# 2) 两个设备离线勾选 → 同步去重 + 合并
def test_two_devices_offline_then_sync_and_dedupe(client, user_token):
    def dev_events(dev, eid, action, ts):
        return [{"entity_type": "section", "entity_id": "SC3|v1|A", "action": action,
                 "occurred_at": ts, "device_id": dev, "client_event_id": eid}]
    # 设备1离线勾选
    r1 = client.post("/api/progress/sync",
                     json={"events": dev_events("dev1", "e-d1", "check", "2026-10-01T09:00:00+00:00"),
                           "snapshots": []}, headers=auth(user_token))
    assert r1.status_code == 200
    # 设备2晚些取消（事件合并最终态=未完成）
    r2 = client.post("/api/progress/sync",
                     json={"events": dev_events("dev2", "e-d2", "uncheck", "2026-10-02T09:00:00+00:00"),
                           "snapshots": []}, headers=auth(user_token))
    states = {s["entity_id"]: s for s in r2.get_json()["data"]["states"]}
    assert states["SC3|v1|A"]["completed"] == 0
    assert states["SC3|v1|A"]["last_device_id"] == "dev2"

    # 设备1重放同一批（重连/重试）→ client_event_id 去重
    r3 = client.post("/api/progress/sync",
                     json={"events": dev_events("dev1", "e-d1", "check", "2026-10-01T09:00:00+00:00"),
                           "snapshots": []}, headers=auth(user_token))
    assert r3.get_json()["data"]["report"]["duplicates_dropped"] == 1
    # 最终态不被旧事件翻转
    states3 = {s["entity_id"]: s for s in r3.get_json()["data"]["states"]}
    assert states3["SC3|v1|A"]["completed"] == 0


# 2b) 事件合并与最后修改覆盖冲突可见、可裁决
def test_conflict_merge_vs_lww_and_resolve(client, user_token):
    ev = [{"entity_type": "section", "entity_id": "SC2|v1|A", "action": "uncheck",
           "occurred_at": "2026-10-05T10:00:00+00:00", "device_id": "dev1", "client_event_id": "c-1"}]
    snap = [{"entity_type": "section", "entity_id": "SC2|v1|A", "completed": True,
             "modified_at": "2026-10-05T12:00:00+00:00", "device_id": "dev2"}]
    r = client.post("/api/progress/sync", json={"events": ev, "snapshots": snap},
                    headers=auth(user_token))
    data = r.get_json()["data"]
    assert data["report"]["conflicts"] == 1
    assert len(data["conflicts"]) == 1
    # 权威投影采用事件合并 = 未完成
    st = next(s for s in data["states"] if s["entity_id"] == "SC2|v1|A")
    assert st["completed"] == 0 and st["lww_completed"] == 1
    # 人工裁决为完成
    rr = client.post("/api/progress/resolve",
                     json={"entity_type": "section", "entity_id": "SC2|v1|A", "completed": True},
                     headers=auth(user_token))
    assert rr.status_code == 200
    st2 = next(s for s in rr.get_json()["data"]["states"] if s["entity_id"] == "SC2|v1|A")
    assert st2["completed"] == 1


# 3) 谱段拆分：换版迁移结果（v1 -> v2：split/merge/same/new）
def test_score_version_migration_split_and_merge(client, admin_token, user_token):
    # student 在 v1 完成 A、C（B/D 未完成）
    v1_events = []
    for code, ts in [("A", "2026-09-10T08:00:00+00:00"), ("C", "2026-09-11T08:00:00+00:00")]:
        v1_events.append({"entity_type": "section", "entity_id": f"SC1|v1|{code}",
                          "action": "check", "occurred_at": ts, "device_id": "dev1",
                          "client_event_id": f"v1-{code}"})
    client.post("/api/progress/sync", json={"events": v1_events, "snapshots": []},
                headers=auth(user_token))
    # 管理员把 SC1 回退到 v1 再发布回 v2，触发 for-user 迁移判定（用 publish 2→1→2）
    r_rollback = client.post("/api/scores/SC1/publish/1", json={"reason": "验收：回退演示"},
                             headers=auth(admin_token))
    assert r_rollback.status_code == 200
    rb = r_rollback.get_json()["data"]["release"]
    assert rb["action"] == "rollback"
    # 回退到 v1：旧音频 A-LS-v1 授权已到期 → 有告警
    assert any("授权" in w and "缓存索引" in w for w in rb["warnings"])

    r_pub = client.post("/api/scores/SC1/publish/2", json={"reason": "验收：重新发布 v2"},
                        headers=auth(admin_token))
    assert r_pub.status_code == 200
    migrations = r_pub.get_json()["data"]["migrations"]
    # 找到 student 的迁移结果
    statuses = {}
    for m in migrations:
        for row in m["results"]:
            statuses[row["new_code"]] = row["status"]
    # v1 完成 A、C：A→A1/A2 split=partial；B same 但未完成=not_met；
    # C+D→E merge 仅 C 完成=partial；F 无映射=new
    assert statuses["A1"] == "partial"
    assert statuses["A2"] == "partial"
    assert statuses["B"] == "not_met"
    assert statuses["E"] == "partial"
    assert statuses["F"] == "new"
    # 旧完成记录仍然存在（v1 实体记录未被清空）
    prog = client.get("/api/progress", headers=auth(user_token)).get_json()["data"]["states"]
    old = {s["entity_id"]: s["completed"] for s in prog if s["entity_id"].startswith("SC1|v1|")}
    assert old.get("SC1|v1|A") == 1 and old.get("SC1|v1|C") == 1
    # 只有 inherited 才自动完成；这里没有任何 inherited，故新版段均未自动完成
    new = {s["entity_id"]: s["completed"] for s in prog if s["entity_id"].startswith("SC1|v2|")}
    assert all(v == 0 for k, v in new.items())


def test_migration_inherited_only_when_fully_met(client, admin_token, user_token):
    # 回退 v1，完成全部 v1 段，再发布 v2：B same=inherited；E merge 全来源=inherited
    client.post("/api/scores/SC1/publish/1", json={"reason": "rb"}, headers=auth(admin_token))
    evs = []
    for i, code in enumerate(["A", "B", "C", "D"]):
        evs.append({"entity_type": "section", "entity_id": f"SC1|v1|{code}",
                    "action": "check", "occurred_at": f"2026-09-{10+i:02d}T08:00:00+00:00",
                    "device_id": "d", "client_event_id": f"all-{code}"})
    client.post("/api/progress/sync", json={"events": evs, "snapshots": []},
                headers=auth(user_token))
    r = client.post("/api/scores/SC1/publish/2", json={"reason": "pub"}, headers=auth(admin_token))
    statuses = {}
    for m in r.get_json()["data"]["migrations"]:
        for row in m["results"]:
            statuses[row["new_code"]] = row["status"]
    assert statuses["B"] == "inherited"      # same 完整继承
    assert statuses["E"] == "inherited"      # merge 两个来源都完成
    assert statuses["A1"] == "partial"       # split 仍需补练
    assert statuses["F"] == "new"
    # inherited 段自动置完成
    prog = client.get("/api/progress", headers=auth(user_token)).get_json()["data"]["states"]
    done = {s["entity_id"]: s["completed"] for s in prog}
    assert done["SC1|v2|B"] == 1 and done["SC1|v2|E"] == 1
    assert done["SC1|v2|F"] == 0


# 4) 媒体缺时码：API 暴露 has_timecode=false，前端逻辑不跳转
def test_sections_report_missing_timecode(client):
    # SC1 v2 的 A2 段 t_in/t_out 为 NULL
    r = client.get("/api/scores/SC1/versions/2")
    secs = {s["code"]: s for s in r.get_json()["data"]["sections"]}
    assert secs["A2"]["t_in"] is None and secs["A2"]["has_timecode"] is False
    assert secs["A1"]["has_timecode"] is True


# 5) 发布回退 + 旧版本授权到期不能经缓存索引取音频
def test_expired_audio_not_reachable_via_cache(client, admin_token):
    # 当前 v2 使用 A-LS-v2（有效）
    r = client.post("/api/audio/A-LS-v2/cache-key", json={}, headers=auth(admin_token))
    assert r.status_code == 200
    key = r.get_json()["data"]["cache_key"]
    stream = client.get(f"/api/audio/stream/{key}")
    assert stream.status_code == 200 and stream.data[:4] == b"RIFF"

    # 已到期的 A-LS-v1：签发缓存键直接 403
    denied = client.post("/api/audio/A-LS-v1/cache-key", json={}, headers=auth(admin_token))
    assert denied.status_code == 403

    # 手工往缓存索引插一条旧键模拟“曾经缓存过”，回源必须仍被拒绝（410）并清除索引
    from app.db import get_db
    # 通过应用上下文直接插入
    app = client.application
    with app.app_context():
        from app.util import now_iso
        db = get_db()
        db.execute("INSERT INTO audio_cache_index(cache_key,audio_id,created_at,expires_at) VALUES(?,?,?,?)",
                   ("stale-key-xyz", "A-LS-v1", "2020-01-01T00:00:00+00:00",
                    "2030-01-01T00:00:00+00:00"))
        db.commit()
    stale = client.get("/api/audio/stream/stale-key-xyz")
    assert stale.status_code == 410   # 不能通过缓存索引重新取到
    # 再取仍 404/410：索引已清除
    again = client.get("/api/audio/stream/stale-key-xyz")
    assert again.status_code in (404, 410)

    # 回退到 v1 时服务端清除相关缓存索引并给出告警
    rb = client.post("/api/scores/SC1/publish/1", json={"reason": "回退验收"},
                     headers=auth(admin_token))
    assert rb.status_code == 200
    warns = rb.get_json()["data"]["release"]["warnings"]
    assert any("A-LS-v1" in w for w in warns)
    # 恢复到 v2 供后续用例
    client.post("/api/scores/SC1/publish/2", json={"reason": "恢复"}, headers=auth(admin_token))


# 6) 打印/分享受服务端许可控制
def test_share_and_print_server_side_permission(client, user_token, admin_token):
    # 未授权打印 → 403
    r = client.post("/api/share", json={"score_id": "SC2", "allow_print": False,
                                        "allowed_audios": []}, headers=auth(user_token))
    token = r.get_json()["data"]["token"]
    meta = client.get(f"/api/share/{token}/meta")
    assert meta.status_code == 200 and meta.get_json()["data"]["permissions"]["print"] is False
    pr = client.post(f"/api/share/{token}/print", json={})
    assert pr.status_code == 403
    # 音频不在白名单 → 403
    denied = client.post(f"/api/share/{token}/audio/A-MH/cache-key", json={})
    assert denied.status_code == 403

    # 授权打印 + 白名单音频
    r2 = client.post("/api/share", json={"score_id": "SC2", "allow_print": True,
                                         "allowed_audios": ["A-MH"]}, headers=auth(user_token))
    t2 = r2.get_json()["data"]["token"]
    assert client.post(f"/api/share/{t2}/print", json={}).status_code == 200
    key_r = client.post(f"/api/share/{t2}/audio/A-MH/cache-key", json={})
    assert key_r.status_code == 200
    # 白名单外音频仍拒绝
    assert client.post(f"/api/share/{t2}/audio/A-GSY/cache-key", json={}).status_code == 403
    # 撤销/过期链接失效
    with client.application.app_context():
        from app.db import get_db
        db = get_db()
        db.execute("UPDATE share_links SET revoked=1 WHERE token=?", (t2,))
        db.commit()
    assert client.get(f"/api/share/{t2}/meta").status_code == 404


# 7) 后台：依赖缺项 + 版本迁移结果
def test_admin_lists_missing_deps_and_migrations(client, admin_token, user_token):
    # student 勾选 R7 但其先修 R1/R2/R6 未完成
    ev = [{"entity_type": "node", "entity_id": "R7", "action": "check",
           "occurred_at": "2026-10-01T00:00:00+00:00", "device_id": "d", "client_event_id": "n-r7"}]
    client.post("/api/progress/sync", json={"events": ev, "snapshots": []},
                headers=auth(user_token))
    r = client.get("/api/admin/missing-dependencies", headers=auth(admin_token))
    reports = r.get_json()["data"]["reports"]
    hit = next(x for x in reports if x["node_id"] == "R7")
    assert {m["id"] for m in hit["missing"]} == {"R1", "R2", "R4", "R6"}

    # 产生一次迁移结果再查后台
    client.post("/api/scores/SC1/publish/1", json={"reason": "rb"}, headers=auth(admin_token))
    client.post("/api/scores/SC1/publish/2", json={"reason": "pub"}, headers=auth(admin_token))
    mr = client.get("/api/admin/migration-results?version_id=2", headers=auth(admin_token))
    assert mr.status_code == 200
    rows = mr.get_json()["data"]
    assert any(row["to_version_id"] == 2 for row in rows)


# 8) 循环先修：API 层拒绝并返回环路径
def test_api_rejects_cyclic_prerequisite(client, admin_token):
    # R2 先修 R1；试图让 R1 先修 R2 → 环
    r = client.post("/api/route/edges", json={"node_id": "R1", "prereq_id": "R2"},
                    headers=auth(admin_token))
    assert r.status_code == 409
    body = r.get_json()
    assert body["ok"] is False and body["cycle"]
    # 自环
    assert client.post("/api/route/edges", json={"node_id": "R3", "prereq_id": "R3"},
                       headers=auth(admin_token)).status_code == 422
    # 合法共享先修可加
    ok = client.post("/api/route/edges", json={"node_id": "R5", "prereq_id": "R2"},
                     headers=auth(admin_token))
    assert ok.status_code == 201


# 无音频可阅读：历史/流派/谱例文本全部公开可读，无任何音频请求也能读
def test_readable_without_audio_or_login(client):
    assert client.get("/api/content/history").status_code == 200
    assert client.get("/api/content/schools").status_code == 200
    detail = client.get("/api/scores/SC1").get_json()["data"]
    assert len(detail["sections"]) >= 4
    assert any("notation" in s and s["notation"] for s in detail["sections"])
    # 音频流必须登录 + 授权
    assert client.post("/api/audio/A-LS-v2/cache-key", json={}).status_code == 401
