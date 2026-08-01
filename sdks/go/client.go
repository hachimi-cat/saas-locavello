// Package locavello is the Go SDK for the Locavello localization
// platform REST API (locavello.forjio.com).
// Sister to @forjio/locavello (JS) and forjio-locavello (Python).
//
// Auth = Bearer token — an lv_live_… API key from the dashboard. Pass
// Config.APIKey or set LOCAVELLO_API_KEY. The Public resource (the
// unauthenticated Mode B preview + catalog serving surface) needs no
// key at all and never sends an Authorization header.
//
// Every response rides the Forjio envelope {data, error, meta}; the
// client unwraps it and returns *Error (carrying the envelope's
// error.code) on failure. List endpoints carry cursor/hasMore in meta
// and are surfaced as Page[T]; Paginate walks all pages.
//
// Idempotent GET requests are retried automatically on HTTP 429, 502,
// 503, 504 and transport-level network errors (max 2 retries,
// exponential backoff from Config.RetryBaseMs, default 250ms).
// Non-GET requests are never retried.
package locavello

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// maxRetries is the number of retries after the initial attempt for
// idempotent GET requests (3 attempts total).
const maxRetries = 2

// Client is the Locavello typed client.
type Client struct {
	apiKey    string
	baseURL   string
	httpc     *http.Client
	retryBase time.Duration

	// Resource namespaces — mirror the JS + Python SDKs.
	Projects     *ProjectsResource
	Keys         *KeysResource
	Translations *TranslationsResource
	Releases     *ReleasesResource
	Jobs         *JobsResource
	Glossary     *GlossaryResource
	TM           *TMResource
	APIKeys      *APIKeysResource
	Billing      *BillingResource
	Public       *PublicResource
}

// Config holds the credentials + endpoint overrides.
type Config struct {
	// APIKey is the lv_live_… API key (Dashboard → API keys). Defaults
	// to the LOCAVELLO_API_KEY env var. Optional — Public works
	// without it.
	APIKey string
	// BaseURL overrides the API base. Default: https://locavello.forjio.com.
	BaseURL string
	// HTTP overrides the http.Client. Default: 30s timeout.
	HTTP *http.Client
	// RetryBaseMs is the exponential-backoff base for GET retries, in
	// milliseconds. Default: 250.
	RetryBaseMs int
}

// New constructs a Locavello client.
//
// Example:
//
//	c := locavello.New(locavello.Config{APIKey: os.Getenv("LOCAVELLO_API_KEY")})
//	page, err := c.Projects.List(ctx, nil)
func New(cfg Config) *Client {
	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = os.Getenv("LOCAVELLO_API_KEY")
	}
	base := cfg.BaseURL
	if base == "" {
		base = "https://locavello.forjio.com"
	}
	httpc := cfg.HTTP
	if httpc == nil {
		httpc = &http.Client{Timeout: 30 * time.Second}
	}
	retryBase := 250 * time.Millisecond
	if cfg.RetryBaseMs > 0 {
		retryBase = time.Duration(cfg.RetryBaseMs) * time.Millisecond
	}
	c := &Client{
		apiKey:    apiKey,
		baseURL:   strings.TrimRight(base, "/"),
		httpc:     httpc,
		retryBase: retryBase,
	}
	c.Projects = &ProjectsResource{c: c}
	c.Keys = &KeysResource{c: c}
	c.Translations = &TranslationsResource{c: c}
	c.Releases = &ReleasesResource{c: c}
	c.Jobs = &JobsResource{c: c}
	c.Glossary = &GlossaryResource{c: c}
	c.TM = &TMResource{c: c}
	c.APIKeys = &APIKeysResource{c: c}
	c.Billing = &BillingResource{c: c}
	c.Public = &PublicResource{c: c}
	return c
}

// envelope mirrors the Forjio data/error/meta API envelope.
type envelope struct {
	Data  json.RawMessage `json:"data"`
	Error *envelopeError  `json:"error"`
	Meta  *envelopeMeta   `json:"meta"`
}

type envelopeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Param   string `json:"param,omitempty"`
	DocURL  string `json:"docUrl,omitempty"`
}

type envelopeMeta struct {
	RequestID string  `json:"requestId,omitempty"`
	Timestamp string  `json:"timestamp,omitempty"`
	Cursor    *string `json:"cursor"`
	HasMore   bool    `json:"hasMore"`
}

// do builds the request, attaches the bearer (unless noAuth), parses
// the envelope, and decodes the data slot into out (pointer; nil to
// ignore the body).
func (c *Client) do(
	ctx context.Context,
	method, path string,
	query url.Values,
	body any,
	noAuth bool,
	out any,
) error {
	_, err := c.doEnvelope(ctx, method, path, query, body, noAuth, out)
	return err
}

// doEnvelope is do plus the envelope meta (cursor/hasMore) — the list
// helpers read pagination state from it. GETs are retried on 429/502/
// 503/504 + transport errors; other methods get exactly one attempt.
func (c *Client) doEnvelope(
	ctx context.Context,
	method, path string,
	query url.Values,
	body any,
	noAuth bool,
	out any,
) (*envelopeMeta, error) {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	if !noAuth && c.apiKey == "" {
		return nil, &Error{
			Status:  0,
			Code:    "AUTH_REQUIRED",
			Message: "no API key configured: set Config.APIKey or LOCAVELLO_API_KEY",
		}
	}

	var raw []byte
	if body != nil {
		var err error
		raw, err = json.Marshal(body)
		if err != nil {
			return nil, &Error{Status: 0, Code: "SERIALIZE_FAILED", Message: err.Error()}
		}
	}

	attempts := 1
	if method == http.MethodGet {
		attempts = 1 + maxRetries
	}

	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			// base * 2^(n-1): base after the 1st failure, 2*base after
			// the 2nd. Respect ctx cancellation while waiting.
			timer := time.NewTimer(c.retryBase * time.Duration(1<<(attempt-1)))
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, lastErr
			case <-timer.C:
			}
		}
		meta, err := c.attempt(ctx, method, u, raw, body != nil, noAuth, out)
		if err == nil {
			return meta, nil
		}
		lastErr = err
		if !retryable(err) {
			return nil, err
		}
	}
	return nil, lastErr
}

// retryable reports whether err warrants another GET attempt: HTTP
// 429/502/503/504 or a transport-level network failure.
func retryable(err error) bool {
	e, ok := err.(*Error)
	if !ok {
		return false
	}
	switch e.Status {
	case http.StatusTooManyRequests, http.StatusBadGateway,
		http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	}
	return e.Status == 0 && e.Code == "NETWORK_ERROR"
}

// attempt performs one HTTP round trip + envelope decode.
func (c *Client) attempt(
	ctx context.Context,
	method, u string,
	body []byte,
	hasBody, noAuth bool,
	out any,
) (*envelopeMeta, error) {
	var bodyReader io.Reader
	if hasBody {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return nil, &Error{Status: 0, Code: "REQUEST_BUILD_FAILED", Message: err.Error()}
	}
	req.Header.Set("Accept", "application/json")
	if hasBody {
		req.Header.Set("Content-Type", "application/json")
	}
	if !noAuth {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	res, err := c.httpc.Do(req)
	if err != nil {
		return nil, &Error{Status: 0, Code: "NETWORK_ERROR", Message: err.Error()}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)

	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, &Error{
			Status:  res.StatusCode,
			Code:    "INVALID_RESPONSE",
			Message: fmt.Sprintf("non-JSON response (HTTP %d)", res.StatusCode),
		}
	}

	requestID := ""
	if env.Meta != nil {
		requestID = env.Meta.RequestID
	}
	if res.StatusCode >= 400 || env.Error != nil {
		code := "UNKNOWN"
		message := fmt.Sprintf("HTTP %d", res.StatusCode)
		param := ""
		if env.Error != nil {
			if env.Error.Code != "" {
				code = env.Error.Code
			}
			if env.Error.Message != "" {
				message = env.Error.Message
			}
			param = env.Error.Param
		}
		return nil, &Error{
			Status:    res.StatusCode,
			Code:      code,
			Message:   message,
			RequestID: requestID,
			Param:     param,
		}
	}

	if out != nil && len(env.Data) > 0 {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return nil, &Error{
				Status:    res.StatusCode,
				Code:      "DECODE_FAILED",
				Message:   err.Error(),
				RequestID: requestID,
			}
		}
	}
	return env.Meta, nil
}
