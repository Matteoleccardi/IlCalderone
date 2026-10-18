import re

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path):
    (tmp_path / "media").mkdir()
    return create_app(Settings(data_dir=tmp_path, database_url=f"sqlite:///{tmp_path / 't.db'}", secret_key="test"))


def csrf(client, url="/login") -> str:
    html = client.get(url).text
    return re.search(r'name="csrf" value="([^"]+)"', html).group(1)


def signup(client, username, password="password123"):
    r = client.post("/registrati", data=dict(username=username, password=password, csrf=csrf(client, "/registrati")),
                    follow_redirects=False)
    assert r.status_code == 303, r.text
    return client


@pytest.fixture
def make_client(app):
    def _make(username):
        return signup(TestClient(app), username)
    return _make
