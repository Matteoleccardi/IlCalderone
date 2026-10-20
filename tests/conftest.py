"""API tests: each test gets a fresh data folder and its own `php -S` server (needs php-cli on PATH)."""
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Client:
    """httpx client that keeps the session cookie and sends the XSRF header like Angular does."""

    def __init__(self, base: str):
        self.http = httpx.Client(base_url=base, timeout=10)

    def _headers(self):
        tok = self.http.cookies.get("XSRF-TOKEN")
        return {"X-XSRF-TOKEN": tok} if tok else {}

    def get(self, path, **kw):
        return self.http.get("/api" + path, **kw)

    def post(self, path, json=None, **kw):
        if "XSRF-TOKEN" not in self.http.cookies:
            self.get("/session")
        return self.http.post("/api" + path, json=json, headers=self._headers(), **kw)

    def put(self, path, json=None):
        return self.http.put("/api" + path, json=json, headers=self._headers())

    def delete(self, path):
        return self.http.delete("/api" + path, headers=self._headers())


@pytest.fixture
def server(tmp_path):
    if not shutil.which("php"):
        pytest.skip("php-cli not installed")
    port = free_port()
    data = tmp_path / "data"
    env = dict(os.environ, CALDERONE_DATA_DIR=str(data))
    proc = subprocess.Popen(["php", "-S", f"127.0.0.1:{port}", "-t", str(PUBLIC), str(PUBLIC / "api" / "router-dev.php")],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            httpx.get(base + "/api/session", timeout=0.5); break
        except httpx.HTTPError:
            time.sleep(0.1)
    yield type("Server", (), {"base": base, "data": data})
    proc.terminate(); proc.wait()


@pytest.fixture
def client(server):
    return lambda: Client(server.base)


@pytest.fixture
def admin(client):
    c = client()
    r = c.post("/setup", {"username": "admin", "password": "password123", "display": "Admin"})
    assert r.status_code == 200, r.text
    return c


def make_user(admin, client, name):
    assert admin.post("/users", {"username": name, "password": "password123"}).status_code == 200
    c = client()
    assert c.post("/login", {"username": name, "password": "password123"}).status_code == 200
    return c


RECIPE = {
    "title": "Pasta al pomodoro", "servings": 2, "time_minutes": 15, "tags": ["Veloce", "pasta"],
    "ingredients": [{"name": "Pasta", "qty": "180", "unit": "g"}, {"name": "Pomodori", "qty": "1 1/2", "unit": "p."},
                    {"name": "Sale", "qty": "q.b."}],
    "steps": [{"title": "Cuoci", "text": "In acqua salata."}],
    "facets": {"course": "primo", "diet": "vegana", "base": ["pasta"]},
}
FACETS = RECIPE["facets"]
PRIVATE = RECIPE | {"visibility": "private"}
