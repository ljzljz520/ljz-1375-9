"""SQLite 连接与初始化。"""
import os
import sqlite3
from flask import g, current_app, has_app_context

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("GUQIN_DB", os.path.join(BASE_DIR, "guqin.db"))
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def active_db_path() -> str:
    if has_app_context():
        return current_app.config.get("DATABASE") or DB_PATH
    return DB_PATH


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(active_db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def connect_direct(path: str = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection, schema_path: str = SCHEMA_PATH):
    with open(schema_path, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
