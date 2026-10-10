"""Session 3 backend tests: expanded gesture catalog, custom gesture image upload, file retrieval."""
import os
import io
import base64
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-build-3386.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def real_jpeg_b64():
    # Build a real JPEG with features/edges/gradients (not solid colour)
    img = Image.new("RGB", (240, 240), (210, 180, 140))
    draw = ImageDraw.Draw(img)
    for i in range(0, 240, 12):
        draw.line([(0, i), (240, i)], fill=(90, 90, 90), width=1)
    draw.ellipse((40, 50, 180, 200), fill=(230, 200, 170), outline=(50, 20, 10), width=3)
    draw.rectangle((70, 90, 150, 170), outline=(10, 80, 30), width=3)
    draw.polygon([(90, 60), (150, 60), (120, 30)], fill=(200, 60, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    data = buf.getvalue()
    assert 5_000 < len(data) < 200_000  # real JPEG with features, size is secondary
    return base64.b64encode(data).decode("ascii")


# --- Gesture catalog --------------------------------------------------------

class TestGestureCatalog:
    def test_all_gestures_counts_and_categories(self):
        r = requests.get(f"{BASE_URL}/api/gestures", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Fixed(28) + Bike(16) + Scuba(18) + Alphabet(26) = 88 seeded + any Custom
        cats = {g["category"] for g in data}
        assert "Fixed" in cats
        assert "Bike" in cats
        assert "Scuba" in cats
        assert "Alphabet" in cats
        # Should be ~88 seeded (allow Custom extras)
        assert len(data) >= 85, f"expected ~90 gestures, got {len(data)}"

    def test_alphabet_has_a_to_z(self):
        r = requests.get(f"{BASE_URL}/api/gestures", params={"category": "Alphabet"}, timeout=30)
        assert r.status_code == 200
        labels = sorted({g["label"] for g in r.json()})
        expected = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        assert labels == expected, f"missing letters: {set(expected) - set(labels)}"

    def test_bike_has_classic_signals(self):
        r = requests.get(f"{BASE_URL}/api/gestures", params={"category": "Bike"}, timeout=30)
        assert r.status_code == 200
        labels = {g["label"] for g in r.json()}
        for required in ("Follow me", "Pull over", "Fuel stop"):
            assert required in labels, f"Bike missing '{required}'. Got: {labels}"

    def test_scuba_has_key_signals(self):
        r = requests.get(f"{BASE_URL}/api/gestures", params={"category": "Scuba"}, timeout=30)
        assert r.status_code == 200
        labels = {g["label"] for g in r.json()}
        for required in ("Low on air", "Share air", "Danger"):
            assert required in labels, f"Scuba missing '{required}'. Got: {labels}"


# --- Custom gesture image upload -------------------------------------------

class TestCustomGestureUpload:
    def test_create_without_image(self):
        payload = {"label": "TEST_NoImage", "spoken_text": "test no image", "description": "unit"}
        r = requests.post(f"{BASE_URL}/api/gestures", json=payload, params={"device_id": "test-v3"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["label"] == "TEST_NoImage"
        assert body["category"] == "Custom"
        assert body.get("image_path") in (None, "")

    def test_create_with_image_uploads_and_retrievable(self, real_jpeg_b64):
        payload = {
            "label": "TEST_WithImage",
            "spoken_text": "test with image",
            "description": "unit",
            "image_base64": real_jpeg_b64,
        }
        r = requests.post(f"{BASE_URL}/api/gestures", json=payload, params={"device_id": "test-v3"}, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        image_path = body.get("image_path")
        assert image_path, "expected image_path in response"
        assert image_path.startswith("signwave-connect/custom-gestures/")

        # Fetch the stored image bytes
        r2 = requests.get(f"{BASE_URL}/api/files/{image_path}", timeout=60)
        assert r2.status_code == 200, f"GET /api/files returned {r2.status_code}: {r2.text[:200]}"
        ctype = r2.headers.get("Content-Type", "")
        assert ctype.startswith("image/"), f"unexpected content-type: {ctype}"
        assert len(r2.content) > 1000

    def test_create_with_invalid_base64_returns_400(self):
        payload = {
            "label": "TEST_BadImage",
            "spoken_text": "test bad image",
            "image_base64": "@@@not-base64!!!",
        }
        r = requests.post(f"{BASE_URL}/api/gestures", json=payload, params={"device_id": "test-v3"}, timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_create_requires_label_and_spoken(self):
        r = requests.post(f"{BASE_URL}/api/gestures", json={"label": "", "spoken_text": ""}, timeout=30)
        assert r.status_code == 400


# --- Regression -------------------------------------------------------------

class TestRegression:
    def test_quick_phrases(self):
        r = requests.get(f"{BASE_URL}/api/quick-phrases", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_quick_phrases_scuba_filter(self):
        r = requests.get(f"{BASE_URL}/api/quick-phrases", params={"context_mode": "Scuba"}, timeout=15)
        assert r.status_code == 200
        modes = {p["context_mode"] for p in r.json()}
        assert modes.issubset({"Scuba", "All"})

    def test_favorites_round_trip(self):
        dev = "TEST_v3_fav_device"
        requests.delete(f"{BASE_URL}/api/favorites", params={"device_id": dev, "gesture_id": "hello"}, timeout=10)
        r = requests.post(f"{BASE_URL}/api/favorites", json={"device_id": dev, "gesture_id": "hello"}, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/favorites", params={"device_id": dev}, timeout=10)
        assert r2.status_code == 200 and "hello" in r2.json()
        requests.delete(f"{BASE_URL}/api/favorites", params={"device_id": dev, "gesture_id": "hello"}, timeout=10)

    def test_history_round_trip(self):
        dev = "TEST_v3_hist_device"
        requests.delete(f"{BASE_URL}/api/history", params={"device_id": dev}, timeout=10)
        r = requests.post(f"{BASE_URL}/api/history", json={"device_id": dev, "sentence": "hello world", "context_mode": "Everyday"}, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/history", params={"device_id": dev}, timeout=10)
        assert r2.status_code == 200
        assert any(h["sentence"] == "hello world" for h in r2.json())
        requests.delete(f"{BASE_URL}/api/history", params={"device_id": dev}, timeout=10)

    def test_recognize_rejects_empty(self):
        r = requests.post(f"{BASE_URL}/api/recognize-gesture", json={"image_base64": "", "context_mode": "Everyday", "vocabulary": []}, timeout=15)
        assert r.status_code == 400
