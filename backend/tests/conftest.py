import os
import tempfile

import pytest

# Point the app at a throwaway database before it is imported. Set
# TEST_DATABASE_URL to run the same suite against Postgres (CI does).
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'test.db')}"
os.environ["PURGE_INTERVAL_SECONDS"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.database import Base, engine

    Base.metadata.drop_all(engine)  # start from an empty schema (the app re-creates and seeds it)
    with TestClient(app) as c:
        yield c


def login(client, phone: str) -> dict:
    r = client.post("/api/auth/verify-otp", json={"phone": phone, "code": "123456"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "_token": r.json()["token"], "_user": r.json()["user"]}


def auth(h: dict) -> dict:
    return {"Authorization": h["Authorization"]}


def next_event(ws, type_: str, max_events: int = 20) -> dict:
    """Read events until one of the given type arrives."""
    for _ in range(max_events):
        ev = ws.receive_json()
        if ev["type"] == type_:
            return ev
    raise AssertionError(f"no {type_} event")
