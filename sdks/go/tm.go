package locavello

import (
	"context"
	"net/url"
)

// TMResource is the account-wide translation-memory surface (Bearer
// auth).
type TMResource struct {
	c *Client
}

// TmSuggestResult is TM.Suggest's response: the exact sourceHash match
// (nil when none) plus up to 5 fuzzy candidates.
type TmSuggestResult struct {
	Exact *TmEntry  `json:"exact"`
	Fuzzy []TmEntry `json:"fuzzy"`
}

// Suggest calls GET /api/v1/tm/suggest — workbench + agent
// suggestions for a source text and target locale (both required).
func (r *TMResource) Suggest(ctx context.Context, text, target string) (*TmSuggestResult, error) {
	q := url.Values{}
	q.Set("text", text)
	q.Set("target", target)
	var out TmSuggestResult
	if err := r.c.do(ctx, "GET", "/api/v1/tm/suggest", q, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Search calls GET /api/v1/tm/search — cross-project TM search on
// source + target text. q is required; target optionally narrows the
// target locale. Not cursored (Cursor nil, HasMore false).
func (r *TMResource) Search(ctx context.Context, q string, target *string) (*Page[TmEntry], error) {
	query := url.Values{}
	query.Set("q", q)
	if target != nil {
		query.Set("target", *target)
	}
	return list[TmEntry](ctx, r.c, "/api/v1/tm/search", query)
}
