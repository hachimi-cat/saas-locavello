package locavello

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
)

// TranslationsResource is the workbench + review surface (Bearer auth).
type TranslationsResource struct {
	c *Client
}

// KeyUpdateInput is the payload for Translations.UpdateKey — context
// metadata edits from the workbench. Nil fields are omitted.
type KeyUpdateInput struct {
	Description   *string `json:"description,omitempty"`
	MaxLength     *int    `json:"maxLength,omitempty"`
	ScreenshotURL *string `json:"screenshotUrl,omitempty"`
}

// UpdateKey calls PATCH /api/v1/keys/{keyId}.
func (r *TranslationsResource) UpdateKey(ctx context.Context, keyID string, input KeyUpdateInput) (*Key, error) {
	var out Key
	if err := r.c.do(ctx, "PATCH", "/api/v1/keys/"+url.PathEscape(keyID), nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// TranslationSetInput is the payload for Translations.Set.
type TranslationSetInput struct {
	Value string `json:"value"`
	// Status defaults to StatusNeedsReview server-side; StatusMachine
	// (agent first pass) and StatusApproved (edit + approve in one
	// step) are also accepted. Gated namespaces downgrade machine
	// writes to needs_review.
	Status string `json:"status,omitempty"`
	Author string `json:"author,omitempty"`
}

// LengthWarning flags a value whose estimated display length exceeds
// the key's MaxLength.
type LengthWarning struct {
	MaxLength int `json:"maxLength"`
	Estimated int `json:"estimated"`
}

// TranslationSetResult is the written translation plus an optional
// length warning.
type TranslationSetResult struct {
	Translation
	LengthWarning *LengthWarning `json:"lengthWarning"`
}

// Set calls PUT /api/v1/keys/{keyId}/translations/{locale} — write a
// translation. The placeholder-safety gate is enforced server-side on
// every write (code PLACEHOLDER_MISMATCH on violation).
func (r *TranslationsResource) Set(ctx context.Context, keyID, locale string, input TranslationSetInput) (*TranslationSetResult, error) {
	var out TranslationSetResult
	path := "/api/v1/keys/" + url.PathEscape(keyID) + "/translations/" + url.PathEscape(locale)
	if err := r.c.do(ctx, "PUT", path, nil, input, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ReviewKey is the key context attached to a review-queue item.
type ReviewKey struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	SourceText    string          `json:"sourceText"`
	Description   *string         `json:"description"`
	ScreenshotURL *string         `json:"screenshotUrl"`
	MaxLength     *int            `json:"maxLength"`
	Placeholders  []string        `json:"placeholders"`
	Context       json.RawMessage `json:"context"`
	Namespace     KeyNamespace    `json:"namespace"`
}

// ReviewItem is one review-queue entry: the pending translation plus
// the key context the reviewer needs.
type ReviewItem struct {
	Translation
	Key ReviewKey `json:"key"`
}

// ReviewQueueParams filters Translations.ReviewQueue.
type ReviewQueueParams struct {
	Locale *string
	Limit  *int
	Cursor *string
}

// ReviewQueue calls GET /api/v1/projects/{id}/review-queue —
// everything machine-produced or flagged, oldest first.
func (r *TranslationsResource) ReviewQueue(ctx context.Context, projectID string, params *ReviewQueueParams) (*Page[ReviewItem], error) {
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
	return list[ReviewItem](ctx, r.c, "/api/v1/projects/"+url.PathEscape(projectID)+"/review-queue", q)
}

// Approve calls POST /api/v1/translations/{id}/approve — approve a
// translation (and feed the TM).
func (r *TranslationsResource) Approve(ctx context.Context, translationID string) (*Translation, error) {
	var out Translation
	path := "/api/v1/translations/" + url.PathEscape(translationID) + "/approve"
	if err := r.c.do(ctx, "POST", path, nil, nil, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Reject calls POST /api/v1/translations/{id}/reject with a reason.
func (r *TranslationsResource) Reject(ctx context.Context, translationID, reason string) (*Translation, error) {
	var out Translation
	path := "/api/v1/translations/" + url.PathEscape(translationID) + "/reject"
	payload := map[string]string{"reason": reason}
	if err := r.c.do(ctx, "POST", path, nil, payload, false, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
