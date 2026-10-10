from fastapi import FastAPI, APIRouter, HTTPException, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import re
import json
import base64
import binascii
import requests
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.openai import OpenAITextToSpeech
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


class Gesture(BaseModel):
    id: str
    label: str
    spoken_text: str
    category: str
    description: str
    icon: str
    source: str
    context_overrides: Dict[str, str] = Field(default_factory=dict)
    image_path: Optional[str] = None


class CustomGestureCreate(BaseModel):
    label: str
    spoken_text: str
    description: str = ""
    image_base64: Optional[str] = None  # pure b64 JPEG, no data URI prefix


class AppSettings(BaseModel):
    auto_speak: bool = True
    speech_rate: float = 0.92
    haptics_enabled: bool = True


class SpeakRequest(BaseModel):
    text: str
    speed: float = Field(default=1.0, ge=0.25, le=4.0)


class SpeakResponse(BaseModel):
    audio_url: str
    model: str


class RecognizeRequest(BaseModel):
    image_base64: str
    context_mode: str = "Everyday"
    vocabulary: List[str] = Field(default_factory=list)


class RecognizeResponse(BaseModel):
    label: str
    spoken_text: str
    confidence: str


class QuickPhrase(BaseModel):
    id: str
    text: str
    icon: str
    context_mode: str  # Everyday | Riding | Scuba | All


class HistoryItem(BaseModel):
    id: str
    device_id: str
    sentence: str
    context_mode: str
    timestamp: datetime


class HistoryCreate(BaseModel):
    device_id: str
    sentence: str
    context_mode: str = "Everyday"


class FavoriteItem(BaseModel):
    device_id: str
    gesture_id: str


# --- Gesture seed ---------------------------------------------------------

ALPHABET_SEED = [
    {
        "id": letter.lower(),
        "label": letter,
        "spoken_text": letter,
        "category": "Alphabet",
        "description": f"Alphabet sign {letter}.",
        "icon": "text-outline",
        "source": "Alphabet",
        "context_overrides": {},
    }
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
]

FIXED_SEED = [
    {"id": "hello", "label": "Hello", "spoken_text": "Hello", "category": "Fixed", "description": "A friendly greeting.", "icon": "hand-left-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "goodbye", "label": "Goodbye", "spoken_text": "Goodbye", "category": "Fixed", "description": "A friendly farewell.", "icon": "exit-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "thank-you", "label": "Thank you", "spoken_text": "Thank you", "category": "Fixed", "description": "Acknowledge help or kindness.", "icon": "heart-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "please", "label": "Please", "spoken_text": "Please", "category": "Fixed", "description": "Polite request opener.", "icon": "hand-right-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "sorry", "label": "Sorry", "spoken_text": "I am sorry", "category": "Fixed", "description": "Apology or regret.", "icon": "sad-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "yes", "label": "Yes", "spoken_text": "Yes", "category": "Fixed", "description": "Confirmation.", "icon": "checkmark-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "no", "label": "No", "spoken_text": "No", "category": "Fixed", "description": "Decline or disagreement.", "icon": "close-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "help", "label": "Help", "spoken_text": "I need help", "category": "Fixed", "description": "A universal support signal.", "icon": "alert-circle-outline", "source": "Common signs", "context_overrides": {"Riding": "I need to pull over for help", "Scuba": "I have a problem, assistance needed"}},
    {"id": "okay", "label": "OK", "spoken_text": "Okay", "category": "Fixed", "description": "Everything is fine or understood.", "icon": "checkmark-done-outline", "source": "Common signs", "context_overrides": {"Riding": "All clear, keep riding", "Scuba": "I am okay"}},
    {"id": "stop", "label": "Stop", "spoken_text": "Please stop", "category": "Fixed", "description": "Request to stop or pause.", "icon": "stop-circle-outline", "source": "Common signs", "context_overrides": {"Riding": "Stopping ahead", "Scuba": "Hold position"}},
    {"id": "slow", "label": "Slow down", "spoken_text": "Please slow down", "category": "Fixed", "description": "Ease the pace.", "icon": "walk-outline", "source": "Common signs", "context_overrides": {"Riding": "Slow down the group", "Scuba": "Slow your ascent"}},
    {"id": "wait", "label": "Wait", "spoken_text": "Please wait", "category": "Fixed", "description": "Hold on a moment.", "icon": "time-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "me", "label": "Me", "spoken_text": "Me", "category": "Fixed", "description": "Point to self.", "icon": "person-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "you", "label": "You", "spoken_text": "You", "category": "Fixed", "description": "Point to listener.", "icon": "person-add-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "water", "label": "Water", "spoken_text": "I need water", "category": "Fixed", "description": "Request water.", "icon": "water-outline", "source": "Common signs", "context_overrides": {"Scuba": "Low on air"}},
    {"id": "food", "label": "Food", "spoken_text": "I am hungry", "category": "Fixed", "description": "Request food or indicate hunger.", "icon": "fast-food-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "toilet", "label": "Toilet", "spoken_text": "I need the restroom", "category": "Fixed", "description": "Restroom request.", "icon": "navigate-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "pain", "label": "Pain", "spoken_text": "I feel pain", "category": "Fixed", "description": "Indicate discomfort or pain.", "icon": "medkit-outline", "source": "Common signs", "context_overrides": {"Scuba": "Something hurts"}},
    {"id": "love", "label": "I love you", "spoken_text": "I love you", "category": "Fixed", "description": "ASL love hand shape (ILY).", "icon": "heart-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "family", "label": "Family", "spoken_text": "Family", "category": "Fixed", "description": "Refer to family.", "icon": "people-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "friend", "label": "Friend", "spoken_text": "Friend", "category": "Fixed", "description": "Refer to a friend.", "icon": "people-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "home", "label": "Home", "spoken_text": "Home", "category": "Fixed", "description": "Refer to home.", "icon": "home-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "good", "label": "Good", "spoken_text": "Good", "category": "Fixed", "description": "Positive quality.", "icon": "thumbs-up-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "bad", "label": "Bad", "spoken_text": "Bad", "category": "Fixed", "description": "Negative quality.", "icon": "thumbs-down-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "more", "label": "More", "spoken_text": "More please", "category": "Fixed", "description": "Request more.", "icon": "add-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "finished", "label": "Finished", "spoken_text": "I am finished", "category": "Fixed", "description": "Indicate completion.", "icon": "checkmark-done-circle-outline", "source": "Common signs", "context_overrides": {}},
    {"id": "understand", "label": "Understand", "spoken_text": "I understand", "category": "Fixed", "description": "Acknowledge comprehension.", "icon": "bulb-outline", "source": "Common signs", "context_overrides": {"Scuba": "I understand the signal"}},
    {"id": "dont-understand", "label": "Don't understand", "spoken_text": "I don't understand", "category": "Fixed", "description": "Need clarification.", "icon": "help-circle-outline", "source": "Common signs", "context_overrides": {}},
]

BIKE_SEED = [
    {"id": "bike-left", "label": "Left turn", "spoken_text": "Turning left", "category": "Bike", "description": "Left arm extended horizontally.", "icon": "arrow-back-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-right", "label": "Right turn", "spoken_text": "Turning right", "category": "Bike", "description": "Left arm up at a 90° angle.", "icon": "arrow-forward-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-stop", "label": "Stop", "spoken_text": "Stopping", "category": "Bike", "description": "Left arm extended down with palm back.", "icon": "stop-circle-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-slow", "label": "Slow down", "spoken_text": "Slowing down", "category": "Bike", "description": "Left arm extended, palm down, moving up and down.", "icon": "speedometer-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-speed-up", "label": "Speed up", "spoken_text": "Speed up", "category": "Bike", "description": "Left arm swung forward and up.", "icon": "flash-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-hazard", "label": "Hazard", "spoken_text": "Hazard on the road", "category": "Bike", "description": "Point to road hazard with foot or hand.", "icon": "warning-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-follow", "label": "Follow me", "spoken_text": "Follow me", "category": "Bike", "description": "Left arm up, palm forward, swung back over shoulder.", "icon": "trail-sign-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-you-lead", "label": "You lead", "spoken_text": "You take the lead", "category": "Bike", "description": "Left arm forward, palm up, swinging forward.", "icon": "swap-horizontal-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-pull-over", "label": "Pull over", "spoken_text": "Pulling over", "category": "Bike", "description": "Left arm pointing to side of road.", "icon": "exit-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-single-file", "label": "Single file", "spoken_text": "Single file formation", "category": "Bike", "description": "Left hand up with index finger extended.", "icon": "list-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-double-file", "label": "Double file", "spoken_text": "Double file formation", "category": "Bike", "description": "Left hand up, two fingers extended.", "icon": "grid-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-fuel", "label": "Fuel stop", "spoken_text": "Fuel stop needed", "category": "Bike", "description": "Point to the fuel tank with finger.", "icon": "flame-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-comfort", "label": "Comfort stop", "spoken_text": "Comfort stop needed", "category": "Bike", "description": "Thumb pointing to mouth or stomach.", "icon": "cafe-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-cops", "label": "Cops ahead", "spoken_text": "Cops ahead", "category": "Bike", "description": "Tap top of helmet with open palm.", "icon": "shield-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-turn-signal", "label": "Turn signal on", "spoken_text": "Check your turn signal", "category": "Bike", "description": "Open and close hand, fingers to thumb.", "icon": "repeat-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
    {"id": "bike-high-beam", "label": "High beam on", "spoken_text": "Your high beam is on", "category": "Bike", "description": "Open and close fist on top of helmet.", "icon": "flashlight-outline", "source": "Motorcycle hand signals", "context_overrides": {}},
]

SCUBA_SEED = [
    {"id": "scuba-ok", "label": "OK (Scuba)", "spoken_text": "I am okay", "category": "Scuba", "description": "Thumb and index finger make a circle.", "icon": "checkmark-done-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-not-ok", "label": "Not OK", "spoken_text": "Something is wrong", "category": "Scuba", "description": "Flat hand rocked side-to-side.", "icon": "warning-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-up", "label": "Go up", "spoken_text": "Let's ascend", "category": "Scuba", "description": "Thumb pointing up.", "icon": "arrow-up-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-down", "label": "Go down", "spoken_text": "Let's descend", "category": "Scuba", "description": "Thumb pointing down.", "icon": "arrow-down-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-stop", "label": "Stop (Scuba)", "spoken_text": "Hold position", "category": "Scuba", "description": "Open palm facing partner.", "icon": "stop-circle-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-slow", "label": "Slow down (Scuba)", "spoken_text": "Slow down", "category": "Scuba", "description": "Flat hand moved slowly up and down.", "icon": "speedometer-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-problem", "label": "Problem", "spoken_text": "I have a problem", "category": "Scuba", "description": "Point to the problem area.", "icon": "alert-circle-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-low-air", "label": "Low on air", "spoken_text": "I am low on air", "category": "Scuba", "description": "Fist to chest, repeatedly.", "icon": "cloud-offline-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-out-air", "label": "Out of air", "spoken_text": "I am out of air", "category": "Scuba", "description": "Flat hand sliced across the throat.", "icon": "warning-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-share-air", "label": "Share air", "spoken_text": "Share your air with me", "category": "Scuba", "description": "Two fingers to the mouth, hand reaching out.", "icon": "swap-horizontal-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-watch", "label": "Watch me", "spoken_text": "Watch me", "category": "Scuba", "description": "Two fingers from eyes to subject.", "icon": "eye-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-look", "label": "Look there", "spoken_text": "Look there", "category": "Scuba", "description": "Point two fingers at object.", "icon": "finger-print-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-together", "label": "Stay together", "spoken_text": "Stay together", "category": "Scuba", "description": "Two index fingers side by side.", "icon": "people-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-danger", "label": "Danger", "spoken_text": "Danger ahead", "category": "Scuba", "description": "Fist, knuckles facing partner.", "icon": "skull-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-cold", "label": "I'm cold", "spoken_text": "I am cold", "category": "Scuba", "description": "Hug self with arms crossed.", "icon": "snow-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-ear", "label": "Ear trouble", "spoken_text": "Trouble equalizing ears", "category": "Scuba", "description": "Point to the ear.", "icon": "ear-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-direction", "label": "This way", "spoken_text": "Go this way", "category": "Scuba", "description": "Point with flat hand.", "icon": "navigate-outline", "source": "Scuba hand signals", "context_overrides": {}},
    {"id": "scuba-dont-understand", "label": "Don't understand (Scuba)", "spoken_text": "I don't understand", "category": "Scuba", "description": "Flat hand rotated at head level.", "icon": "help-circle-outline", "source": "Scuba hand signals", "context_overrides": {}},
]

GESTURE_SEED: list[dict] = FIXED_SEED + BIKE_SEED + SCUBA_SEED + ALPHABET_SEED

QUICK_PHRASE_SEED: list[dict] = [
    {"id": "qp-hello", "text": "Hello, how are you?", "icon": "hand-left-outline", "context_mode": "All"},
    {"id": "qp-thanks", "text": "Thank you so much", "icon": "heart-outline", "context_mode": "All"},
    {"id": "qp-help", "text": "I need help, please", "icon": "alert-circle-outline", "context_mode": "All"},
    {"id": "qp-water", "text": "May I have some water?", "icon": "water-outline", "context_mode": "Everyday"},
    {"id": "qp-restroom", "text": "Where is the restroom?", "icon": "navigate-outline", "context_mode": "Everyday"},
    {"id": "qp-wait", "text": "Please wait a moment", "icon": "time-outline", "context_mode": "Everyday"},
    {"id": "qp-sorry", "text": "I am sorry", "icon": "sad-outline", "context_mode": "Everyday"},
    {"id": "qp-love", "text": "I love you", "icon": "heart-circle-outline", "context_mode": "Everyday"},
    {"id": "qp-ride-stop", "text": "Pulling over soon", "icon": "stop-circle-outline", "context_mode": "Riding"},
    {"id": "qp-ride-gas", "text": "Need to fuel up", "icon": "flame-outline", "context_mode": "Riding"},
    {"id": "qp-ride-break", "text": "Taking a break", "icon": "cafe-outline", "context_mode": "Riding"},
    {"id": "qp-ride-follow", "text": "Follow me", "icon": "trail-sign-outline", "context_mode": "Riding"},
    {"id": "qp-scuba-ok", "text": "I am okay", "icon": "checkmark-done-outline", "context_mode": "Scuba"},
    {"id": "qp-scuba-air", "text": "Low on air", "icon": "cloud-offline-outline", "context_mode": "Scuba"},
    {"id": "qp-scuba-up", "text": "Let's go up", "icon": "arrow-up-outline", "context_mode": "Scuba"},
    {"id": "qp-scuba-together", "text": "Stay together", "icon": "people-outline", "context_mode": "Scuba"},
]

TTS_CACHE_DIR = ROOT_DIR / "tts_cache"
TTS_CACHE_DIR.mkdir(exist_ok=True)
MEDIA_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav"}


# --- Emergent Object Storage ---------------------------------------------

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "signwave-connect"
_storage_key: Optional[str] = None


def _init_storage(force: bool = False) -> Optional[str]:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json().get("storage_key")
        return _storage_key
    except Exception as exc:
        logging.getLogger(__name__).warning("storage init failed: %s", exc)
        return None


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    if not key:
        raise RuntimeError("Object storage is not configured")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        _init_storage(force=True)
        key = _storage_key
        if not key:
            raise RuntimeError("Object storage temporarily unavailable")
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get_object_sync(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    if not key:
        raise RuntimeError("Object storage is not configured")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        _init_storage(force=True)
        key = _storage_key
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    if resp.status_code >= 500:
        raise FileNotFoundError("Object not found")
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[*_#>~|]", "", text)
    return re.sub(r"\s+", " ", text).strip()[:4096]


def tts_cache_key(text: str, speed: float, model: str) -> str:
    raw = f"{text}|{speed}|{model}|coral|calm-friendly"
    return hashlib.sha256(raw.encode()).hexdigest()


async def ensure_quick_phrases_seeded():
    count = await db.quick_phrases.count_documents({})
    if count == 0:
        await db.quick_phrases.insert_many([dict(item) for item in QUICK_PHRASE_SEED])


async def upsert_gesture_seed():
    for item in GESTURE_SEED:
        await db.gestures.update_one({"id": item["id"]}, {"$set": item}, upsert=True)


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


@api_router.get("/gestures", response_model=List[Gesture])
async def get_gestures(category: Optional[str] = None, device_id: Optional[str] = None):
    await upsert_gesture_seed()
    query: dict = {}
    if category and category not in ("All", "Favorites"):
        if category == "Custom":
            # Scope custom gestures per device if device_id provided; otherwise return all.
            query = {"category": "Custom"} if not device_id else {"category": "Custom", "device_id": device_id}
        else:
            query = {"category": category}
    gestures = await db.gestures.find(query, {"_id": 0}).sort("category", 1).to_list(1000)
    return [Gesture(**{**gesture, "context_overrides": gesture.get("context_overrides") or {}}) for gesture in gestures]


@api_router.post("/gestures", response_model=Gesture)
async def create_custom_gesture(input: CustomGestureCreate, device_id: Optional[str] = Query(None)):
    label = input.label.strip()
    spoken_text = input.spoken_text.strip()
    if not label or not spoken_text:
        raise HTTPException(status_code=400, detail="Label and spoken text are required")

    image_path: Optional[str] = None
    if input.image_base64:
        raw = input.image_base64.split(",")[-1].strip()
        try:
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=400, detail="Invalid image payload")
        if len(data) > 4 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image is too large (max 4 MB)")
        storage_path = f"{APP_NAME}/custom-gestures/{uuid.uuid4().hex}.jpg"
        try:
            await run_in_threadpool(_put_object_sync, storage_path, data, "image/jpeg")
            image_path = storage_path
        except Exception as exc:
            logging.getLogger(__name__).warning("Image upload failed: %s", exc)
            raise HTTPException(status_code=502, detail="Could not store the gesture image")

    gesture_dict = {
        "id": f"custom-{uuid.uuid4().hex[:10]}",
        "label": label,
        "spoken_text": spoken_text,
        "category": "Custom",
        "description": input.description.strip() or "A custom gesture added by the wearer.",
        "icon": "sparkles-outline",
        "source": "Your custom library",
        "context_overrides": {},
        "image_path": image_path,
    }
    stored = {**gesture_dict, "device_id": device_id or "shared"}
    await db.gestures.insert_one(stored)
    return Gesture(**gesture_dict)


@api_router.get("/files/{path:path}")
async def get_file(path: str):
    try:
        data, content_type = await run_in_threadpool(_get_object_sync, path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as exc:
        logging.getLogger(__name__).warning("Object fetch failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not fetch file")
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/settings", response_model=AppSettings)
async def get_settings():
    settings = await db.app_settings.find_one({"id": "default"}, {"_id": 0, "id": 0})
    return AppSettings(**settings) if settings else AppSettings()


@api_router.put("/settings", response_model=AppSettings)
async def update_settings(settings: AppSettings):
    await db.app_settings.update_one(
        {"id": "default"},
        {"$set": settings.model_dump()},
        upsert=True,
    )
    return settings


@api_router.post("/speak", response_model=SpeakResponse)
async def speak_text(input: SpeakRequest):
    text = clean_for_tts(input.text)
    if not text:
        raise HTTPException(status_code=400, detail="There is no text to read aloud")
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Speech service is not configured")

    primary_model = "gpt-4o-mini-tts"
    cache_key = tts_cache_key(text, input.speed, primary_model)
    cache_path = TTS_CACHE_DIR / f"{cache_key}.mp3"
    if not cache_path.exists():
        tts = OpenAITextToSpeech(api_key=api_key)
        try:
            audio_bytes = await tts.generate_speech(
                text=text,
                model=primary_model,
                voice="coral",
                speed=input.speed,
                response_format="mp3",
                instructions="Speak calmly, warmly, and clearly for an accessible communication assistant.",
            )
        except Exception as primary_error:
            logger.warning("Primary TTS failed; using fast fallback: %s", primary_error)
            fallback_model = "tts-1"
            cache_key = tts_cache_key(text, input.speed, fallback_model)
            cache_path = TTS_CACHE_DIR / f"{cache_key}.mp3"
            if not cache_path.exists():
                audio_bytes = await tts.generate_speech(
                    text=text,
                    model=fallback_model,
                    voice="coral",
                    speed=input.speed,
                    response_format="mp3",
                )
            else:
                audio_bytes = None
        if audio_bytes is not None:
            cache_path.write_bytes(audio_bytes)
    return SpeakResponse(audio_url=f"/api/tts/{cache_path.stem}.mp3", model=primary_model)


@api_router.get("/tts/{key}.{ext}")
async def get_tts(key: str, ext: str):
    if ext not in MEDIA_TYPES or not re.fullmatch(r"[a-f0-9]{64}", key):
        raise HTTPException(status_code=404, detail="Audio not found")
    path = TTS_CACHE_DIR / f"{key}.{ext}"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return Response(content=path.read_bytes(), media_type=MEDIA_TYPES[ext], headers={"Cache-Control": "public, max-age=31536000"})


@api_router.post("/recognize-gesture", response_model=RecognizeResponse)
async def recognize_gesture(input: RecognizeRequest):
    if not input.image_base64 or len(input.image_base64) < 100:
        raise HTTPException(status_code=400, detail="A camera frame is required")
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision service is not configured")

    raw_b64 = input.image_base64.split(",")[-1].strip()
    context = input.context_mode if input.context_mode in ("Everyday", "Riding", "Scuba") else "Everyday"
    vocab = [v.strip() for v in input.vocabulary if v and v.strip()]
    if not vocab:
        vocab = ["Hello", "Thank you", "Yes", "No", "Help", "OK", "Stop", "Water", "Thumb up", "Thumb down"]

    system_message = (
        "You are a hand-gesture classifier for an accessibility communication app. "
        "You will receive one photo of a human hand. "
        "Classify it against the provided vocabulary. "
        f"Current context: {context}. Riding = motorcycle/bicycle rider signals, Scuba = underwater diver signals, Everyday = general sign language. "
        "Return ONLY compact JSON of the form: "
        '{"label": "<one of vocabulary or none>", "confidence": "high|medium|low|none"}. '
        "No prose, no code fences, no explanations. "
        "If the image clearly contains a non-hand subject or no identifiable gesture, return label='none' and confidence='none'."
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=f"gesture-{uuid.uuid4().hex[:8]}",
        system_message=system_message,
    ).with_model("openai", "gpt-5.4-mini")
    image_content = ImageContent(image_base64=raw_b64)
    message = UserMessage(
        text=f"Vocabulary: {json.dumps(vocab)}\nClassify the hand gesture in the attached photo.",
        file_contents=[image_content],
    )
    try:
        response_text = await chat.send_message(message)
    except Exception as classify_error:
        logger.warning("Gesture recognition failed: %s", classify_error)
        raise HTTPException(status_code=502, detail="Vision model is unavailable right now")

    label = "none"
    confidence = "none"
    try:
        match = re.search(r"\{[\s\S]*\}", str(response_text))
        parsed = json.loads(match.group(0)) if match else {}
        candidate = str(parsed.get("label", "")).strip()
        if candidate.lower() in {"none", ""}:
            label = "none"
            confidence = "none"
        else:
            lookup = {item.lower(): item for item in vocab}
            label = lookup.get(candidate.lower(), candidate)
            raw_conf = str(parsed.get("confidence", "low")).lower()
            confidence = raw_conf if raw_conf in {"high", "medium", "low", "none"} else "low"
    except Exception as parse_error:
        logger.warning("Could not parse vision response: %s | raw=%r", parse_error, response_text)

    spoken_text = label
    if label and label != "none":
        gesture_doc = await db.gestures.find_one({"label": label}, {"_id": 0})
        if gesture_doc:
            overrides = gesture_doc.get("context_overrides") or {}
            spoken_text = overrides.get(context) or gesture_doc.get("spoken_text") or label

    return RecognizeResponse(label=label, spoken_text=spoken_text, confidence=confidence)


@api_router.get("/quick-phrases", response_model=List[QuickPhrase])
async def get_quick_phrases(context_mode: Optional[str] = None):
    await ensure_quick_phrases_seeded()
    query: dict = {}
    if context_mode and context_mode in ("Everyday", "Riding", "Scuba"):
        query = {"context_mode": {"$in": [context_mode, "All"]}}
    phrases = await db.quick_phrases.find(query, {"_id": 0}).to_list(100)
    return [QuickPhrase(**phrase) for phrase in phrases]


@api_router.get("/history", response_model=List[HistoryItem])
async def get_history(device_id: str = Query(...), limit: int = Query(20, ge=1, le=100)):
    rows = await db.history.find({"device_id": device_id}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return [HistoryItem(**row) for row in rows]


@api_router.post("/history", response_model=HistoryItem)
async def add_history(input: HistoryCreate):
    sentence = input.sentence.strip()
    if not sentence:
        raise HTTPException(status_code=400, detail="Sentence is required")
    item = HistoryItem(
        id=str(uuid.uuid4()),
        device_id=input.device_id,
        sentence=sentence,
        context_mode=input.context_mode,
        timestamp=datetime.now(timezone.utc),
    )
    await db.history.insert_one(item.model_dump())
    return item


@api_router.delete("/history")
async def clear_history(device_id: str = Query(...)):
    result = await db.history.delete_many({"device_id": device_id})
    return {"deleted": result.deleted_count}


@api_router.get("/favorites", response_model=List[str])
async def get_favorites(device_id: str = Query(...)):
    rows = await db.favorites.find({"device_id": device_id}, {"_id": 0, "gesture_id": 1}).to_list(500)
    return [row["gesture_id"] for row in rows]


@api_router.post("/favorites")
async def add_favorite(input: FavoriteItem):
    await db.favorites.update_one(
        {"device_id": input.device_id, "gesture_id": input.gesture_id},
        {"$set": {"device_id": input.device_id, "gesture_id": input.gesture_id}},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/favorites")
async def remove_favorite(device_id: str = Query(...), gesture_id: str = Query(...)):
    await db.favorites.delete_one({"device_id": device_id, "gesture_id": gesture_id})
    return {"ok": True}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    try:
        await run_in_threadpool(_init_storage)
    except Exception as exc:
        logger.warning("Startup object-storage init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
