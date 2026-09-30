"""client.api: every feature route, one method each, generated from the API spec
(scripts/apigen.sh). Calls carry the same key and envelope as every other call.

The client sends through ``httpx.request``; the tests route that through an
``httpx.MockTransport`` and look at what goes out.
"""

from __future__ import annotations

import json
from typing import Any, List
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from forjio_locavello import LocavelloClient
from forjio_locavello import client as client_module


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> List[httpx.Request]:
    requests: List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        body = {"data": {"ok": True}, "error": None, "meta": {"requestId": "r"}}
        return httpx.Response(200, content=json.dumps(body).encode())

    mock = httpx.Client(transport=httpx.MockTransport(handler))

    def request(method: str, url: str, **kwargs: Any) -> httpx.Response:
        return mock.request(method, url, **kwargs)

    monkeypatch.setattr(client_module.httpx, "request", request)
    monkeypatch.delenv("LOCAVELLO_API_KEY", raising=False)
    return requests


def _client(api_key: str | None = "lv_live_test") -> LocavelloClient:
    return LocavelloClient(api_key=api_key, base_url="https://locavello.test")


def test_create_sends_the_fields_locavello_validates_with_the_key(seen: List[httpx.Request]) -> None:
    _client().api.projects_create(slug="web", name="Web app", mode="sdk")
    request = seen[0]
    assert (request.method, request.url.path) == ("POST", "/api/v1/projects")
    assert json.loads(request.content) == {"slug": "web", "name": "Web app", "mode": "sdk"}
    assert request.headers["authorization"] == "Bearer lv_live_test"


def test_path_and_query(seen: List[httpx.Request]) -> None:
    client = _client()
    client.api.projects_get("prj 1")
    client.api.projects_keys("prj_1", locale="id", archived=True)
    assert seen[0].url.raw_path.decode() == "/api/v1/projects/prj%201"
    assert seen[1].url.path == "/api/v1/projects/prj_1/keys"
    assert parse_qs(urlsplit(str(seen[1].url)).query) == {"locale": ["id"], "archived": ["true"]}


def test_public_surface_needs_no_key(seen: List[httpx.Request]) -> None:
    _client(api_key=None).api.public_projects_catalog("prj_1", locale="id")
    assert str(seen[0].url) == "https://locavello.test/api/v1/public/projects/prj_1/catalog?locale=id"
    assert "authorization" not in seen[0].headers


def test_a_required_field_is_asked_for(seen: List[httpx.Request]) -> None:
    with pytest.raises(ValueError, match="needs slug"):
        _client().api.projects_create(name="Web app")
    assert seen == []


def test_every_feature_route_has_a_method(seen: List[httpx.Request]) -> None:
    methods = [n for n in dir(_client().api) if not n.startswith("_")]
    assert len(methods) > 40
