package locavello

import (
	"context"
	"net/url"
	"strconv"
)

// KeysResource is the extract/push + workbench key surface (Bearer
// auth).
type KeysResource struct {
	c *Client
}

// KeyUpsertInput is the payload for Keys.Upsert. Max 2000 keys per
// request.
type KeyUpsertInput struct {
	Keys []KeyInput `json:"keys"`
	// Prune archives keys of the SAME namespaces that are absent from
	// this payload — extract sends the complete picture of a namespace
	// (prune true); push sends partial updates (prune false, the wire
	// default).
	Prune bool `json:"prune,omitempty"`
}

// KeyUpsertResult is the bulk-upsert outcome.
type KeyUpsertResult struct {
	Created  int `json:"created"`
	Updated  int `json:"updated"`
	Archived int `json:"archived"`
}

// Upsert calls PUT /api/v1/projects/{id}/keys — bulk-upsert keys with
// source text + context. ICU placeholders are derived server-side.
func (r *KeysResource) Upsert(ctx context.Context, projectID string, input KeyUpsertInput) (*KeyUpsertResult, error) {
	var out KeyUpsertResult
	path := "/api/v1/projects/" + url.PathEscape(projectID) + "/keys"
	if err := r.c.do(ctx, "PUT", path, nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// KeyListParams filters Keys.List.
type KeyListParams struct {
	// Namespace filters to one namespace by name.
	Namespace *string
	// Q is a substring search on key name + source text.
	Q *string
	// Locale + Status filter by translation state for a locale; Status
	// is one of StatusMissing, StatusMachine, StatusNeedsReview,
	// StatusApproved, StatusRejected (StatusMissing = no row).
	Locale *string
	Status *string
	// Archived includes archived keys when true.
	Archived bool
	// Limit caps the page size.
	Limit *int
	// Cursor is the opaque cursor from a previous page.
	Cursor *string
}

// List calls GET /api/v1/projects/{id}/keys — the workbench list,
// newest first.
func (r *KeysResource) List(ctx context.Context, projectID string, params *KeyListParams) (*Page[Key], error) {
	q := url.Values{}
	if params != nil {
		if params.Namespace != nil {
			q.Set("namespace", *params.Namespace)
		}
		if params.Q != nil {
			q.Set("q", *params.Q)
		}
		if params.Locale != nil {
			q.Set("locale", *params.Locale)
		}
		if params.Status != nil {
			q.Set("status", *params.Status)
		}
		if params.Archived {
			q.Set("archived", "true")
		}
		if params.Limit != nil {
			q.Set("limit", strconv.Itoa(*params.Limit))
		}
		if params.Cursor != nil {
			q.Set("cursor", *params.Cursor)
		}
	}
	return list[Key](ctx, r.c, "/api/v1/projects/"+url.PathEscape(projectID)+"/keys", q)
}
