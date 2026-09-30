package locavello

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Client.API (api_generated.go) goes through apigenRequest: the same key,
// envelope and retries as every hand-written call.

type apigenSeen struct {
	method, uri, auth, contentType string
	body                           []byte
}

func apigenServer(t *testing.T, status int, env map[string]any) (*httptest.Server, *[]apigenSeen) {
	t.Helper()
	var seen []apigenSeen
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, apigenSeen{r.Method, r.URL.RequestURI(), r.Header.Get("Authorization"), r.Header.Get("Content-Type"), body})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(env)
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func TestAPI_ListSendsQueryAndKey(t *testing.T) {
	srv, seen := apigenServer(t, 200, okEnvelope([]any{map[string]any{"id": "gl_1"}}))
	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	data, err := c.API.GlossaryList(context.Background(), &GlossaryListArgs{ProjectID: "prj 1"})
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `[{"id":"gl_1"}]` {
		t.Fatalf("data = %s", data)
	}
	r := (*seen)[0]
	if r.method != "GET" || r.uri != "/api/v1/glossary?projectId=prj+1" || len(r.body) != 0 || r.auth != "Bearer lv_live_test" {
		t.Fatalf("request = %+v", r)
	}
}

func TestAPI_CreateSendsBody(t *testing.T) {
	srv, seen := apigenServer(t, 201, okEnvelope(map[string]any{"id": "gl_2"}))
	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	_, err := c.API.GlossaryCreate(context.Background(), &GlossaryCreateArgs{
		Term: "checkout", Locale: Ptr("id"),
		Body: map[string]any{"note": "from Body", "term": "overridden"},
	})
	if err != nil {
		t.Fatal(err)
	}
	r := (*seen)[0]
	if r.method != "POST" || r.uri != "/api/v1/glossary" || r.auth != "Bearer lv_live_test" || r.contentType != "application/json" {
		t.Fatalf("request = %+v", r)
	}
	if string(r.body) != `{"locale":"id","note":"from Body","term":"checkout"}` {
		t.Fatalf("body = %s", r.body)
	}
}

func TestAPI_PublicRouteSendsNoKey(t *testing.T) {
	srv, seen := apigenServer(t, 200, okEnvelope(map[string]any{"catalog": map[string]any{}}))
	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	if _, err := c.API.PublicProjectsCatalog(context.Background(), "prj/1", &PublicProjectsCatalogArgs{Locale: "id"}); err != nil {
		t.Fatal(err)
	}
	r := (*seen)[0]
	if r.uri != "/api/v1/public/projects/prj%2F1/catalog?locale=id" || r.auth != "" {
		t.Fatalf("request = %+v", r)
	}
}

func TestAPI_RequiredFieldMissing(t *testing.T) {
	srv, seen := apigenServer(t, 200, okEnvelope(nil))
	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	_, err := c.API.GlossaryCreate(context.Background(), &GlossaryCreateArgs{Locale: Ptr("id")})
	if err == nil || !strings.Contains(err.Error(), "Term") {
		t.Fatalf("err = %v, want a missing Term", err)
	}
	if len(*seen) != 0 {
		t.Fatalf("sent %d requests", len(*seen))
	}
}

func TestAPI_ErrorEnvelope(t *testing.T) {
	srv, _ := apigenServer(t, 404, map[string]any{"data": nil, "error": map[string]any{"code": "NOT_FOUND", "message": "nope"}, "meta": map[string]any{"requestId": "req_9"}})
	c := New(Config{APIKey: "lv_live_test", BaseURL: srv.URL})
	_, err := c.API.ProjectsGet(context.Background(), "prj_x")
	e, ok := err.(*Error)
	if !ok || e.Status != 404 || e.Code != "NOT_FOUND" || e.RequestID != "req_9" {
		t.Fatalf("err = %#v", err)
	}
}
