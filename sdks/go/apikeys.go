package locavello

import (
	"context"
	"net/url"
)

// APIKeysResource manages the account's lv_live_… API keys (Bearer
// auth).
type APIKeysResource struct {
	c *Client
}

// APIKeyCreated is APIKeys.Create's response — the only time the full
// plaintext key is ever returned.
type APIKeyCreated struct {
	ID        string `json:"id"`
	AccountID string `json:"accountId"`
	Name      string `json:"name"`
	// Prefix is the display stub ("lv_live_ab…").
	Prefix     string  `json:"prefix"`
	CreatedBy  *string `json:"createdBy"`
	LastUsedAt *string `json:"lastUsedAt"`
	RevokedAt  *string `json:"revokedAt"`
	CreatedAt  string  `json:"createdAt"`
	// Plaintext is the full lv_live_… key — shown ONCE, stored only as
	// a hash server-side.
	Plaintext string `json:"plaintext"`
}

// Create calls POST /api/v1/api-keys — mint a key. Persist
// out.Plaintext immediately; it cannot be recovered later.
func (r *APIKeysResource) Create(ctx context.Context, name string) (*APIKeyCreated, error) {
	var out APIKeyCreated
	payload := map[string]string{"name": name}
	if err := r.c.do(ctx, "POST", "/api/v1/api-keys", nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// APIKeySummary is one row of APIKeys.List (never includes the
// plaintext).
type APIKeySummary struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Prefix     string  `json:"prefix"`
	LastUsedAt *string `json:"lastUsedAt"`
	RevokedAt  *string `json:"revokedAt"`
	CreatedAt  string  `json:"createdAt"`
}

// List calls GET /api/v1/api-keys (not cursored; Cursor nil, HasMore
// false).
func (r *APIKeysResource) List(ctx context.Context) (*Page[APIKeySummary], error) {
	return list[APIKeySummary](ctx, r.c, "/api/v1/api-keys", nil)
}

// APIKeyRevoked is APIKeys.Revoke's response.
type APIKeyRevoked struct {
	ID        string `json:"id"`
	RevokedAt string `json:"revokedAt"`
}

// Revoke calls DELETE /api/v1/api-keys/{id}.
func (r *APIKeysResource) Revoke(ctx context.Context, id string) (*APIKeyRevoked, error) {
	var out APIKeyRevoked
	if err := r.c.do(ctx, "DELETE", "/api/v1/api-keys/"+url.PathEscape(id), nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
