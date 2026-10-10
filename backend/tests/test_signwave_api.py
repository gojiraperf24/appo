import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.mark.skipif(not BASE_URL, reason="EXPO_PUBLIC_BACKEND_URL is not configured")
def test_gestures_include_seeded_categories(api_client):
    response = api_client.get(f"{BASE_URL}/api/gestures", timeout=20)
    assert response.status_code == 200
    gestures = response.json()
    assert gestures and all("_id" not in item for item in gestures)
    assert {item["category"] for item in gestures} >= {"Fixed", "Alphabet", "Scuba", "Bike"}


@pytest.mark.skipif(not BASE_URL, reason="EXPO_PUBLIC_BACKEND_URL is not configured")
def test_settings_round_trip(api_client):
    payload = {"auto_speak": False, "speech_rate": 1.12, "haptics_enabled": False}
    response = api_client.put(f"{BASE_URL}/api/settings", json=payload, timeout=20)
    assert response.status_code == 200
    assert response.json() == payload
    fetched = api_client.get(f"{BASE_URL}/api/settings", timeout=20)
    assert fetched.status_code == 200
    assert fetched.json() == payload


@pytest.mark.skipif(not BASE_URL, reason="EXPO_PUBLIC_BACKEND_URL is not configured")
def test_custom_gesture_create_and_library(api_client):
    label = f"TEST_{uuid.uuid4().hex[:8]}"
    response = api_client.post(
        f"{BASE_URL}/api/gestures",
        json={"label": label, "spoken_text": "Testing phrase", "description": "Test custom sign"},
        timeout=20,
    )
    assert response.status_code == 200
    created = response.json()
    assert created["label"] == label and created["category"] == "Custom"
    library = api_client.get(f"{BASE_URL}/api/gestures?category=Custom", timeout=20)
    assert library.status_code == 200
    assert any(item["id"] == created["id"] for item in library.json())


@pytest.mark.skipif(not BASE_URL, reason="EXPO_PUBLIC_BACKEND_URL is not configured")
def test_speak_validation_and_audio_url(api_client):
    empty = api_client.post(f"{BASE_URL}/api/speak", json={"text": "   "}, timeout=20)
    assert empty.status_code == 400
    spoken = api_client.post(f"{BASE_URL}/api/speak", json={"text": "Hello test", "speed": 0.92}, timeout=90)
    assert spoken.status_code == 200
    body = spoken.json()
    assert body["audio_url"].startswith("/api/tts/")
    audio = api_client.get(f"{BASE_URL}{body['audio_url']}", timeout=20)
    assert audio.status_code == 200 and audio.headers.get("content-type", "").startswith("audio/")