from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_openapi() -> None:
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "paths" in r.json()
