"""音频授权门与缓存索引。

要点：旧版本授权到期后，不能通过已存在的缓存索引重新取到音频——
任何经缓存键的访问都重新校验授权，失效即清除该索引行。
"""
import os
from datetime import timedelta
from .util import now_iso, parse_iso, is_license_valid, new_token
from .db import get_db

CACHE_TTL = timedelta(hours=6)
MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "media")


class LicenseError(Exception):
    def __init__(self, audio_id, reason):
        self.audio_id = audio_id
        self.reason = reason
        super().__init__(reason)


def get_audio(audio_id):
    return get_db().execute("SELECT * FROM audios WHERE id=?", (audio_id,)).fetchone()


def prune_cache_for(audio_id, db):
    db.execute("DELETE FROM audio_cache_index WHERE audio_id=?", (audio_id,))


def issue_cache_key(audio_id, db=None):
    """签发缓存键；授权到期则拒绝并清理旧索引。"""
    db = db or get_db()
    audio = db.execute("SELECT * FROM audios WHERE id=?", (audio_id,)).fetchone()
    if audio is None:
        raise LicenseError(audio_id, "音频不存在")
    if not is_license_valid(audio["license_until"]):
        prune_cache_for(audio_id, db)
        raise LicenseError(audio_id, f"授权已于 {audio['license_until']} 到期")
    expires = parse_iso(now_iso()) + CACHE_TTL
    if audio["license_until"]:
        lic_end = parse_iso(audio["license_until"])
        if lic_end < expires:
            expires = lic_end
    key = new_token(18)
    db.execute(
        "INSERT INTO audio_cache_index(cache_key,audio_id,created_at,expires_at) VALUES(?,?,?,?)",
        (key, audio_id, now_iso(), expires.isoformat(timespec="seconds")))
    db.commit()
    return key, expires.isoformat(timespec="seconds")


def resolve_cache_key(cache_key, db=None):
    """缓存键 -> 音频；到期/失效一律删除索引并拒绝（不回源、不放行）。"""
    db = db or get_db()
    row = db.execute(
        "SELECT ci.*, a.filename, a.license_until FROM audio_cache_index ci "
        "JOIN audios a ON a.id=ci.audio_id WHERE ci.cache_key=?",
        (cache_key,)).fetchone()
    if row is None:
        return None
    if (not is_license_valid(row["license_until"])) or \
       parse_iso(row["expires_at"]) <= parse_iso(now_iso()):
        db.execute("DELETE FROM audio_cache_index WHERE cache_key=?", (cache_key,))
        prune_cache_for(row["audio_id"], db)
        db.commit()
        raise LicenseError(row["audio_id"], "缓存命中但授权/缓存已到期，索引已清除")
    return row


def audio_allowed_for_version(version_id, db=None):
    """返回 (audio_rows, expired_rows)；页面据此决定能否播放，但不影响无音频阅读。"""
    db = db or get_db()
    rows = db.execute(
        "SELECT a.* FROM version_audio va JOIN audios a ON a.id=va.audio_id "
        "WHERE va.version_id=?", (version_id,)).fetchall()
    good, expired = [], []
    for r in rows:
        (good if is_license_valid(r["license_until"]) else expired).append(r)
    return good, expired
