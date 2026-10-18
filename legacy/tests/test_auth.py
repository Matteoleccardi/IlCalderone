from fastapi.testclient import TestClient

from tests.conftest import csrf


def test_redirects_to_login(app):
    r = TestClient(app).get("/ricette", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith("/login")


def test_first_user_is_admin_and_login(app, make_client):
    c = make_client("anna")
    assert "Ciao anna" in c.get("/").text
    c2 = TestClient(app)
    bad = c2.post("/login", data=dict(username="anna", password="sbagliata", csrf=csrf(c2)))
    assert bad.status_code == 400
    ok = c2.post("/login", data=dict(username="ANNA", password="password123", csrf=csrf(c2)), follow_redirects=False)
    assert ok.status_code == 303
    from sqlalchemy import select
    from app.core.models import User
    with app.state.sessionmaker() as db:
        assert db.scalar(select(User).where(User.username == "anna")).is_admin


def test_post_without_csrf_is_rejected(make_client):
    c = make_client("anna")
    assert c.post("/famiglie", data=dict(name="Casa")).status_code == 400


def test_signup_closed(app, make_client):
    make_client("anna")
    app.state.settings.allow_signup = False
    assert TestClient(app).get("/registrati").status_code == 403
