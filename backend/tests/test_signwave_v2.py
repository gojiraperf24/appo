"""SignWave Connect — Session 2 backend regression tests.

Covers new endpoints introduced in session 2:
- /api/gestures (with context_overrides on key signs)
- /api/quick-phrases + context_mode filtering
- /api/favorites (POST/GET/DELETE round-trip)
- /api/history (POST/GET/DELETE round-trip)
- /api/recognize-gesture (vision classifier — empty payload + textured non-hand image)
- /api/speak (regression)
"""
import base64
import io
import os
import uuid

import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="EXPO_PUBLIC_BACKEND_URL is not configured")


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def device_id():
    return f"TEST_device_{uuid.uuid4().hex[:8]}"


def _textured_jpeg_b64() -> str:
    """Produce a non-hand but feature-rich textured JPEG as base64 (no data URI)."""
    img = Image.new("RGB", (320, 320), (210, 220, 235))
    draw = ImageDraw.Draw(img)
    # Draw multiple shapes & gradients to give real visual features
    for i in range(0, 320, 20):
        draw.line([(0, i), (320, i)], fill=(90 + i // 2, 60, 150 - i // 3), width=2)
    draw.rectangle([40, 40, 160, 160], outline=(20, 20, 20), width=4, fill=(240, 190, 90))
    draw.ellipse([170, 150, 290, 280], outline=(0, 0, 0), width=4, fill=(90, 170, 220))
    draw.polygon([(60, 230), (120, 300), (20, 300)], fill=(60, 180, 90), outline=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


# ---------------- Gestures ---------------- #
class TestGestures:
    def test_gestures_seeded_with_context_overrides(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gestures", timeout=20)
        assert r.status_code == 200
        gestures = r.json()
        assert len(gestures) >= 20, f"expected >=20 gestures, got {len(gestures)}"
        by_label = {g["label"]: g for g in gestures}
        # Context overrides exist on expected signs
        for key in ["Thumb up", "OK", "Help"]:
            assert key in by_label, f"Missing seeded gesture: {key}"
            overrides = by_label[key].get("context_overrides") or {}
            assert "Riding" in overrides and "Scuba" in overrides, (
                f"{key} missing Riding/Scuba overrides: {overrides}"
            )
        # No _id leakage
        assert all("_id" not in g for g in gestures)


# ---------------- Quick phrases ---------------- #
class TestQuickPhrases:
    def test_quick_phrases_all_returns_twelve(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/quick-phrases", timeout=20)
        assert r.status_code == 200
        phrases = r.json()
        assert len(phrases) == 12, f"expected 12 phrases, got {len(phrases)}"

    def test_quick_phrases_scuba_filter(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/quick-phrases?context_mode=Scuba", timeout=20)
        assert r.status_code == 200
        phrases = r.json()
        assert phrases, "Scuba filter returned no phrases"
        modes = {p["context_mode"] for p in phrases}
        assert modes.issubset({"Scuba", "All"}), f"unexpected modes: {modes}"
        # Must contain at least one Scuba and one All
        assert "Scuba" in modes and "All" in modes


# ---------------- Favorites ---------------- #
class TestFavorites:
    def test_favorites_round_trip(self, api_client, device_id):
        gesture_id = "thumb-up"
        # Add
        r = api_client.post(
            f"{BASE_URL}/api/favorites",
            json={"device_id": device_id, "gesture_id": gesture_id},
            timeout=20,
        )
        assert r.status_code == 200 and r.json().get("ok") is True
        # Verify
        r2 = api_client.get(f"{BASE_URL}/api/favorites?device_id={device_id}", timeout=20)
        assert r2.status_code == 200
        assert gesture_id in r2.json()
        # Delete
        r3 = api_client.delete(
            f"{BASE_URL}/api/favorites?device_id={device_id}&gesture_id={gesture_id}",
            timeout=20,
        )
        assert r3.status_code == 200
        r4 = api_client.get(f"{BASE_URL}/api/favorites?device_id={device_id}", timeout=20)
        assert r4.status_code == 200
        assert gesture_id not in r4.json()


# ---------------- History ---------------- #
class TestHistory:
    def test_history_round_trip(self, api_client, device_id):
        sentence = f"TEST_hello_{uuid.uuid4().hex[:6]}"
        # Create
        r = api_client.post(
            f"{BASE_URL}/api/history",
            json={"device_id": device_id, "sentence": sentence, "context_mode": "Everyday"},
            timeout=20,
        )
        assert r.status_code == 200
        created = r.json()
        assert created["sentence"] == sentence
        assert created["context_mode"] == "Everyday"
        # Fetch
        r2 = api_client.get(f"{BASE_URL}/api/history?device_id={device_id}", timeout=20)
        assert r2.status_code == 200
        sentences = [h["sentence"] for h in r2.json()]
        assert sentence in sentences
        # Clear
        r3 = api_client.delete(f"{BASE_URL}/api/history?device_id={device_id}", timeout=20)
        assert r3.status_code == 200 and r3.json().get("deleted", 0) >= 1
        r4 = api_client.get(f"{BASE_URL}/api/history?device_id={device_id}", timeout=20)
        assert r4.status_code == 200 and r4.json() == []

    def test_history_empty_sentence_rejected(self, api_client, device_id):
        r = api_client.post(
            f"{BASE_URL}/api/history",
            json={"device_id": device_id, "sentence": "   ", "context_mode": "Everyday"},
            timeout=20,
        )
        assert r.status_code == 400


# ---------------- Recognize gesture ---------------- #
class TestRecognizeGesture:
    def test_recognize_empty_image_returns_400(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/recognize-gesture",
            json={"image_base64": "", "context_mode": "Everyday", "vocabulary": ["Hello"]},
            timeout=20,
        )
        assert r.status_code == 400

    def test_recognize_non_hand_image_returns_none(self, api_client):
        payload = {
            "image_base64": _textured_jpeg_b64(),
            "context_mode": "Everyday",
            "vocabulary": ["Hello", "Thank you", "Yes", "No", "Help", "OK", "Stop",
                           "Water", "Thumb up", "Thumb down"],
        }
        r = api_client.post(f"{BASE_URL}/api/recognize-gesture", json=payload, timeout=60)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        body = r.json()
        assert set(body.keys()) >= {"label", "spoken_text", "confidence"}
        # Non-hand textured image should be classified as 'none'
        assert body["label"] == "none", f"Non-hand image classified as {body['label']}"
        assert body["confidence"] in {"none", "low"}


# ---------------- Speak regression ---------------- #
class TestSpeak:
    def test_speak_empty_rejected(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/speak", json={"text": "   "}, timeout=20)
        assert r.status_code == 400

    def test_speak_non_empty_ok(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/speak", json={"text": "Hello session two", "speed": 0.9}, timeout=90)
        assert r.status_code == 200
        body = r.json()
        assert body["audio_url"].startswith("/api/tts/")
        audio = api_client.get(f"{BASE_URL}{body['audio_url']}", timeout=20)
        assert audio.status_code == 200
        assert audio.headers.get("content-type", "").startswith("audio/")
