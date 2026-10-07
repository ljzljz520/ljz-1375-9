"""通用工具：时间、ID、口令哈希。"""
import hashlib
import secrets
from datetime import datetime, timezone, timedelta


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def parse_iso(s: str):
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def new_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_password(password: str, salt: str = None):
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return h.hex(), salt


def verify_password(password: str, salt: str, expected_hex: str) -> bool:
    h, _ = hash_password(password, salt)
    return secrets.compare_digest(h, expected_hex)


def is_license_valid(license_until: str, at: datetime = None) -> bool:
    """license_until 为空表示永久授权；否则要求严格晚于当前时间。"""
    if not license_until:
        return True
    at = at or datetime.now(timezone.utc)
    return parse_iso(license_until) > at
