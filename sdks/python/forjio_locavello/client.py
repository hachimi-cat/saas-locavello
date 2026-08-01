"""Locavello client — mirrors ``@forjio/locavello`` (JS) 1:1.

Auth = Bearer token — an ``lv_live_...`` API key from the dashboard.
Pass ``api_key=`` or set ``LOCAVELLO_API_KEY``. The ``public``
namespace (preview + published-catalog endpoints) needs no key at all
and never sends an Authorization header.

Every response rides the Forjio envelope ``{data, error, meta}``; the
client unwraps it and raises :class:`LocavelloError` (with the
envelope's ``error.code``) on failure. List endpoints return a Page
dict ``{"data", "cursor", "has_more"}``; :func:`paginate` walks all
pages of any list method for you.

Idempotent GETs are retried automatically (max 2 retries) on HTTP
429 / 502 / 503 / 504 and transport-level network errors, with
exponential backoff from ``retry_base_ms``.
"""

from __future__ import annotations

import os
import time
from typing import Any, Callable, Dict, Iterator, List, Optional
from urllib.parse import quote, urlencode

import httpx

from .errors import LocavelloError
from .types import (
    GlossaryTerm,
    Namespace,
    Page,
    Project,
    ProjectDetail,
    ProjectLocaleStat,
    Release,
    TranslationJob,
)

_RETRY_STATUSES = (429, 502, 503, 504)
_MAX_RETRIES = 2


def _qs(params: Optional[Dict[str, Any]]) -> str:
    if not params:
        return ""
    entries = [(k, v) for k, v in params.items() if v is not None]
    if not entries:
        return ""
    return "?" + urlencode([(k, str(v)) for k, v in entries])


def _enc(segment: str) -> str:
    return quote(segment, safe="")


def _flag(value: Optional[bool]) -> Optional[str]:
    """Map a truthy bool onto the wire's ``'true'`` string flag."""
    return "true" if value else None


def paginate(fetch: Callable[[Optional[str]], Page]) -> Iterator[Any]:
    """Walk every page of a list method, yielding items one by one.

    ``fetch`` takes the cursor (``None`` for the first page) and
    returns a Page dict — i.e. any SDK list method partially applied::

        for key in paginate(lambda c: client.keys.list("prj_1", cursor=c)):
            ...
    """
    cursor: Optional[str] = None
    while True:
        page = fetch(cursor)
        for item in page.get("data") or []:
            yield item
        if not page.get("has_more"):
            return
        cursor = page.get("cursor")
        if cursor is None:
            return


class _Projects:
    """Project + locale + namespace management (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def create(
        self,
        *,
        slug: str,
        name: str,
        source_locale: Optional[str] = None,
        mode: Optional[str] = None,
        site_url: Optional[str] = None,
    ) -> Project:
        """POST /api/v1/projects — create a project.

        ``mode`` is ``sdk`` (key/catalog workflow) or ``proxy``
        (crawl-a-site workflow, pair with ``site_url``).
        """
        payload: Dict[str, Any] = {"slug": slug, "name": name}
        if source_locale is not None:
            payload["sourceLocale"] = source_locale
        if mode is not None:
            payload["mode"] = mode
        if site_url is not None:
            payload["siteUrl"] = site_url
        return self._c.request("POST", "/api/v1/projects", body=payload)

    def list(
        self,
        *,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Page:
        """GET /api/v1/projects — Page of Project."""
        return self._c.request(
            "GET",
            "/api/v1/projects" + _qs({"limit": limit, "cursor": cursor}),
            page=True,
        )

    def get(self, id: str) -> ProjectDetail:
        """GET /api/v1/projects/:id — project detail incl. per-locale
        stats, namespaces and ``lastRelease``."""
        return self._c.request("GET", f"/api/v1/projects/{_enc(id)}")

    def update(
        self,
        id: str,
        *,
        name: Optional[str] = None,
        site_url: Optional[str] = ...,  # type: ignore[assignment]
    ) -> Project:
        """PATCH /api/v1/projects/:id — rename / repoint.

        ``site_url`` is nullable — pass ``site_url=None`` explicitly
        to clear it; omit to leave it alone.
        """
        payload: Dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if site_url is not ...:
            payload["siteUrl"] = site_url
        return self._c.request("PATCH", f"/api/v1/projects/{_enc(id)}", body=payload)

    def add_locale(
        self,
        id: str,
        *,
        tag: str,
        fallback: Optional[str] = None,
        rtl: Optional[bool] = None,
    ) -> ProjectLocaleStat:
        """POST /api/v1/projects/:id/locales — enable a target locale."""
        payload: Dict[str, Any] = {"tag": tag}
        if fallback is not None:
            payload["fallback"] = fallback
        if rtl is not None:
            payload["rtl"] = rtl
        return self._c.request(
            "POST", f"/api/v1/projects/{_enc(id)}/locales", body=payload
        )

    def update_locale(
        self,
        id: str,
        tag: str,
        *,
        fallback: Optional[str] = None,
        rtl: Optional[bool] = None,
        enabled: Optional[bool] = None,
    ) -> ProjectLocaleStat:
        """PATCH /api/v1/projects/:id/locales/:tag — fallback / rtl / enabled."""
        payload: Dict[str, Any] = {}
        if fallback is not None:
            payload["fallback"] = fallback
        if rtl is not None:
            payload["rtl"] = rtl
        if enabled is not None:
            payload["enabled"] = enabled
        return self._c.request(
            "PATCH",
            f"/api/v1/projects/{_enc(id)}/locales/{_enc(tag)}",
            body=payload,
        )

    def locales(self, id: str) -> List[ProjectLocaleStat]:
        """GET /api/v1/projects/:id/locales — locale stats array.

        Plain array (not cursored) — returned directly, not as a Page.
        """
        return self._c.request("GET", f"/api/v1/projects/{_enc(id)}/locales")

    def add_namespace(
        self,
        id: str,
        *,
        name: str,
        review_policy: Optional[str] = None,
    ) -> Namespace:
        """POST /api/v1/projects/:id/namespaces — add a namespace.

        ``review_policy`` is ``standard`` (default) or ``gated``.
        """
        payload: Dict[str, Any] = {"name": name}
        if review_policy is not None:
            payload["reviewPolicy"] = review_policy
        return self._c.request(
            "POST", f"/api/v1/projects/{_enc(id)}/namespaces", body=payload
        )

    def update_namespace(self, id: str, name: str, *, review_policy: str) -> Namespace:
        """PATCH /api/v1/projects/:id/namespaces/:name — change reviewPolicy."""
        return self._c.request(
            "PATCH",
            f"/api/v1/projects/{_enc(id)}/namespaces/{_enc(name)}",
            body={"reviewPolicy": review_policy},
        )


class _Keys:
    """Source-key sync + browsing (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def upsert(
        self,
        project_id: str,
        *,
        keys: List[Dict[str, Any]],
        prune: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """PUT /api/v1/projects/:id/keys — bulk key sync,
        ``{"created", "updated", "archived"}``.

        ``keys`` rows are wire-shaped :class:`~forjio_locavello.types.KeyInput`
        dicts (``{"namespace"?, "name", "sourceText", "description"?,
        "maxLength"?, "context"?}``), max 2000 per request.
        ``prune=True`` archives keys absent from the payload.
        """
        payload: Dict[str, Any] = {"keys": keys}
        if prune is not None:
            payload["prune"] = prune
        return self._c.request(
            "PUT", f"/api/v1/projects/{_enc(project_id)}/keys", body=payload
        )

    def list(
        self,
        project_id: str,
        *,
        namespace: Optional[str] = None,
        q: Optional[str] = None,
        locale: Optional[str] = None,
        status: Optional[str] = None,
        archived: Optional[bool] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Page:
        """GET /api/v1/projects/:id/keys — Page of Key.

        Filters: ``namespace``, ``q`` (free-text), ``locale`` +
        ``status`` (missing|machine|needs_review|approved|rejected),
        ``archived=True`` to include archived keys.
        """
        return self._c.request(
            "GET",
            f"/api/v1/projects/{_enc(project_id)}/keys"
            + _qs(
                {
                    "namespace": namespace,
                    "q": q,
                    "locale": locale,
                    "status": status,
                    "archived": _flag(archived),
                    "limit": limit,
                    "cursor": cursor,
                }
            ),
            page=True,
        )


class _Translations:
    """Per-key translations + review workflow (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def update_key(
        self,
        key_id: str,
        *,
        description: Optional[str] = None,
        max_length: Optional[int] = None,
        screenshot_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """PATCH /api/v1/keys/:keyId — key metadata."""
        payload: Dict[str, Any] = {}
        if description is not None:
            payload["description"] = description
        if max_length is not None:
            payload["maxLength"] = max_length
        if screenshot_url is not None:
            payload["screenshotUrl"] = screenshot_url
        return self._c.request("PATCH", f"/api/v1/keys/{_enc(key_id)}", body=payload)

    def set(
        self,
        key_id: str,
        locale: str,
        *,
        value: str,
        status: Optional[str] = None,
        author: Optional[str] = None,
    ) -> Dict[str, Any]:
        """PUT /api/v1/keys/:keyId/translations/:locale — set a
        translation; returns the translation + ``lengthWarning|None``.

        ``status`` is machine|needs_review|approved.
        """
        payload: Dict[str, Any] = {"value": value}
        if status is not None:
            payload["status"] = status
        if author is not None:
            payload["author"] = author
        return self._c.request(
            "PUT",
            f"/api/v1/keys/{_enc(key_id)}/translations/{_enc(locale)}",
            body=payload,
        )

    def review_queue(
        self,
        project_id: str,
        *,
        locale: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Page:
        """GET /api/v1/projects/:id/review-queue — Page of review items."""
        return self._c.request(
            "GET",
            f"/api/v1/projects/{_enc(project_id)}/review-queue"
            + _qs({"locale": locale, "limit": limit, "cursor": cursor}),
            page=True,
        )

    def approve(self, id: str) -> Dict[str, Any]:
        """POST /api/v1/translations/:id/approve."""
        return self._c.request("POST", f"/api/v1/translations/{_enc(id)}/approve")

    def reject(self, id: str, *, reason: str) -> Dict[str, Any]:
        """POST /api/v1/translations/:id/reject — reject with a reason."""
        return self._c.request(
            "POST",
            f"/api/v1/translations/{_enc(id)}/reject",
            body={"reason": reason},
        )


class _Releases:
    """Immutable per-locale releases + delivery (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def publish(self, project_id: str, *, locale: str) -> Release:
        """POST /api/v1/projects/:id/releases — publish approved
        catalog for a locale (existing release + ``unchanged: true``
        when nothing moved)."""
        return self._c.request(
            "POST",
            f"/api/v1/projects/{_enc(project_id)}/releases",
            body={"locale": locale},
        )

    def list(
        self,
        project_id: str,
        *,
        locale: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Page:
        """GET /api/v1/projects/:id/releases — Page of release summaries."""
        return self._c.request(
            "GET",
            f"/api/v1/projects/{_enc(project_id)}/releases"
            + _qs({"locale": locale, "limit": limit, "cursor": cursor}),
            page=True,
        )

    def get(self, release_id: str) -> Release:
        """GET /api/v1/projects/releases/:releaseId — full release incl.
        catalog (the releases router is mounted under /projects)."""
        return self._c.request("GET", f"/api/v1/projects/releases/{_enc(release_id)}")

    def pull(
        self,
        project_id: str,
        *,
        draft: Optional[bool] = None,
        pseudo: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """GET /api/v1/projects/:id/pull — all-locale catalog bundle
        ``{projectId, sourceLocale, source, locales, fallbacks}``.

        ``draft=True`` includes unreleased strings; ``pseudo=True``
        returns pseudo-localized catalogs for layout testing.
        """
        return self._c.request(
            "GET",
            f"/api/v1/projects/{_enc(project_id)}/pull"
            + _qs({"draft": _flag(draft), "pseudo": _flag(pseudo)}),
        )

    def check(self, project_id: str) -> Dict[str, Any]:
        """GET /api/v1/projects/:id/check — CI gate,
        ``{ok, errors[], warnings[], stats}``."""
        return self._c.request("GET", f"/api/v1/projects/{_enc(project_id)}/check")

    def diff(self, a: str, b: str) -> Dict[str, Any]:
        """GET /api/v1/projects/releases/:a/diff/:b —
        ``{a, b, added[], removed[], changed[]}``."""
        return self._c.request(
            "GET", f"/api/v1/projects/releases/{_enc(a)}/diff/{_enc(b)}"
        )


class _Jobs:
    """Machine-translate + crawl jobs (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def translate(self, project_id: str, *, locale: str) -> TranslationJob:
        """POST /api/v1/projects/:id/translate — queue a machine pass
        for a locale (``alreadyQueued: true`` when one is pending)."""
        return self._c.request(
            "POST",
            f"/api/v1/projects/{_enc(project_id)}/translate",
            body={"locale": locale},
        )

    def crawl(self, project_id: str) -> TranslationJob:
        """POST /api/v1/projects/:id/crawl — queue a site crawl
        (proxy-mode projects)."""
        return self._c.request("POST", f"/api/v1/projects/{_enc(project_id)}/crawl")

    def pages(self, project_id: str) -> Page:
        """GET /api/v1/projects/:id/pages — crawled site pages
        (Page shape; cursor always None)."""
        return self._c.request(
            "GET", f"/api/v1/projects/{_enc(project_id)}/pages", page=True
        )

    def list(self, project_id: str) -> Page:
        """GET /api/v1/projects/:id/jobs — newest 50 jobs (Page shape)."""
        return self._c.request(
            "GET", f"/api/v1/projects/{_enc(project_id)}/jobs", page=True
        )

    def get(self, job_id: str) -> TranslationJob:
        """GET /api/v1/projects/jobs/:jobId — poll one job (the jobs
        router is mounted under /projects)."""
        return self._c.request("GET", f"/api/v1/projects/jobs/{_enc(job_id)}")


class _Glossary:
    """Account/project glossary terms (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def create(
        self,
        *,
        term: str,
        project_id: Optional[str] = None,
        locale: Optional[str] = None,
        translation: Optional[str] = None,
        note: Optional[str] = None,
    ) -> GlossaryTerm:
        """POST /api/v1/glossary — add a term.

        ``translation`` requires ``locale``; both omitted means
        do-not-translate.
        """
        payload: Dict[str, Any] = {"term": term}
        if project_id is not None:
            payload["projectId"] = project_id
        if locale is not None:
            payload["locale"] = locale
        if translation is not None:
            payload["translation"] = translation
        if note is not None:
            payload["note"] = note
        return self._c.request("POST", "/api/v1/glossary", body=payload)

    def list(self, *, project_id: Optional[str] = None) -> Page:
        """GET /api/v1/glossary — Page of GlossaryTerm (cursor None)."""
        return self._c.request(
            "GET",
            "/api/v1/glossary" + _qs({"projectId": project_id}),
            page=True,
        )

    def delete(self, id: str) -> Dict[str, Any]:
        """DELETE /api/v1/glossary/:id — ``{"deleted": true}``."""
        return self._c.request("DELETE", f"/api/v1/glossary/{_enc(id)}")


class _Tm:
    """Translation-memory lookups (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def suggest(self, *, text: str, target: str) -> Dict[str, Any]:
        """GET /api/v1/tm/suggest — ``{"exact": TmEntry|None, "fuzzy": [...]}``."""
        return self._c.request(
            "GET", "/api/v1/tm/suggest" + _qs({"text": text, "target": target})
        )

    def search(self, *, q: str, target: Optional[str] = None) -> Page:
        """GET /api/v1/tm/search — Page of TmEntry (cursor None)."""
        return self._c.request(
            "GET",
            "/api/v1/tm/search" + _qs({"q": q, "target": target}),
            page=True,
        )


class _ApiKeys:
    """API-key management (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def create(self, *, name: str) -> Dict[str, Any]:
        """POST /api/v1/api-keys — mint a key; the plaintext
        ``lv_live_...`` is returned once, store it now."""
        return self._c.request("POST", "/api/v1/api-keys", body={"name": name})

    def list(self) -> Page:
        """GET /api/v1/api-keys — Page of key summaries (cursor None)."""
        return self._c.request("GET", "/api/v1/api-keys", page=True)

    def revoke(self, id: str) -> Dict[str, Any]:
        """DELETE /api/v1/api-keys/:id — ``{"id", "revokedAt"}``."""
        return self._c.request("DELETE", f"/api/v1/api-keys/{_enc(id)}")


class _Billing:
    """Account plan + Plugipay checkout (Bearer auth)."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def get(self) -> Dict[str, Any]:
        """GET /api/v1/billing — ``{"subscription", "earlyAccess",
        "usage", "tiers"}`` (usage carries projects + agentWords)."""
        return self._c.request("GET", "/api/v1/billing")

    def checkout(self, tier: str) -> Dict[str, Any]:
        """POST /api/v1/billing/checkout — ``{"checkoutSessionId",
        "hostedUrl"}``.

        ``tier`` is starter / pro / scale; redirect the browser to
        ``hostedUrl``.
        """
        return self._c.request("POST", "/api/v1/billing/checkout", body={"tier": tier})


class _Public:
    """Unauthenticated surface — never sends Authorization."""

    def __init__(self, c: "LocavelloClient") -> None:
        self._c = c

    def preview(self, *, url: str, target_locale: Optional[str] = None) -> Dict[str, Any]:
        """POST /api/v1/public/preview — kick off a marketing-page
        preview crawl (202), ``{"previewId", ...}``."""
        payload: Dict[str, Any] = {"url": url}
        if target_locale is not None:
            payload["targetLocale"] = target_locale
        return self._c.request(
            "POST", "/api/v1/public/preview", body=payload, no_auth=True
        )

    def preview_result(self, id: str) -> Dict[str, Any]:
        """GET /api/v1/public/preview/:id — poll a preview,
        ``{"status": running|done|failed, "pairs"?, ...}``."""
        return self._c.request(
            "GET", f"/api/v1/public/preview/{_enc(id)}", no_auth=True
        )

    def catalog(self, project_id: str, *, locale: str) -> Dict[str, Any]:
        """GET /api/v1/public/projects/:id/catalog?locale= — published
        catalog for SDK delivery, ``{"projectId", "locale",
        "releaseId", "enabledLocales", "sourceLocale", "catalog"}``."""
        return self._c.request(
            "GET",
            f"/api/v1/public/projects/{_enc(project_id)}/catalog"
            + _qs({"locale": locale}),
            no_auth=True,
        )


class LocavelloClient:
    """Locavello typed client.

    Example:
        client = LocavelloClient(api_key=os.environ["LOCAVELLO_API_KEY"])
        page = client.projects.list()
        client.keys.upsert(
            page["data"][0]["id"],
            keys=[{"name": "cta.title", "sourceText": "Get started"}],
        )
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: str = "https://locavello.forjio.com",
        timeout_ms: int = 30000,
        retry_base_ms: int = 250,
    ) -> None:
        self._api_key = (
            api_key if api_key is not None else os.environ.get("LOCAVELLO_API_KEY")
        )
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout_ms / 1000.0
        self._retry_base_ms = retry_base_ms

        self.projects = _Projects(self)
        self.keys = _Keys(self)
        self.translations = _Translations(self)
        self.releases = _Releases(self)
        self.jobs = _Jobs(self)
        self.glossary = _Glossary(self)
        self.tm = _Tm(self)
        self.api_keys = _ApiKeys(self)
        self.billing = _Billing(self)
        self.public = _Public(self)

    def request(
        self,
        method: str,
        path: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        no_auth: bool = False,
        page: bool = False,
    ) -> Any:
        req_headers = {"Accept": "application/json"}
        if not no_auth:
            if not self._api_key:
                raise LocavelloError(
                    0,
                    "AUTH_REQUIRED",
                    "No API key configured. Pass api_key= or set LOCAVELLO_API_KEY.",
                )
            req_headers["Authorization"] = f"Bearer {self._api_key}"

        # GETs are idempotent — retry on 429/502/503/504 + transport
        # errors, up to _MAX_RETRIES, backing off retry_base_ms * 2^n.
        max_retries = _MAX_RETRIES if method.upper() == "GET" else 0
        attempt = 0
        while True:
            try:
                resp = httpx.request(
                    method,
                    self._base_url + path,
                    json=body,
                    headers=req_headers,
                    timeout=self._timeout,
                )
            except httpx.HTTPError as e:
                if attempt < max_retries:
                    self._backoff(attempt)
                    attempt += 1
                    continue
                if isinstance(e, httpx.TimeoutException):
                    raise LocavelloError(0, "TIMEOUT", f"request timed out: {e}") from e
                raise LocavelloError(0, "NETWORK_ERROR", str(e)) from e
            if resp.status_code in _RETRY_STATUSES and attempt < max_retries:
                self._backoff(attempt)
                attempt += 1
                continue
            break

        try:
            envelope = resp.json()
        except ValueError as e:
            raise LocavelloError(
                resp.status_code,
                "INVALID_RESPONSE",
                f"non-JSON response (HTTP {resp.status_code})",
            ) from e

        error = envelope.get("error") if isinstance(envelope, dict) else None
        meta = envelope.get("meta") if isinstance(envelope, dict) else None
        request_id = meta.get("requestId") if isinstance(meta, dict) else None

        if not (200 <= resp.status_code < 300) or error:
            raise LocavelloError(
                resp.status_code,
                (error or {}).get("code", "UNKNOWN"),
                (error or {}).get("message", f"HTTP {resp.status_code}"),
                request_id,
                (error or {}).get("param"),
            )
        if page:
            m = meta if isinstance(meta, dict) else {}
            return {
                "data": (envelope.get("data") if isinstance(envelope, dict) else None)
                or [],
                "cursor": m.get("cursor"),
                "has_more": bool(m.get("hasMore", False)),
            }
        return envelope.get("data") if isinstance(envelope, dict) else envelope

    def _backoff(self, attempt: int) -> None:
        time.sleep(self._retry_base_ms * (2**attempt) / 1000.0)


__all__ = ["LocavelloClient", "LocavelloError", "paginate"]
