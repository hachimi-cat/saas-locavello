package locavello

import (
	"context"
	"net/url"
)

// GlossaryResource manages forced translations + do-not-translate
// terms (Bearer auth).
type GlossaryResource struct {
	c *Client
}

// GlossaryCreateInput is the payload for Glossary.Create. Locale +
// Translation set → forced translation; both nil → do-not-translate.
// A Translation without a Locale is rejected (422). ProjectID nil =
// account-wide.
type GlossaryCreateInput struct {
	Term        string  `json:"term"`
	ProjectID   *string `json:"projectId,omitempty"`
	Locale      *string `json:"locale,omitempty"`
	Translation *string `json:"translation,omitempty"`
	Note        *string `json:"note,omitempty"`
}

// Create calls POST /api/v1/glossary.
func (r *GlossaryResource) Create(ctx context.Context, input GlossaryCreateInput) (*GlossaryTerm, error) {
	var out GlossaryTerm
	if err := r.c.do(ctx, "POST", "/api/v1/glossary", nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GlossaryListParams filters Glossary.List.
type GlossaryListParams struct {
	// ProjectID scopes to one project's terms plus the account-wide
	// ones.
	ProjectID *string
}

// List calls GET /api/v1/glossary (not cursored; Cursor nil, HasMore
// false).
func (r *GlossaryResource) List(ctx context.Context, params *GlossaryListParams) (*Page[GlossaryTerm], error) {
	q := url.Values{}
	if params != nil && params.ProjectID != nil {
		q.Set("projectId", *params.ProjectID)
	}
	return list[GlossaryTerm](ctx, r.c, "/api/v1/glossary", q)
}

// Delete calls DELETE /api/v1/glossary/{id}.
func (r *GlossaryResource) Delete(ctx context.Context, id string) error {
	return r.c.do(ctx, "DELETE", "/api/v1/glossary/"+url.PathEscape(id), nil, nil, false, nil)
}
