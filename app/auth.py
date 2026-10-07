"""令牌鉴权。"""
from functools import wraps
from flask import request, g, jsonify
from .db import get_db
from .util import now_iso


def _token_from_request():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.headers.get("X-Auth-Token") or None


def current_user():
    if getattr(g, "user", None) is not None:
        return g.user
    token = _token_from_request()
    g.user = None
    if token:
        row = get_db().execute(
            "SELECT u.* FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?",
            (token,)).fetchone()
        if row:
            g.user = row
            get_db().execute("UPDATE auth_tokens SET last_used_at=? WHERE token=?", (now_iso(), token))
            get_db().commit()
    return g.user


def login_required(fn):
    @wraps(fn)
    def w(*a, **kw):
        if current_user() is None:
            return jsonify({"error": "需要登录（Bearer token）"}), 401
        return fn(*a, **kw)
    return w


def admin_required(fn):
    @wraps(fn)
    def w(*a, **kw):
        u = current_user()
        if u is None:
            return jsonify({"error": "需要登录"}), 401
        if u["role"] != "admin":
            return jsonify({"error": "需要管理员权限"}), 403
        return fn(*a, **kw)
    return w
