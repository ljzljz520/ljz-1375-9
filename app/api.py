"""JSON API。"""
import os
from flask import Blueprint, request, jsonify, send_file, abort, Response
from .db import get_db
from .util import now_iso, new_token, hash_password, verify_password, parse_iso
from .auth import login_required, admin_required, current_user
from . import services as svc
from . import graph as graph_mod
from . import media

api_bp = Blueprint("api", __name__)


def ok(data, status=200):
    return jsonify({"ok": True, "data": data}), status


def fail(msg, status=400, **extra):
    return jsonify({"ok": False, "error": msg, **extra}), status


# ==================== 认证 ====================
@api_bp.post("/auth/register")
def register():
    d = request.get_json(force=True, silent=True) or {}
    username, password = d.get("username", "").strip(), d.get("password", "")
    if len(username) < 2 or len(password) < 4:
        return fail("用户名至少2位、密码至少4位", 422)
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
        return fail("用户名已存在", 409)
    ph, salt = hash_password(password)
    cur = db.execute(
        "INSERT INTO users(username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?)",
        (username, ph, salt, d.get("role", "user"), now_iso()))
    db.commit()
    return ok({"user_id": cur.lastrowid, "username": username}, 201)


@api_bp.post("/auth/login")
def login():
    d = request.get_json(force=True, silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username=?", (d.get("username", ""),)).fetchone()
    if not row or not verify_password(d.get("password", ""), row["salt"], row["password_hash"]):
        return fail("用户名或密码错误", 401)
    token = new_token(24)
    db.execute("INSERT INTO auth_tokens(token,user_id,created_at,last_used_at) VALUES(?,?,?,?)",
               (token, row["id"], now_iso(), now_iso()))
    db.commit()
    return ok({"token": token, "user_id": row["id"], "username": row["username"], "role": row["role"]})


@api_bp.get("/auth/me")
@login_required
def me():
    u = current_user()
    return ok({"user_id": u["id"], "username": u["username"], "role": u["role"]})


# ==================== 公共内容：琴史 / 流派 / 术语 / 来源 ====================
@api_bp.get("/content/history")
def history():
    rows = get_db().execute("SELECT * FROM history_entries ORDER BY sort,id").fetchall()
    return ok([dict(r) for r in rows])


@api_bp.get("/content/schools")
def schools():
    rows = get_db().execute("SELECT * FROM schools ORDER BY sort,id").fetchall()
    return ok([dict(r) for r in rows])


@api_bp.get("/terms")
def terms_list():
    return ok([dict(r) for r in svc.list_terms(request.args.get("q"))])


@api_bp.post("/terms")
@admin_required
def terms_create():
    d = request.get_json(force=True, silent=True) or {}
    if not d.get("term") or not d.get("definition"):
        return fail("term 与 definition 必填")
    tid = svc.create_term(d["term"], d["definition"], d.get("pinyin"))
    return ok({"id": tid}, 201)


@api_bp.put("/terms/<int:tid>")
@admin_required
def terms_update(tid):
    d = request.get_json(force=True, silent=True) or {}
    if svc.update_term(tid, d.get("term"), d.get("definition"), d.get("pinyin")) is None:
        return fail("术语不存在", 404)
    return ok({"id": tid})


@api_bp.delete("/terms/<int:tid>")
@admin_required
def terms_delete(tid):
    svc.delete_term(tid)
    return ok({"deleted": tid})


@api_bp.get("/sources")
def sources_list():
    return ok([dict(r) for r in svc.list_sources()])


@api_bp.post("/sources")
@admin_required
def sources_create():
    d = request.get_json(force=True, silent=True) or {}
    if not d.get("title"):
        return fail("title 必填")
    sid = svc.create_source(d["title"], d.get("author"), d.get("dynasty"), d.get("kind"), d.get("note"))
    return ok({"id": sid}, 201)


# ==================== 学习路线：依赖图 ====================
@api_bp.get("/route")
def route_get():
    nodes = [dict(r) for r in svc.list_nodes()]
    return ok({"nodes": nodes, "edges": svc.graph_view()})


@api_bp.post("/route/edges")
@admin_required
def route_add_edge():
    d = request.get_json(force=True, silent=True) or {}
    node, prereq = d.get("node_id"), d.get("prereq_id")
    if not node or not prereq:
        return fail("node_id 与 prereq_id 必填")
    if node == prereq:
        return fail("不能将节点自身设为先修（自环）", 422)
    try:
        res = svc.add_prerequisite(node, prereq)
    except graph_mod.CycleError as e:
        return fail(str(e), 409, cycle=e.cycle)
    except graph_mod.DuplicateEdge:
        return fail("该先修关系已存在", 409)
    except ValueError as e:
        return fail(str(e), 404)
    return ok(res, 201)


# ==================== 谱例 / 版本 / 谱段 ====================
@api_bp.get("/scores")
def scores_list():
    return ok([dict(r) for r in svc.list_scores()])


@api_bp.get("/scores/<sid>")
def score_detail(sid):
    score = svc.get_score(sid)
    if not score:
        return fail("谱例不存在", 404)
    versions = []
    for v in svc.list_versions(sid):
        good, expired = svc.version_audio(v["id"])
        versions.append({
            "id": v["id"], "version": v["version"], "note": v["note"],
            "current": v["id"] == score["current_version_id"],
            "audio": [{"id": a["id"], "title": a["title"], "license_until": a["license_until"]}
                      for a in good],
            "expired_audio": [{"id": a["id"], "license_until": a["license_until"]} for a in expired],
        })
    cur_v = svc.get_version(score["current_version_id"]) if score["current_version_id"] else None
    sections = []
    if cur_v:
        for s in svc.list_sections(cur_v["id"]):
            sections.append({"id": s["id"], "code": s["code"], "label": s["label"],
                             "notation": s["notation"], "t_in": s["t_in"], "t_out": s["t_out"],
                             "has_timecode": s["t_in"] is not None})
    return ok({"score": dict(score), "current_version": dict(cur_v) if cur_v else None,
               "versions": versions, "sections": sections})


@api_bp.get("/scores/<sid>/versions/<int:vid>")
def version_detail(sid, vid):
    v = svc.get_version(vid)
    if not v or v["score_id"] != sid:
        return fail("版本不存在", 404)
    secs = [dict(s) for s in svc.list_sections(vid)]
    for s in secs:
        s["has_timecode"] = s["t_in"] is not None
    maps = [dict(m) for m in svc.list_mappings(
        request.args.get("from_version_id", type=int) or 0, vid)]
    return ok({"version": dict(v), "sections": secs, "mappings_from_prev": maps})


@api_bp.post("/scores/<sid>/publish/<int:vid>")
@admin_required
def publish(sid, vid):
    d = request.get_json(force=True, silent=True) or {}
    try:
        res = svc.publish_version(sid, vid, d.get("reason"),
                                  actor=current_user()["username"])
    except ValueError as e:
        return fail(str(e), 404)
    # 对每个有进度的用户执行迁移判定
    db = get_db()
    users = [r["user_id"] for r in db.execute(
        "SELECT DISTINCT user_id FROM progress_events WHERE user_id IS NOT NULL").fetchall()]
    migrations = []
    # 仅当存在该方向的映射定义时才做换版判定（回退到旧版无反向映射，跳过，避免误判 new）
    if res["from_version_id"] and res["from_version_id"] != vid and \
            svc.list_mappings(res["from_version_id"], vid):
        for uid in users:
            migrations.append(svc.run_migration_for_user(
                uid, sid, res["from_version_id"], vid))
    return ok({"release": res, "migrations": migrations})


@api_bp.get("/scores/<sid>/releases")
def releases(sid):
    return ok([dict(r) for r in svc.list_releases(sid)])


# ==================== 音频：授权门 + 缓存索引 ====================
@api_bp.post("/audio/<aid>/cache-key")
@login_required
def audio_cache_key(aid):
    try:
        key, exp = media.issue_cache_key(aid)
    except media.LicenseError as e:
        return fail(f"无法获取音频：{e.reason}", 403)
    return ok({"cache_key": key, "expires_at": exp, "stream_url": f"/api/audio/stream/{key}"})


@api_bp.get("/audio/stream/<cache_key>")
def audio_stream(cache_key):
    """经缓存索引取音频；每次都重新校验授权，到期即删索引并拒绝。"""
    try:
        row = media.resolve_cache_key(cache_key)
    except media.LicenseError as e:
        return fail(f"音频不可用：{e.reason}", 410)
    if row is None:
        return fail("缓存键不存在或已失效，请重新申请", 404)
    path = os.path.join(media.MEDIA_DIR, row["filename"])
    if not os.path.exists(path):
        return fail("媒体文件缺失", 404)
    return send_file(path, mimetype="audio/wav", conditional=True)


# ==================== 进度：匿名合并 / 同步 / 冲突 ====================
@api_bp.post("/progress/merge-anonymous")
@login_required
def merge_anonymous():
    d = request.get_json(force=True, silent=True) or {}
    events = d.get("events") or []
    snapshots = d.get("snapshots") or []
    for e in events:
        e.setdefault("anon_id", d.get("anon_id"))
    report = svc.merge_anonymous_into_account(current_user()["id"], events, snapshots)
    return ok({"report": report, "states": svc.pull_states(current_user()["id"])})


@api_bp.post("/progress/sync")
@login_required
def progress_sync():
    """设备上传事件(必)与状态快照(用于 LWW 对照)，返回权威投影与冲突报告。"""
    d = request.get_json(force=True, silent=True) or {}
    events = d.get("events") or []
    snapshots = d.get("snapshots") or []
    report = svc.push_events(current_user()["id"], events, snapshots,
                             anon_id=d.get("anon_id"))
    return ok({"report": report, "states": svc.pull_states(current_user()["id"]),
               "conflicts": svc.conflict_report(current_user()["id"])})


@api_bp.get("/progress")
@login_required
def progress_pull():
    return ok({"states": svc.pull_states(current_user()["id"]),
               "conflicts": svc.conflict_report(current_user()["id"])})


@api_bp.post("/progress/resolve")
@login_required
def progress_resolve():
    d = request.get_json(force=True, silent=True) or {}
    if d.get("entity_type") not in ("section", "node") or not d.get("entity_id"):
        return fail("需要 entity_type / entity_id")
    svc.resolve_conflict(current_user()["id"], d["entity_type"], d["entity_id"],
                         bool(d.get("completed")))
    return ok({"states": svc.pull_states(current_user()["id"]),
               "conflicts": svc.conflict_report(current_user()["id"])})


# ==================== 分享 / 打印许可 ====================
@api_bp.post("/share")
@login_required
def share_create():
    d = request.get_json(force=True, silent=True) or {}
    sid = d.get("score_id")
    if not sid or not svc.get_score(sid):
        return fail("score_id 必填且需存在")
    token = svc.create_share_link(
        sid, allow_print=bool(d.get("allow_print")),
        allowed_audios=",".join(d.get("allowed_audios", [])),
        expires_days=int(d.get("expires_days", 14)),
        user_id=current_user()["id"], version_id=d.get("version_id"))
    return ok({"token": token, "url": f"/share/{token}"}, 201)


@api_bp.get("/share/<token>/meta")
def share_meta(token):
    """服务端许可：未登录者通过分享令牌读取；打印与音频权限服务端裁决。"""
    sh = svc.get_share_link(token)
    if not sh:
        return fail("分享链接不存在、已撤销或已过期", 404)
    score = svc.get_score(sh["score_id"])
    vid = sh["version_id"] or score["current_version_id"]
    v = svc.get_version(vid)
    secs = [dict(s) for s in svc.list_sections(vid)]
    for s in secs:
        s["has_timecode"] = s["t_in"] is not None
    return ok({"score": dict(score), "version": dict(v), "sections": secs,
               "permissions": {"print": bool(sh["allow_print"]),
                               "audio_ids": [a for a in (sh["allowed_audios"] or "").split(",") if a]}})


@api_bp.post("/share/<token>/print")
def share_print(token):
    """打印谱例：服务端许可控制。无许可不放行（而非仅前端隐藏按钮）。"""
    sh = svc.get_share_link(token)
    if not sh:
        return fail("分享链接无效", 404)
    if not sh["allow_print"]:
        return fail("该分享链接未授予打印权限", 403)
    vid = sh["version_id"] or svc.get_score(sh["score_id"])["current_version_id"]
    secs = [dict(s) for s in svc.list_sections(vid)]
    return ok({"printable": True, "score": dict(svc.get_score(sh["score_id"])),
               "sections": secs})


@api_bp.post("/share/<token>/audio/<aid>/cache-key")
def share_audio_key(token, aid):
    sh = svc.get_share_link(token)
    if not sh:
        return fail("分享链接无效", 404)
    if not svc.share_audio_allowed(sh, aid):
        return fail("该分享未授权此音频", 403)
    try:
        key, exp = media.issue_cache_key(aid)
    except media.LicenseError as e:
        return fail(f"音频不可用：{e.reason}", 410)
    return ok({"cache_key": key, "stream_url": f"/api/audio/stream/{key}", "expires_at": exp})


# ==================== 后台：依赖缺项 / 迁移结果 ====================
@api_bp.get("/admin/missing-dependencies")
@admin_required
def admin_missing():
    per_user = svc.dependency_report()
    nodes = {n["id"]: n["title"] for n in svc.list_nodes()}
    out = []
    for uid, miss in per_user.items():
        for node, lack in miss.items():
            out.append({"user_id": uid, "node_id": node, "node_title": nodes.get(node),
                        "missing": [{"id": x, "title": nodes.get(x)} for x in lack]})
    return ok({"reports": out, "graph": svc.graph_view()})


@api_bp.get("/admin/migration-results")
@admin_required
def admin_migrations():
    version_id = request.args.get("version_id", type=int)
    rows = svc.list_migration_results(version_id=version_id)
    return ok([dict(r) for r in rows])
