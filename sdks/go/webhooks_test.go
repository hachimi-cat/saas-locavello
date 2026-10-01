package locavello

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The shared test vector: the backend, the JS and the Python SDK check the same body,
// secret and timestamp.
const (
	vectorBody      = `{"id":"evt_01jtestvector000000000000","type":"locavello.release.published.v1","occurredAt":"2026-01-01T00:00:00.000Z","accountId":"acc_test","data":{"releaseId":"rel_1","locale":"id-ID","note":"Terjemahan — 日本"}}`
	vectorSecret    = "whsec_locavello_test_vector_0001"
	vectorT         = 1767225600
	vectorSignature = "t=1767225600,v1=6aeaf9506d32c5c6d616e435af7d6b298c7791e8afe12b9897f2af78cbd703d4"
)

func at(sec int64) *VerifyWebhookOptions {
	return &VerifyWebhookOptions{Now: func() time.Time { return time.Unix(sec, 0) }}
}

func TestVerifyWebhookAcceptsTheSharedVector(t *testing.T) {
	event, err := VerifyWebhook([]byte(vectorBody), vectorSignature, vectorSecret, at(vectorT+10))
	if err != nil {
		t.Fatal(err)
	}
	if event.ID != "evt_01jtestvector000000000000" || event.Type != "locavello.release.published.v1" || event.AccountID != "acc_test" {
		t.Fatalf("event = %+v", event)
	}
	if !strings.Contains(string(event.Data), "Terjemahan — 日本") {
		t.Fatalf("data = %s", event.Data)
	}
}

func TestVerifyWebhookRefuses(t *testing.T) {
	cases := []struct {
		name, body, sig, secret string
		now                     int64
		want                    string
	}{
		{"wrong secret", vectorBody, vectorSignature, "whsec_wrong", vectorT, "does not match"},
		{"changed body", strings.Replace(vectorBody, "rel_1", "rel_2", 1), vectorSignature, vectorSecret, vectorT, "does not match"},
		{"stale", vectorBody, vectorSignature, vectorSecret, vectorT + 301, "301s from now"},
		{"missing", vectorBody, "", vectorSecret, vectorT, "missing"},
		{"malformed", vectorBody, "v1=abc", vectorSecret, vectorT, "malformed"},
	}
	for _, c := range cases {
		_, err := VerifyWebhook([]byte(c.body), c.sig, c.secret, at(c.now))
		var e *Error
		if !errors.As(err, &e) || e.Code != "INVALID_SIGNATURE" || !strings.Contains(e.Message, c.want) {
			t.Errorf("%s: err = %v", c.name, err)
		}
	}
}

func TestVerifyWebhookDefaultClock(t *testing.T) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, []byte(vectorSecret))
	mac.Write([]byte(ts + "." + vectorBody))
	sig := "t=" + ts + ",v1=" + hex.EncodeToString(mac.Sum(nil))
	if _, err := VerifyWebhook([]byte(vectorBody), sig, vectorSecret, nil); err != nil {
		t.Fatal(err)
	}
}
