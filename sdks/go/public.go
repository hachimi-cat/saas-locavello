package locavello

import (
	"context"
	"net/url"
)

// PublicResource is the UNauthenticated Mode B surface — the marketing
// preview + the catalog endpoint locavello.js consumes. No API key
// needed; no Authorization header is ever sent.
type PublicResource struct {
	c *Client
}

// PreviewInput is the payload for Public.Preview.
type PreviewInput struct {
	URL string `json:"url"`
	// TargetLocale is a BCP-47 tag; defaults to "id" server-side.
	TargetLocale string `json:"targetLocale,omitempty"`
}

// PreviewStarted is the 202 response to Public.Preview — poll
// Public.PreviewResult with PreviewID.
type PreviewStarted struct {
	PreviewID      string `json:"previewId"`
	URL            string `json:"url"`
	TargetLocale   string `json:"targetLocale"`
	StringsOnPage  int    `json:"stringsOnPage"`
	PreviewedWords int    `json:"previewedWords"`
}

// Preview calls POST /api/v1/public/preview — URL in, an async
// side-by-side translation preview out (agent runs take 30-90s).
func (r *PublicResource) Preview(ctx context.Context, input PreviewInput) (*PreviewStarted, error) {
	var out PreviewStarted
	if err := r.c.do(ctx, "POST", "/api/v1/public/preview", nil, input, true, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PreviewPair is one original/translated string pair.
type PreviewPair struct {
	Original   string `json:"original"`
	Translated string `json:"translated"`
}

// PreviewStatus is a Public.PreviewResult poll response. URL,
// TargetLocale, and Pairs are set when Status is "done"; Error when
// "failed".
type PreviewStatus struct {
	Status       string        `json:"status"` // "running" | "done" | "failed"
	URL          string        `json:"url,omitempty"`
	TargetLocale string        `json:"targetLocale,omitempty"`
	Pairs        []PreviewPair `json:"pairs,omitempty"`
	Error        *string       `json:"error,omitempty"`
}

// PreviewResult calls GET /api/v1/public/preview/{id} — poll a
// preview until Status is "done" or "failed".
func (r *PublicResource) PreviewResult(ctx context.Context, previewID string) (*PreviewStatus, error) {
	var out PreviewStatus
	path := "/api/v1/public/preview/" + url.PathEscape(previewID)
	if err := r.c.do(ctx, "GET", path, nil, nil, true, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PublicCatalog is the serving payload locavello.js reads — the latest
// published release for the locale with its fallback chain
// pre-flattened.
type PublicCatalog struct {
	ProjectID string `json:"projectId"`
	Locale    string `json:"locale"`
	// ReleaseID is nil when the locale has no published release (the
	// catalog then carries fallback content only).
	ReleaseID      *string  `json:"releaseId"`
	EnabledLocales []string `json:"enabledLocales"`
	SourceLocale   string   `json:"sourceLocale"`
	// Catalog maps catalog key name → message.
	Catalog map[string]any `json:"catalog"`
}

// Catalog calls GET /api/v1/public/projects/{id}/catalog — what the
// snippet consumes (CORS-open, cacheable). locale is required.
func (r *PublicResource) Catalog(ctx context.Context, projectID, locale string) (*PublicCatalog, error) {
	q := url.Values{}
	q.Set("locale", locale)
	var out PublicCatalog
	path := "/api/v1/public/projects/" + url.PathEscape(projectID) + "/catalog"
	if err := r.c.do(ctx, "GET", path, q, nil, true, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
