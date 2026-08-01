"""Wire types for the Locavello SDK.

TypedDicts mirror the REST wire shapes exactly (field names are
camelCase, as sent on the wire). They exist for editor / type-checker
support only — runtime values are plain dicts straight from the JSON
envelope, so extra fields the server adds later never break callers.

``Page`` is the SDK-side list wrapper (snake_case ``has_more``); every
cursored list method returns one, and non-cursored list endpoints ride
the same shape with ``cursor=None`` / ``has_more=False``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class Page(TypedDict):
    """SDK list wrapper — ``{"data", "cursor", "has_more"}``."""

    data: List[Any]
    cursor: Optional[str]
    has_more: bool


class Project(TypedDict):
    id: str
    accountId: str
    slug: str
    name: str
    sourceLocale: str
    mode: str
    siteUrl: Optional[str]
    createdAt: str
    updatedAt: str


class ProjectLocaleStat(TypedDict):
    id: str
    projectId: str
    tag: str
    fallback: Optional[str]
    rtl: bool
    enabled: bool
    keyCount: int
    approved: int
    machine: int
    needsReview: int
    missing: int


class Namespace(TypedDict):
    id: str
    projectId: str
    name: str
    reviewPolicy: str


class ProjectDetail(Project, total=False):
    """``projects.get`` payload — a Project plus detail extras."""

    locales: List[ProjectLocaleStat]
    namespaces: List[Namespace]
    lastRelease: Optional[Dict[str, Any]]


class _KeyInputRequired(TypedDict):
    name: str
    sourceText: str


class KeyInput(_KeyInputRequired, total=False):
    """Input row for ``keys.upsert`` (wire camelCase)."""

    namespace: str  # default 'default'
    description: str
    maxLength: int
    context: Dict[str, Any]


class Translation(TypedDict):
    id: str
    keyId: str
    locale: str
    value: str
    status: str  # 'machine' | 'needs_review' | 'approved' | 'rejected'
    author: Optional[str]
    reviewedBy: Optional[str]
    rejectedReason: Optional[str]
    wordCount: int
    createdAt: str
    updatedAt: str


class NamespaceRef(TypedDict):
    name: str
    reviewPolicy: str


class Key(TypedDict):
    id: str
    projectId: str
    namespaceId: str
    name: str
    sourceText: str
    description: Optional[str]
    maxLength: Optional[int]
    context: Any
    placeholders: List[str]
    archived: bool
    createdAt: str
    updatedAt: str
    namespace: NamespaceRef
    translations: List[Translation]


class Release(TypedDict):
    id: str
    projectId: str
    locale: str
    contentHash: str
    catalog: Dict[str, Any]
    keyCount: int
    createdBy: Optional[str]
    createdAt: str


class TranslationJob(TypedDict):
    id: str
    accountId: str
    projectId: str
    locale: Optional[str]
    kind: str  # 'machine_pass' | 'crawl' | 'preview'
    status: str  # 'queued' | 'running' | 'done' | 'failed'
    stats: Dict[str, Any]
    error: Optional[str]
    requestedBy: Optional[str]
    createdAt: str
    updatedAt: str


class GlossaryTerm(TypedDict):
    id: str
    accountId: str
    projectId: Optional[str]
    term: str
    locale: Optional[str]
    translation: Optional[str]
    note: Optional[str]
    createdAt: str


class TmEntry(TypedDict):
    id: str
    accountId: str
    projectId: Optional[str]
    sourceLocale: str
    targetLocale: str
    sourceText: str
    sourceHash: str
    targetText: str
    quality: str  # 'approved' | 'machine'
    createdAt: str
    updatedAt: str


class _CheckIssueRequired(TypedDict):
    type: str
    locale: str
    key: str


class CheckIssue(_CheckIssueRequired, total=False):
    missing: Any
    extra: Any
    maxLength: int
    estimated: int
    term: str
    status: str


__all__ = [
    "Page",
    "Project",
    "ProjectDetail",
    "ProjectLocaleStat",
    "Namespace",
    "NamespaceRef",
    "KeyInput",
    "Key",
    "Translation",
    "Release",
    "TranslationJob",
    "GlossaryTerm",
    "TmEntry",
    "CheckIssue",
]
