package locavello

import (
	"context"
	"net/url"
	"strconv"
)

// ProjectsResource manages projects, their locales, and namespaces
// (Bearer auth).
type ProjectsResource struct {
	c *Client
}

// ProjectCreateInput is the payload for Projects.Create.
type ProjectCreateInput struct {
	// Slug is lowercase alphanumeric/hyphen, 2-64 chars, unique per
	// account.
	Slug string `json:"slug"`
	Name string `json:"name"`
	// SourceLocale defaults to "en" server-side.
	SourceLocale string `json:"sourceLocale,omitempty"`
	// Mode is ModeSDK (default) or ModeProxy; proxy projects require
	// SiteURL.
	Mode    string `json:"mode,omitempty"`
	SiteURL string `json:"siteUrl,omitempty"`
}

// Create calls POST /api/v1/projects.
func (r *ProjectsResource) Create(ctx context.Context, input ProjectCreateInput) (*Project, error) {
	var out Project
	if err := r.c.do(ctx, "POST", "/api/v1/projects", nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ProjectListParams filters Projects.List.
type ProjectListParams struct {
	// Limit caps the page size.
	Limit *int
	// Cursor is the opaque cursor from a previous page.
	Cursor *string
}

// List calls GET /api/v1/projects — newest first.
func (r *ProjectsResource) List(ctx context.Context, params *ProjectListParams) (*Page[Project], error) {
	q := url.Values{}
	if params != nil {
		if params.Limit != nil {
			q.Set("limit", strconv.Itoa(*params.Limit))
		}
		if params.Cursor != nil {
			q.Set("cursor", *params.Cursor)
		}
	}
	return list[Project](ctx, r.c, "/api/v1/projects", q)
}

// ProjectDetail is Projects.Get's response — the project plus per-locale
// completion stats, its namespaces, and the most recent release.
type ProjectDetail struct {
	Project
	Locales     []ProjectLocaleStat `json:"locales"`
	Namespaces  []Namespace         `json:"namespaces"`
	LastRelease *ReleaseSummary     `json:"lastRelease"`
}

// Get calls GET /api/v1/projects/{id}.
func (r *ProjectsResource) Get(ctx context.Context, id string) (*ProjectDetail, error) {
	var out ProjectDetail
	if err := r.c.do(ctx, "GET", "/api/v1/projects/"+url.PathEscape(id), nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ProjectUpdateInput is the payload for Projects.Update. Nil fields are
// omitted. SiteURL is nullable on the wire; clearing it (explicit null)
// is not expressible through this struct.
type ProjectUpdateInput struct {
	Name    *string `json:"name,omitempty"`
	SiteURL *string `json:"siteUrl,omitempty"`
}

// Update calls PATCH /api/v1/projects/{id}.
func (r *ProjectsResource) Update(ctx context.Context, id string, input ProjectUpdateInput) (*Project, error) {
	var out Project
	if err := r.c.do(ctx, "PATCH", "/api/v1/projects/"+url.PathEscape(id), nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// LocaleAddInput is the payload for Projects.AddLocale. The source
// locale is implicit — add targets only.
type LocaleAddInput struct {
	// Tag is a BCP-47 tag like "id" or "pt-BR".
	Tag string `json:"tag"`
	// Fallback is the tag whose catalog fills this locale's gaps.
	Fallback *string `json:"fallback,omitempty"`
	RTL      bool    `json:"rtl,omitempty"`
}

// AddLocale calls POST /api/v1/projects/{id}/locales.
func (r *ProjectsResource) AddLocale(ctx context.Context, id string, input LocaleAddInput) (*ProjectLocale, error) {
	var out ProjectLocale
	path := "/api/v1/projects/" + url.PathEscape(id) + "/locales"
	if err := r.c.do(ctx, "POST", path, nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// LocaleUpdateInput is the payload for Projects.UpdateLocale. Nil
// fields are omitted.
type LocaleUpdateInput struct {
	Fallback *string `json:"fallback,omitempty"`
	RTL      *bool   `json:"rtl,omitempty"`
	Enabled  *bool   `json:"enabled,omitempty"`
}

// UpdateLocale calls PATCH /api/v1/projects/{id}/locales/{tag}.
func (r *ProjectsResource) UpdateLocale(ctx context.Context, id, tag string, input LocaleUpdateInput) (*ProjectLocale, error) {
	var out ProjectLocale
	path := "/api/v1/projects/" + url.PathEscape(id) + "/locales/" + url.PathEscape(tag)
	if err := r.c.do(ctx, "PATCH", path, nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Locales calls GET /api/v1/projects/{id}/locales — per-locale
// completion stats. Plain array (not cursored) — returned directly,
// not as a Page.
func (r *ProjectsResource) Locales(ctx context.Context, id string) ([]ProjectLocaleStat, error) {
	var out []ProjectLocaleStat
	path := "/api/v1/projects/" + url.PathEscape(id) + "/locales"
	if err := r.c.do(ctx, "GET", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// NamespaceAddInput is the payload for Projects.AddNamespace.
type NamespaceAddInput struct {
	Name string `json:"name"`
	// ReviewPolicy is ReviewPolicyStandard (default) or ReviewPolicyGated.
	ReviewPolicy string `json:"reviewPolicy,omitempty"`
}

// AddNamespace calls POST /api/v1/projects/{id}/namespaces.
func (r *ProjectsResource) AddNamespace(ctx context.Context, id string, input NamespaceAddInput) (*Namespace, error) {
	var out Namespace
	path := "/api/v1/projects/" + url.PathEscape(id) + "/namespaces"
	if err := r.c.do(ctx, "POST", path, nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateNamespace calls PATCH /api/v1/projects/{id}/namespaces/{name} —
// switch the review policy ("standard" | "gated").
func (r *ProjectsResource) UpdateNamespace(ctx context.Context, id, name, reviewPolicy string) (*Namespace, error) {
	var out Namespace
	path := "/api/v1/projects/" + url.PathEscape(id) + "/namespaces/" + url.PathEscape(name)
	payload := map[string]string{"reviewPolicy": reviewPolicy}
	if err := r.c.do(ctx, "PATCH", path, nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
