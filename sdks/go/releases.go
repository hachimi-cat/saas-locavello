package locavello

import (
	"context"
	"net/url"
	"strconv"
)

// ReleasesResource is the publish / pull / CI-gate surface (Bearer
// auth).
type ReleasesResource struct {
	c *Client
}

// Publish calls POST /api/v1/projects/{id}/releases — publish the
// current catalog for a locale. Idempotent on content: an identical
// catalog returns the existing release with Unchanged true.
func (r *ReleasesResource) Publish(ctx context.Context, projectID, locale string) (*Release, error) {
	var out Release
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/releases"
	payload := map[string]string{"locale": locale}
	if err := r.c.do(ctx, "POST", path, nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReleaseListParams filters Releases.List.
type ReleaseListParams struct {
	Locale *string
	Limit  *int
	Cursor *string
}

// List calls GET /api/v1/projects/{id}/releases — newest first,
// without catalogs.
func (r *ReleasesResource) List(ctx context.Context, projectID string, params *ReleaseListParams) (*Page[ReleaseSummary], error) {
	q := url.Values{}
	if params != nil {
		if params.Locale != nil {
			q.Set("locale", *params.Locale)
		}
		if params.Limit != nil {
			q.Set("limit", strconv.Itoa(*params.Limit))
		}
		if params.Cursor != nil {
			q.Set("cursor", *params.Cursor)
		}
	}
	return list[ReleaseSummary](ctx, r.c, "/api/v1/projects/"+url.PathEscape(projectID)+"/releases", q)
}

// Get calls GET /api/v1/projects/releases/{releaseId} — the full
// release including its frozen catalog. (The releases router is
// mounted under /projects, hence the path.)
func (r *ReleasesResource) Get(ctx context.Context, releaseID string) (*Release, error) {
	var out Release
	path := "/api/v1/projects/releases/" + url.PathEscape(releaseID)
	if err := r.c.do(ctx, "GET", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PullParams tunes Releases.Pull.
type PullParams struct {
	// Draft builds a draft catalog on the fly for locales with no
	// release yet.
	Draft bool
	// Pseudo synthesizes the en-XA pseudo-locale from source text.
	Pseudo bool
}

// PullLocale is one locale's slot in a PullResult.
type PullLocale struct {
	// Catalog maps catalog key name → message.
	Catalog map[string]any `json:"catalog"`
	// ReleaseID is nil for draft/pseudo builds.
	ReleaseID   *string `json:"releaseId"`
	ContentHash string  `json:"contentHash"`
}

// PullResult is the CI pull payload: per-locale catalogs plus the
// source-locale key list (the d.ts input).
type PullResult struct {
	ProjectID    string                `json:"projectId"`
	SourceLocale string                `json:"sourceLocale"`
	Source       map[string]string     `json:"source"`
	Locales      map[string]PullLocale `json:"locales"`
	// Fallbacks maps locale tag → its fallback tag (nil = none).
	Fallbacks map[string]*string `json:"fallbacks"`
}

// Pull calls GET /api/v1/projects/{id}/pull — the CI endpoint: latest
// release catalogs per enabled locale + the source key list.
func (r *ReleasesResource) Pull(ctx context.Context, projectID string, params *PullParams) (*PullResult, error) {
	q := url.Values{}
	if params != nil {
		if params.Draft {
			q.Set("draft", "true")
		}
		if params.Pseudo {
			q.Set("pseudo", "true")
		}
	}
	var out PullResult
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/pull"
	if err := r.c.do(ctx, "GET", path, q, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CheckStats summarizes what Releases.Check inspected.
type CheckStats struct {
	Keys    int `json:"keys"`
	Locales int `json:"locales"`
}

// CheckResult is the CI gate report — fail the build on non-empty
// Errors.
type CheckResult struct {
	OK       bool         `json:"ok"`
	Errors   []CheckIssue `json:"errors"`
	Warnings []CheckIssue `json:"warnings"`
	Stats    CheckStats   `json:"stats"`
}

// Check calls GET /api/v1/projects/{id}/check — missing keys,
// placeholder mismatches, length overflows, glossary violations.
func (r *ReleasesResource) Check(ctx context.Context, projectID string) (*CheckResult, error) {
	var out CheckResult
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/check"
	if err := r.c.do(ctx, "GET", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReleaseRef identifies one side of a diff.
type ReleaseRef struct {
	ID   string `json:"id"`
	Hash string `json:"hash"`
}

// DiffChange is one changed key in a release diff.
type DiffChange struct {
	Key  string `json:"key"`
	From string `json:"from"`
	To   string `json:"to"`
}

// ReleaseDiff is the key-level diff between two releases (b relative
// to a).
type ReleaseDiff struct {
	A       ReleaseRef   `json:"a"`
	B       ReleaseRef   `json:"b"`
	Added   []string     `json:"added"`
	Removed []string     `json:"removed"`
	Changed []DiffChange `json:"changed"`
}

// Diff calls GET /api/v1/projects/releases/{a}/diff/{b}.
func (r *ReleasesResource) Diff(ctx context.Context, releaseA, releaseB string) (*ReleaseDiff, error) {
	var out ReleaseDiff
	path := "/api/v1/projects/releases/" + url.PathEscape(releaseA) + "/diff/" + url.PathEscape(releaseB)
	if err := r.c.do(ctx, "GET", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
