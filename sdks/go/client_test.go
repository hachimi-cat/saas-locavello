package locavello

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func okEnvelope(data any) map[string]any {
	return map[string]any{
		"data":  data,
		"error": nil,
		"meta":  map[string]any{"requestId": "req_ok", "timestamp": "now"},
	}
}

func TestNew(t *testing.T) {
	c := New(Config{APIKey: "lv_live_x"})
	if c == nil {
		t.Fatal("client is nil")
	}
	if c.Projects == nil || c.Keys == nil || c.Translations == nil || c.Releases == nil ||
		c.Jobs == nil || c.Glossary == nil || c.TM == nil || c.APIKeys == nil ||
		c.Billing == nil || c.Public == nil {
		t.Fatal("resource namespaces not wired")
	}
}

// Matrix 1: authed calls carry the Bearer header; Public sends none.
func TestAuthHeaderPresentOnAuthedAbsentOnPublic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/billing":
			if got := r.Header.Get("Authorization"); got != "Bearer lv_live_test" {
				t.Errorf("auth header = %q, want %q", got, "Bearer lv_live_test")
			}
			_ = json.NewEncoder(w).Encode(okEnvelope(map[string]any{
				"subscription": map[string]any{"id": nil, "accountId": "acc_1", "tier": "free", "status": "active"},
				"earlyAccess":  true,
				"usage":        map[string]any{"projects": 1, "agentWords": map[string]int{"used": 40, "limit": 1000}},
				"tiers":        []any{map[string]any{"id": "starter", "name": "Starter", "priceIdr": 90000}},
			}))
		case "/api/v1/public/projects/prj_1/catalog":
			if got := r.Header.Get("Authorization"); got != "" {
				t.Errorf("unexpected auth header on public call: %q", got)
			}
			if got := r.URL.Query().Get("locale"); got != "id" {
				t.Errorf("locale = %q, want %q", got, "id")
			}
			_ = json.NewEncoder(w).Encode(okEnvelope(map[string]any{
				"projectId": "prj_1", "locale": "id", "releaseId": "rel_1",
				"enabledLocales": []string{"id"}, "sourceLocale": "en",
				"catalog": map[string]string{"default:hello": "Halo"},
			}))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	info, err := c.Billing.Get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if info.Subscription.Tier != TierFree || info.Usage.AgentWords.Used != 40 {
		t.Errorf("unexpected billing info: %+v", info)
	}
	cat, err := c.Public.Catalog(context.Background(), "prj_1", "id")
	if err != nil {
		t.Fatal(err)
	}
	if cat.Catalog["default:hello"] != "Halo" {
		t.Errorf("catalog = %v", cat.Catalog)
	}
}

// Matrix 2: the envelope's data slot is decoded; meta is ignored on
// non-list calls.
func TestEnvelopeDataUnwrap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/projects/prj_1" {
			t.Errorf("path = %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"id": "prj_1", "accountId": "acc_1", "slug": "site", "name": "Site",
				"sourceLocale": "en", "mode": "sdk", "siteUrl": nil,
				"createdAt": "2026-08-01T00:00:00Z", "updatedAt": "2026-08-01T00:00:00Z",
				"locales": []any{map[string]any{
					"id": "loc_1", "projectId": "prj_1", "tag": "id", "fallback": nil,
					"rtl": false, "enabled": true, "keyCount": 10, "approved": 4,
					"machine": 3, "needsReview": 2, "missing": 1,
				}},
				"namespaces":  []any{map[string]any{"id": "ns_1", "projectId": "prj_1", "name": "default", "reviewPolicy": "standard"}},
				"lastRelease": map[string]any{"id": "rel_9", "locale": "id", "keyCount": 7, "createdAt": "2026-08-01T00:00:00Z"},
			},
			"error": nil,
			"meta":  map[string]any{"requestId": "req_g", "timestamp": "now", "cursor": "IGNORED", "hasMore": true},
		})
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_k", BaseURL: srv.URL})
	out, err := c.Projects.Get(context.Background(), "prj_1")
	if err != nil {
		t.Fatal(err)
	}
	if out.Slug != "site" || out.Mode != ModeSDK || out.SiteURL != nil {
		t.Errorf("unexpected project: %+v", out.Project)
	}
	if len(out.Locales) != 1 || out.Locales[0].Tag != "id" || out.Locales[0].Missing != 1 {
		t.Errorf("unexpected locales: %+v", out.Locales)
	}
	if out.LastRelease == nil || out.LastRelease.ID != "rel_9" {
		t.Errorf("unexpected lastRelease: %+v", out.LastRelease)
	}
}

// Matrix 3: a 404 envelope error maps to *Error with code NOT_FOUND,
// status 404, and the meta requestId.
func TestErrorMapping(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data":  nil,
			"error": map[string]any{"code": "NOT_FOUND", "message": "project not found"},
			"meta":  map[string]any{"requestId": "req_x", "timestamp": "now"},
		})
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_k", BaseURL: srv.URL})
	_, err := c.Projects.Get(context.Background(), "prj_missing")
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *Error, got %T", err)
	}
	if apiErr.Code != "NOT_FOUND" || apiErr.Status != 404 || apiErr.RequestID != "req_x" {
		t.Errorf("unexpected error: %+v", apiErr)
	}
	if got := apiErr.Error(); got != "locavello: NOT_FOUND: project not found" {
		t.Errorf("Error() = %q", got)
	}
}

// Matrix 4: an authed call with no API key fails fast with
// AUTH_REQUIRED, status 0, and NO request is made.
func TestAuthRequiredWithoutKeyMakesNoRequest(t *testing.T) {
	t.Setenv("LOCAVELLO_API_KEY", "")
	var hits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		_ = json.NewEncoder(w).Encode(okEnvelope(nil))
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL})
	_, err := c.Billing.Get(context.Background())
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Code != "AUTH_REQUIRED" || apiErr.Status != 0 {
		t.Fatalf("expected AUTH_REQUIRED status 0, got %v", err)
	}
	if n := atomic.LoadInt32(&hits); n != 0 {
		t.Errorf("expected 0 requests, stub saw %d", n)
	}
}

// Matrix 5: cursor/hasMore ride the envelope META; Paginate walks both
// pages and collects every item.
func TestPaginatedListAndPaginateHelper(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		if r.URL.Path != "/api/v1/projects" {
			t.Errorf("path = %s", r.URL.Path)
		}
		switch cursor := r.URL.Query().Get("cursor"); cursor {
		case "":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data":  []any{map[string]any{"id": "prj_1"}, map[string]any{"id": "prj_2"}},
				"error": nil,
				"meta":  map[string]any{"requestId": "req_1", "timestamp": "now", "cursor": "cur_2", "hasMore": true},
			})
		case "cur_2":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data":  []any{map[string]any{"id": "prj_3"}},
				"error": nil,
				"meta":  map[string]any{"requestId": "req_2", "timestamp": "now", "cursor": nil, "hasMore": false},
			})
		default:
			t.Errorf("unexpected cursor %q", cursor)
		}
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_k", BaseURL: srv.URL})
	page, err := c.Projects.List(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 2 || !page.HasMore || page.Cursor == nil || *page.Cursor != "cur_2" {
		t.Errorf("unexpected first page: data=%d cursor=%v hasMore=%v", len(page.Data), page.Cursor, page.HasMore)
	}

	all, err := Paginate(context.Background(), func(ctx context.Context, cursor *string) (*Page[Project], error) {
		return c.Projects.List(ctx, &ProjectListParams{Cursor: cursor})
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 || all[0].ID != "prj_1" || all[2].ID != "prj_3" {
		t.Errorf("unexpected collected items: %+v", all)
	}
	// 1 direct call + 2 pages walked by Paginate.
	if n := atomic.LoadInt32(&calls); n != 3 {
		t.Errorf("expected 3 requests, stub saw %d", n)
	}
}

// Matrix 6a: a GET answering 503, 503, 200 succeeds via retries.
func TestGetRetriesOn503ThenSucceeds(t *testing.T) {
	var gets int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("unexpected method %s", r.Method)
		}
		if atomic.AddInt32(&gets, 1) <= 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data":  nil,
				"error": map[string]any{"code": "SERVICE_UNAVAILABLE", "message": "try again"},
				"meta":  map[string]any{"requestId": "req_r", "timestamp": "now"},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(okEnvelope(map[string]any{
			"id": "tj_1", "accountId": "acc_1", "kind": "machine_pass", "status": "done",
		}))
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_k", BaseURL: srv.URL, RetryBaseMs: 1})
	job, err := c.Jobs.Get(context.Background(), "tj_1")
	if err != nil {
		t.Fatal(err)
	}
	if job.ID != "tj_1" || job.Status != JobStatusDone {
		t.Errorf("unexpected job: %+v", job)
	}
	if n := atomic.LoadInt32(&gets); n != 3 {
		t.Errorf("expected 3 attempts, stub saw %d", n)
	}
}

// Matrix 6b: a POST answering 503 is NOT retried — exactly 1 request.
func TestPostIsNeverRetried(t *testing.T) {
	var posts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&posts, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data":  nil,
			"error": map[string]any{"code": "SERVICE_UNAVAILABLE", "message": "down"},
			"meta":  map[string]any{"requestId": "req_p", "timestamp": "now"},
		})
	}))
	defer srv.Close()

	c := New(Config{APIKey: "lv_live_k", BaseURL: srv.URL, RetryBaseMs: 1})
	_, err := c.Projects.Create(context.Background(), ProjectCreateInput{Slug: "s", Name: "S"})
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Status != 503 {
		t.Fatalf("expected 503 *Error, got %v", err)
	}
	if n := atomic.LoadInt32(&posts); n != 1 {
		t.Errorf("expected exactly 1 request, stub saw %d", n)
	}
}
