"""verify_webhook against the shared test vector (the backend, the JS and the Go SDK
check the same body, secret and timestamp)."""

import hashlib
import hmac
import time

import pytest

from forjio_locavello import LocavelloError, verify_webhook

BODY = (
    '{"id":"evt_01jtestvector000000000000","type":"locavello.release.published.v1",'
    '"occurredAt":"2026-01-01T00:00:00.000Z","accountId":"acc_test",'
    '"data":{"releaseId":"rel_1","locale":"id-ID","note":"Terjemahan — 日本"}}'
)
SECRET = "whsec_locavello_test_vector_0001"
T = 1767225600
SIGNATURE = "t=1767225600,v1=6aeaf9506d32c5c6d616e435af7d6b298c7791e8afe12b9897f2af78cbd703d4"


def test_accepts_the_shared_vector():
    event = verify_webhook(BODY, SIGNATURE, SECRET, now=T + 10)
    assert event["id"] == "evt_01jtestvector000000000000"
    assert event["type"] == "locavello.release.published.v1"
    assert event["data"] == {"releaseId": "rel_1", "locale": "id-ID", "note": "Terjemahan — 日本"}
    assert verify_webhook(BODY.encode("utf-8"), SIGNATURE, SECRET, now=T)["accountId"] == "acc_test"


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"secret": "whsec_wrong"}, "does not match"),
        ({"raw_body": BODY.replace("rel_1", "rel_2")}, "does not match"),
        ({"now": T + 301}, "301s from now"),
        ({"signature": None}, "missing"),
        ({"signature": "v1=abc"}, "malformed"),
    ],
)
def test_refuses(kwargs, message):
    args = {"raw_body": BODY, "signature": SIGNATURE, "secret": SECRET, "now": T, **kwargs}
    with pytest.raises(LocavelloError) as exc:
        verify_webhook(args.pop("raw_body"), args.pop("signature"), args.pop("secret"), now=args["now"])
    assert exc.value.code == "INVALID_SIGNATURE"
    assert message in exc.value.message


def test_fresh_signature_with_default_clock():
    t = int(time.time())
    v1 = hmac.new(SECRET.encode(), f"{t}.{BODY}".encode(), hashlib.sha256).hexdigest()
    assert verify_webhook(BODY, f"t={t},v1={v1}", SECRET)["type"] == "locavello.release.published.v1"
