"""业务服务层：内容、依赖图、换版迁移、进度合并、分享许可。"""
import json
from .db import get_db
from .util import now_iso, parse_iso, new_token
from . import graph as graph_mod
from . import migration as mig
from . import sync as sync_mod
from . import media

SECTION_ENTITY = "section"
NODE_ENTITY = "node"


# ---------- 术语 / 来源 ----------
def list_terms(q=None):
    db = get_db()
    if q:
        like = f"%{q}%"
        return db.execute("SELECT * FROM terms WHERE term LIKE ? OR definition LIKE ? ORDER BY term",
                          (like, like)).fetchall()
    return db.execute("SELECT * FROM terms ORDER BY term").fetchall()


def create_term(term, definition, pinyin=None):
    db = get_db()
    cur = db.execute("INSERT INTO terms(term,pinyin,definition,created_at,updated_at) VALUES(?,?,?,?,?)",
                     (term, pinyin, definition, now_iso(), now_iso()))
    db.commit()
    return cur.lastrowid


def update_term(term_id, term=None, definition=None, pinyin=None):
    db = get_db()
    row = db.execute("SELECT * FROM terms WHERE id=?", (term_id,)).fetchone()
    if not row:
        return None
    db.execute("UPDATE terms SET term=?, pinyin=?, definition=?, updated_at=? WHERE id=?",
               (term if term is not None else row["term"],
                pinyin if pinyin is not None else row["pinyin"],
                definition if definition is not None else row["definition"],
                now_iso(), term_id))
    db.commit()
    return term_id


def delete_term(term_id):
    db = get_db()
    db.execute("DELETE FROM terms WHERE id=?", (term_id,))
    db.commit()


def list_sources():
    return get_db().execute("SELECT * FROM sources ORDER BY dynasty, title").fetchall()


def create_source(title, author=None, dynasty=None, kind=None, note=None):
    db = get_db()
    cur = db.execute(
        "INSERT INTO sources(title,author,dynasty,kind,note,created_at) VALUES(?,?,?,?,?,?)",
        (title, author, dynasty, kind, note, now_iso()))
    db.commit()
    return cur.lastrowid


# ---------- 学习路线依赖图 ----------
def list_nodes():
    return get_db().execute("SELECT * FROM route_nodes ORDER BY id").fetchall()


def list_edges():
    return [(r["node_id"], r["prereq_id"])
            for r in get_db().execute("SELECT * FROM prerequisites").fetchall()]


def add_prerequisite(node_id, prereq_id):
    """新增先修关系：存在性、自环、循环、重复四类校验。允许共享先修节点。"""
    db = get_db()
    if db.execute("SELECT 1 FROM route_nodes WHERE id=?", (node_id,)).fetchone() is None:
        raise ValueError(f"节点 {node_id} 不存在")
    if db.execute("SELECT 1 FROM route_nodes WHERE id=?", (prereq_id,)).fetchone() is None:
        raise ValueError(f"先修节点 {prereq_id} 不存在")
    edges = list_edges()
    try:
        new_edges = graph_mod.add_edge(edges, node_id, prereq_id)
    except graph_mod.DuplicateEdge:
        raise
    except graph_mod.CycleError:
        raise
    assert len(new_edges) == len(edges) + 1
    db.execute("INSERT INTO prerequisites(node_id,prereq_id,created_at) VALUES(?,?,?)",
               (node_id, prereq_id, now_iso()))
    db.commit()
    return {"node_id": node_id, "prereq_id": prereq_id}


def graph_view():
    return graph_mod.direct_graph_view(list_edges())


def dependency_report():
    """后台：依赖缺项（已勾选节点却缺传递先修）。"""
    edges = list_edges()
    per_user = {}
    rows = get_db().execute(
        "SELECT user_id, entity_id FROM progress_states WHERE entity_type=? AND completed=1",
        (NODE_ENTITY,)).fetchall()
    by_user = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r["entity_id"])
    for uid, done in by_user.items():
        per_user[uid] = graph_mod.find_missing_prereqs(edges, done)
    return per_user


# ---------- 谱例与版本 ----------
def list_scores():
    return get_db().execute(
        "SELECT s.*, sv.version FROM scores s "
        "LEFT JOIN score_versions sv ON sv.id=s.current_version_id ORDER BY s.id").fetchall()


def get_score(score_id):
    return get_db().execute("SELECT * FROM scores WHERE id=?", (score_id,)).fetchone()


def get_version(version_id):
    return get_db().execute("SELECT * FROM score_versions WHERE id=?", (version_id,)).fetchone()


def list_versions(score_id):
    return get_db().execute(
        "SELECT * FROM score_versions WHERE score_id=? ORDER BY id", (score_id,)).fetchall()


def list_sections(version_id):
    return get_db().execute(
        "SELECT * FROM sections WHERE version_id=? ORDER BY sort,id", (version_id,)).fetchall()


def list_mappings(from_version_id, to_version_id):
    return get_db().execute(
        "SELECT * FROM section_mappings WHERE from_version_id=? AND to_version_id=? ORDER BY id",
        (from_version_id, to_version_id)).fetchall()


def version_audio(version_id):
    return media.audio_allowed_for_version(version_id)


def section_entity_id(score_id, version_code, code):
    return f"{score_id}|{version_code}|{code}"


def publish_version(score_id, target_version_id, reason=None, actor=None):
    """发布或回退：记录发布事件。回退到旧版本时若其音频授权到期——允许回退（无音频可读），
    但立即清除相关缓存索引并在结果中告警，而不是靠缓存取回音频。"""
    db = get_db()
    score = get_score(score_id)
    if score is None:
        raise ValueError("谱例不存在")
    target = get_version(target_version_id)
    if target is None or target["score_id"] != score_id:
        raise ValueError("目标版本不存在或不属于该谱例")
    action = "publish" if score["current_version_id"] is None or target_version_id > (score["current_version_id"] or 0) else "rollback"
    if score["current_version_id"] == target_version_id:
        action = "publish"
    prev = score["current_version_id"]
    warnings = []
    if action == "rollback":
        good, expired = media.audio_allowed_for_version(target_version_id)
        for a in expired:
            media.prune_cache_for(a["id"], db)
            warnings.append(f"回退版本音频 {a['id']} 授权已于 {a['license_until']} 到期，"
                            "已清除缓存索引，页面可无音频阅读")
    db.execute("UPDATE scores SET current_version_id=? WHERE id=?", (target_version_id, score_id))
    db.execute(
        "INSERT INTO releases(score_id,action,from_version_id,to_version_id,reason,created_at)"
        " VALUES(?,?,?,?,?,?)",
        (score_id, action, prev, target_version_id, reason, now_iso()))
    db.commit()
    return {"action": action, "from_version_id": prev, "to_version_id": target_version_id,
            "warnings": warnings, "by": actor}


def list_releases(score_id=None):
    db = get_db()
    if score_id:
        return db.execute("SELECT * FROM releases WHERE score_id=? ORDER BY id DESC", (score_id,)).fetchall()
    return db.execute("SELECT * FROM releases ORDER BY id DESC").fetchall()


def run_migration_for_user(user_id, score_id, from_version_id, to_version_id):
    """换版迁移：旧完成事件保留，经 section_mappings 判断新版每段是否满足。"""
    db = get_db()
    old_sections = list_sections(from_version_id)
    new_sections = list_sections(to_version_id)
    old_v = get_version(from_version_id)["version"]
    new_v = get_version(to_version_id)["version"]
    completed = set()
    for s in old_sections:
        ent = section_entity_id(score_id, old_v, s["code"])
        st = db.execute(
            "SELECT completed FROM progress_states WHERE user_id=? AND entity_type=? AND entity_id=?",
            (user_id, SECTION_ENTITY, ent)).fetchone()
        if st and st["completed"]:
            completed.add(s["code"])
    mappings = [dict(m) for m in list_mappings(from_version_id, to_version_id)]
    results, dropped = mig.evaluate_migration(completed, [s["code"] for s in new_sections], mappings)
    db.execute("DELETE FROM migration_results WHERE user_id=? AND to_version_id=?",
               (user_id, to_version_id))
    out = []
    for code, (status, detail) in results.items():
        db.execute(
            "INSERT INTO migration_results(user_id,from_version_id,to_version_id,new_code,status,detail,created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (user_id, from_version_id, to_version_id, code, status, detail, now_iso()))
        ent = section_entity_id(score_id, new_v, code)
        # inherited 自动置完成；其余状态显式落为未完成（不继承旧完成），使投影完整可见
        if status == mig.INHERITED:
            _upsert_event_state(db, user_id, SECTION_ENTITY, ent, 1,
                                None, "migration", note_source="inherited")
        else:
            _upsert_event_state(db, user_id, SECTION_ENTITY, ent, 0,
                                None, "migration", note_source="mig-" + status)
        out.append({"new_code": code, "status": status, "detail": detail})
    for old_code in dropped:
        db.execute(
            "INSERT INTO migration_results(user_id,from_version_id,to_version_id,new_code,status,detail,created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (user_id, from_version_id, to_version_id, old_code, mig.ARCHIVED,
             "旧版段落已删除，完成记录归档保留（不进入新版）", now_iso()))
    db.commit()
    # 迁移写入的 inherited 事件需要重建投影，供进度页/依赖报告反映
    rebuild_user_states(db, user_id)
    return {"results": out, "archived": dropped}


def list_migration_results(version_id=None, user_id=None):
    db = get_db()
    sql = ("SELECT mr.*, u.username FROM migration_results mr "
           "LEFT JOIN users u ON u.id=mr.user_id WHERE 1=1")
    args = []
    if version_id:
        sql += " AND mr.to_version_id=?"; args.append(version_id)
    if user_id:
        sql += " AND mr.user_id=?"; args.append(user_id)
    sql += " ORDER BY mr.id DESC LIMIT 300"
    return db.execute(sql, args).fetchall()


# ---------- 进度：事件合并 / LWW / 冲突 ----------
def _existing_client_ids(db, user_id):
    rows = db.execute(
        "SELECT client_event_id FROM progress_events WHERE client_event_id IS NOT NULL AND user_id=?",
        (user_id,)).fetchall()
    return {r["client_event_id"] for r in rows if r["client_event_id"]}


def push_events(user_id, events, snapshots=(), anon_id=None):
    """接收设备上传：幂等去重 -> 入库 -> 与 LWW 快照对账 -> 更新投影。"""
    db = get_db()
    clean, dup = sync_mod.dedupe_events(events, _existing_client_ids(db, user_id))
    received = now_iso()
    stored = []
    for e in clean:
        db.execute(
            "INSERT INTO progress_events(user_id,anon_id,entity_type,entity_id,action,occurred_at,"
            "device_id,client_event_id,received_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (user_id, anon_id, e["entity_type"], e["entity_id"], e["action"],
             e["occurred_at"], e.get("device_id"), e.get("client_event_id"), received))
        stored.append(dict(e, received_at=received))
    for s in (snapshots or []):
        db.execute(
            "INSERT INTO progress_snapshots(user_id,anon_id,entity_type,entity_id,completed,"
            "modified_at,device_id,received_at) VALUES(?,?,?,?,?,?,?,?)",
            (user_id, anon_id, s["entity_type"], s["entity_id"], int(bool(s["completed"])),
             s.get("modified_at", received), s.get("device_id"), received))
    db.commit()
    report = rebuild_user_states(db, user_id)
    report["duplicates_dropped"] = dup
    report["accepted_events"] = len(clean)
    return report


def _load_events(db, user_id):
    rows = db.execute(
        "SELECT entity_type,entity_id,action,occurred_at,device_id,received_at "
        "FROM progress_events WHERE user_id=? ORDER BY occurred_at,id", (user_id,)).fetchall()
    return [dict(r) for r in rows]


def _load_snapshots(db, user_id):
    rows = db.execute(
        "SELECT entity_type,entity_id,completed,modified_at,device_id "
        "FROM progress_snapshots WHERE user_id=? ORDER BY modified_at,id", (user_id,)).fetchall()
    return [dict(r) for r in rows]


def rebuild_user_states(db, user_id):
    events = _load_events(db, user_id)
    snapshots = _load_snapshots(db, user_id)
    rows, conflicts = sync_mod.reconcile(events, snapshots)
    db.execute("DELETE FROM progress_states WHERE user_id=?", (user_id,))
    for r in rows:
        db.execute(
            "INSERT INTO progress_states(user_id,entity_type,entity_id,completed,last_occurred_at,"
            "last_device_id,lww_completed,lww_state_ts,conflict_flag,conflict_detail)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (user_id, r["entity_type"], r["entity_id"], r["completed"], r["last_occurred_at"],
             r["last_device_id"], r["lww_completed"], r["lww_state_ts"],
             r["conflict_flag"], r["conflict_detail"]))
    db.commit()
    return {"conflicts": conflicts, "entity_count": len(rows)}


def pull_states(user_id):
    db = get_db()
    rows = db.execute(
        "SELECT entity_type,entity_id,completed,last_occurred_at,last_device_id,"
        "lww_completed,lww_state_ts,conflict_flag,conflict_detail "
        "FROM progress_states WHERE user_id=? ORDER BY entity_type,entity_id", (user_id,)).fetchall()
    return [dict(r) for r in rows]


def conflict_report(user_id):
    states = pull_states(user_id)
    return [s for s in states if s["conflict_flag"]]


def resolve_conflict(user_id, entity_type, entity_id, completed):
    """人工裁决：写入一条裁决事件（occurred_at=now），事件合并自然采用。"""
    db = get_db()
    db.execute(
        "INSERT INTO progress_events(user_id,entity_type,entity_id,action,occurred_at,device_id,"
        "client_event_id,received_at) VALUES(?,?,?,?,?,?,?,?)",
        (user_id, entity_type, entity_id, "check" if completed else "uncheck",
         now_iso(), "manual-resolve", "resolve:" + new_token(8), now_iso()))
    db.commit()
    return rebuild_user_states(db, user_id)


def merge_anonymous_into_account(user_id, anon_events, anon_snapshots=()):
    """匿名本地进度合并到账号：先导入（带 anon_id 标记），再统一事件合并去重对账。
    不清空任何一侧；同一 client_event_id 去重，冲突按权威策略裁决。"""
    db = get_db()
    before = len(_load_events(db, user_id))
    clean, dup = sync_mod.dedupe_events(anon_events, _existing_client_ids(db, user_id))
    received = now_iso()
    for e in clean:
        db.execute(
            "INSERT INTO progress_events(user_id,anon_id,entity_type,entity_id,action,occurred_at,"
            "device_id,client_event_id,received_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (user_id, e.get("anon_id"), e["entity_type"], e["entity_id"], e["action"],
             e["occurred_at"], e.get("device_id"), e.get("client_event_id"), received))
    for s in (anon_snapshots or []):
        db.execute(
            "INSERT INTO progress_snapshots(user_id,anon_id,entity_type,entity_id,completed,"
            "modified_at,device_id,received_at) VALUES(?,?,?,?,?,?,?,?)",
            (user_id, s.get("anon_id"), s["entity_type"], s["entity_id"], int(bool(s["completed"])),
             s.get("modified_at", received), s.get("device_id"), received))
    db.commit()
    report = rebuild_user_states(db, user_id)
    after = len(_load_events(db, user_id))
    report.update({"imported_events": after - before, "duplicates_dropped": dup})
    return report


def _upsert_event_state(db, user_id, etype, eid, completed, ts, device, note_source=None):
    db.execute(
        "INSERT INTO progress_events(user_id,entity_type,entity_id,action,occurred_at,device_id,"
        "client_event_id,received_at) VALUES(?,?,?,?,?,?,?,?)",
        (user_id, etype, eid, "check" if completed else "uncheck", ts or now_iso(),
         device, (note_source + ":" if note_source else "") + new_token(8), now_iso()))


# ---------- 分享 / 打印许可 ----------
def create_share_link(score_id, allow_print=False, allowed_audios="", expires_days=14, user_id=None,
                      version_id=None):
    db = get_db()
    exp = (parse_iso(now_iso())).replace(microsecond=0)
    from datetime import timedelta
    exp = (exp + timedelta(days=expires_days)).isoformat()
    token = new_token(12)
    db.execute(
        "INSERT INTO share_links(token,score_id,version_id,allow_print,allowed_audios,created_by,"
        "expires_at,revoked,created_at) VALUES(?,?,?,?,?,?,?,0,?)",
        (token, score_id, version_id, int(allow_print), allowed_audios, user_id, exp, now_iso()))
    db.commit()
    return token


def get_share_link(token):
    db = get_db()
    row = db.execute("SELECT * FROM share_links WHERE token=?", (token,)).fetchone()
    if not row or row["revoked"]:
        return None
    if row["expires_at"] and parse_iso(row["expires_at"]) <= parse_iso(now_iso()):
        return None
    return row


def revoke_share_link(token):
    db = get_db()
    db.execute("UPDATE share_links SET revoked=1 WHERE token=?", (token,))
    db.commit()


def share_audio_allowed(share, audio_id):
    """服务端许可：仅白名单内音频可通过分享链接触达；打印由 allow_print 控制。"""
    if not share:
        return False
    allowed = {a for a in (share["allowed_audios"] or "").split(",") if a}
    return audio_id in allowed
