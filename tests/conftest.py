import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from app import create_app
from app.db import DB_PATH
import seed


@pytest.fixture()
def app(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setenv("GUQIN_DB", db_path)
    # 让 media 生成到临时目录，避免污染
    info = seed.run(db_path)
    application = create_app(db_path)
    application.config.update(TESTING=True)
    application.db_path = db_path
    application.seed_info = info
    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


def _login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["data"]["token"]


@pytest.fixture()
def admin_token(client):
    return _login(client, "admin", "admin123")


@pytest.fixture()
def user_token(client):
    return _login(client, "student", "stud1234")


def auth(token):
    return {"Authorization": "Bearer " + token}
