"""Contract tests for LocavelloClient against a local stub server.

Plain assert-based test functions — no pytest fixtures or
monkeypatching — so the very same functions run under pytest AND the
dependency-free ``tests/run_tests.py`` runner. The stub is a stdlib
``http.server`` on a daemon thread that serves canned envelope JSON
and records every request (method, path, headers, body).
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from forjio_locavello import LocavelloClient, LocavelloError, paginate


# ---------------------------------------------------------------- stub server


class _Stub:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.requests: List[Dict[str, Any]] = []
        self.queue: List[Tuple[int, Dict[str, Any]]] = []
        self.handler = None  # callable(request_record) -> (status, payload)

    def reset(self) -> None:
        with self.lock:
            self.requests = []
            self.queue = []
            self.handler = None


STUB = _Stub()


class _Handler(BaseHTTPRequestHandler):
    def _serve(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        record: Dict[str, Any] = {
            "method": self.command,
            "path": self.path,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": json.loads(raw) if raw else None,
        }
        with STUB.lock:
            STUB.requests.append(record)
            if STUB.handler is not None:
                status, payload = STUB.handler(record)
            elif STUB.queue:
                status, payload = STUB.queue.pop(0)
            else:
                status, payload = 200, _ok({})
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_GET = _serve
    do_POST = _serve
    do_PUT = _serve
    do_PATCH = _serve
    do_DELETE = _serve

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass  # keep test output clean


def _ok(
    data: Any,
    meta_extra: Optional[Dict[str, Any]] = None,
    request_id: str = "req_test",
) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "requestId": request_id,
        "timestamp": "2026-08-01T00:00:00.000Z",
    }
    if meta_extra:
        meta.update(meta_extra)
    return {"data": data, "error": None, "meta": meta}


def _unavailable(request_id: str = "req_503") -> Dict[str, Any]:
    return {
        "data": None,
        "error": {"code": "SERVICE_UNAVAILABLE", "message": "try again"},
        "meta": {"requestId": request_id, "timestamp": "2026-08-01T00:00:00.000Z"},
    }


_SERVER = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
BASE_URL = f"http://127.0.0.1:{_SERVER.server_address[1]}"
threading.Thread(target=_SERVER.serve_forever, daemon=True).start()


def _client(**kw: Any) -> LocavelloClient:
    kw.setdefault("api_key", "lv_live_test123")
    kw.setdefault("base_url", BASE_URL)
    kw.setdefault("retry_base_ms", 1)
    return LocavelloClient(**kw)


# --------------------------------------------------------------------- tests


def test_auth_header_and_public_sends_none() -> None:
    """Authed calls send Authorization: Bearer; public.* never does."""
    STUB.reset()
    c = _client()

    STUB.queue.append((200, _ok({"subscription": None, "tiers": []})))
    c.billing.get()
    req = STUB.requests[-1]
    assert req["method"] == "GET"
    assert req["path"] == "/api/v1/billing"
    assert req["headers"].get("authorization") == "Bearer lv_live_test123"
    assert req["headers"].get("accept") == "application/json"

    # public surface: no Authorization even when a key IS configured...
    STUB.queue.append((200, _ok({"status": "done", "pairs": []})))
    c.public.preview_result("pv_1")
    req = STUB.requests[-1]
    assert req["path"] == "/api/v1/public/preview/pv_1"
    assert "authorization" not in req["headers"]

    # ...and public works with NO key configured at all.
    os.environ.pop("LOCAVELLO_API_KEY", None)
    anon = LocavelloClient(base_url=BASE_URL, retry_base_ms=1)
    STUB.queue.append(
        (200, _ok({"projectId": "prj_1", "locale": "id", "catalog": {}}))
    )
    out = anon.public.catalog("prj_1", locale="id")
    assert out["projectId"] == "prj_1"
    req = STUB.requests[-1]
    assert req["path"] == "/api/v1/public/projects/prj_1/catalog?locale=id"
    assert "authorization" not in req["headers"]


def test_envelope_unwrap_returns_data() -> None:
    """The data slot is decoded; meta is ignored on non-list calls."""
    STUB.reset()
    c = _client()
    STUB.queue.append(
        (200, _ok({"id": "prj_1", "slug": "site", "name": "Site"}, request_id="req_42"))
    )
    out = c.projects.get("prj_1")
    assert out == {"id": "prj_1", "slug": "site", "name": "Site"}
    assert STUB.requests[-1]["path"] == "/api/v1/projects/prj_1"


def test_error_mapping_not_found() -> None:
    """404 + envelope error -> LocavelloError(NOT_FOUND, 404, requestId)."""
    STUB.reset()
    c = _client()
    STUB.queue.append(
        (
            404,
            {
                "data": None,
                "error": {
                    "code": "NOT_FOUND",
                    "message": "project not found",
                    "param": "id",
                },
                "meta": {
                    "requestId": "req_err_1",
                    "timestamp": "2026-08-01T00:00:00.000Z",
                },
            },
        )
    )
    err: Optional[LocavelloError] = None
    try:
        c.projects.get("prj_missing")
    except LocavelloError as e:
        err = e
    assert err is not None
    assert err.status == 404
    assert err.code == "NOT_FOUND"
    assert err.message == "project not found"
    assert err.request_id == "req_err_1"
    assert err.param == "id"
    assert len(STUB.requests) == 1  # 404 is not a retryable status


def test_missing_key_raises_before_request() -> None:
    """No api key -> AUTH_REQUIRED, status 0, and NO request is made."""
    STUB.reset()
    os.environ.pop("LOCAVELLO_API_KEY", None)
    c = LocavelloClient(base_url=BASE_URL)
    err: Optional[LocavelloError] = None
    try:
        c.projects.list()
    except LocavelloError as e:
        err = e
    assert err is not None
    assert err.code == "AUTH_REQUIRED"
    assert err.status == 0
    assert STUB.requests == []


def test_page_shape_and_paginate_walks_pages() -> None:
    """List methods return {data, cursor, has_more}; paginate loops it."""
    STUB.reset()

    def handler(req: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        if "cursor=cur_2" in req["path"]:
            return 200, _ok([{"id": "prj_3"}], {"cursor": None, "hasMore": False})
        return 200, _ok(
            [{"id": "prj_1"}, {"id": "prj_2"}], {"cursor": "cur_2", "hasMore": True}
        )

    STUB.handler = handler
    c = _client()
    page = c.projects.list(limit=2)
    assert page == {
        "data": [{"id": "prj_1"}, {"id": "prj_2"}],
        "cursor": "cur_2",
        "has_more": True,
    }

    STUB.reset()
    STUB.handler = handler
    items = list(paginate(lambda cur: c.projects.list(limit=2, cursor=cur)))
    assert [i["id"] for i in items] == ["prj_1", "prj_2", "prj_3"]
    assert len(STUB.requests) == 2
    assert "cursor=cur_2" in STUB.requests[1]["path"]


def test_get_retries_503_post_does_not() -> None:
    """GET retries 503 twice then succeeds; POST surfaces 503 immediately."""
    STUB.reset()
    calls = {"n": 0}

    def flaky(req: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        calls["n"] += 1
        if calls["n"] < 3:
            return 503, _unavailable()
        return 200, _ok([{"id": "k_1"}], {"cursor": None, "hasMore": False})

    STUB.handler = flaky
    c = _client()  # retry_base_ms=1 -> backoff is ~1ms + ~2ms
    page = c.keys.list("prj_1")
    assert [i["id"] for i in page["data"]] == ["k_1"]
    assert calls["n"] == 3
    assert len(STUB.requests) == 3

    STUB.reset()
    STUB.handler = lambda req: (503, _unavailable("req_post"))
    err: Optional[LocavelloError] = None
    try:
        c.projects.create(slug="x", name="X")
    except LocavelloError as e:
        err = e
    assert err is not None
    assert err.status == 503
    assert err.code == "SERVICE_UNAVAILABLE"
    assert err.request_id == "req_post"
    assert len(STUB.requests) == 1  # POST is never retried


def test_snake_case_mapping_and_mounted_paths() -> None:
    """snake_case kwargs -> camelCase JSON; mount-quirk paths; 'true' flags."""
    STUB.reset()
    c = _client()

    STUB.queue.append((201, _ok({"id": "prj_9"})))
    c.projects.create(
        slug="docs",
        name="Docs",
        source_locale="en",
        mode="proxy",
        site_url="https://docs.example",
    )
    req = STUB.requests[-1]
    assert req["method"] == "POST"
    assert req["body"] == {
        "slug": "docs",
        "name": "Docs",
        "sourceLocale": "en",
        "mode": "proxy",
        "siteUrl": "https://docs.example",
    }
    assert req["headers"].get("content-type") == "application/json"

    # nullable site_url: omitted -> absent; explicit None -> sent as null
    STUB.queue.append((200, _ok({"id": "prj_9"})))
    c.projects.update("prj_9", name="Docs 2")
    assert STUB.requests[-1]["body"] == {"name": "Docs 2"}
    STUB.queue.append((200, _ok({"id": "prj_9"})))
    c.projects.update("prj_9", site_url=None)
    assert STUB.requests[-1]["body"] == {"siteUrl": None}

    # mounted-router path quirks
    STUB.queue.append((200, _ok({"id": "rel_1"})))
    c.releases.get("rel_1")
    assert STUB.requests[-1]["path"] == "/api/v1/projects/releases/rel_1"
    STUB.queue.append((200, _ok({"id": "job_1"})))
    c.jobs.get("job_1")
    assert STUB.requests[-1]["path"] == "/api/v1/projects/jobs/job_1"

    # boolean query flags ride as the string 'true' (omitted when falsy)
    STUB.queue.append((200, _ok({"source": {}})))
    c.releases.pull("prj_9", draft=True)
    assert STUB.requests[-1]["path"] == "/api/v1/projects/prj_9/pull?draft=true"
    STUB.queue.append((200, _ok([], {"cursor": None, "hasMore": False})))
    c.keys.list("prj_9", archived=True, limit=10)
    assert STUB.requests[-1]["path"] == "/api/v1/projects/prj_9/keys?archived=true&limit=10"
