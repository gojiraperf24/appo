from fastapi import FastAPI, APIRouter, HTTPException, Response, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import re
import json
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


class CustomGestureCreate(BaseModel):
    label: str
    spoken_text: str
    description: str = ""


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


GESTURE_SEED: list[dict] = [
    {"id": "hello", "label": "Hello", "spoken_text": "Hello", "category": "Fixed", "description": "A friendly greeting for starting a conversation.", "icon": "hand-left-outline", "source": "Core signs", "context_overrides": {}},
    {"id": "thank-you", "label": "Thank you", "spoken_text": "Thank you", "category": "Fixed", "description": "A quick way to acknowledge help or kindness.", "icon": "heart-outline", "source": "Core signs", "context_overrides": {}},
    {"id": "yes", "label": "Yes", "spoken_text": "Yes", "category": "Fixed", "description": "Confirm a question or request.", "icon": "checkmark-circle-outline", "source": "Core signs", "context_overrides": {}},
    {"id": "no", "label": "No", "spoken_text": "No", "category": "Fixed", "description": "Decline or correct something clearly.", "icon": "close-circle-outline", "source": "Core signs", "context_overrides": {}},
    {"id": "help", "label": "Help", "spoken_text": "I need help", "category": "Fixed", "description": "A universal support signal.", "icon": "hand-right-outline", "source": "Core signs", "context_overrides": {"Riding": "I need to pull over for help", "Scuba": "I have a problem, assistance needed"}},
    {"id": "okay", "label": "OK", "spoken_text": "Okay", "category": "Fixed", "description": "Everything is fine or understood.", "icon": "checkmark-done-outline", "source": "Core signs", "context_overrides": {"Riding": "All clear, keep riding", "Scuba": "I am okay"}},
    {"id": "stop", "label": "Stop", "spoken_text": "Please stop", "category": "Fixed", "description": "Request to stop or pause.", "icon": "stop-circle-outline", "source": "Core signs", "context_overrides": {"Riding": "Stopping ahead", "Scuba": "Hold position"}},
    {"id": "slow", "label": "Slow down", "spoken_text": "Please slow down", "category": "Fixed", "description": "Ease the pace.", "icon": "walk-outline", "source": "Core signs", "context_overrides": {"Riding": "Slow down the group", "Scuba": "Slow your ascent"}},
    {"id": "thumb-up", "label": "Thumb up", "spoken_text": "Good", "category": "Fixed", "description": "A positive confirmation.", "icon": "thumbs-up-outline", "source": "Core signs", "context_overrides": {"Riding": "Hazard clear, go", "Scuba": "Ascend, go up"}},
    {"id": "thumb-down", "label": "Thumb down", "spoken_text": "Not good", "category": "Fixed", "description": "A negative signal.", "icon": "thumbs-down-outline", "source": "Core signs", "context_overrides": {"Riding": "Hazard ahead", "Scuba": "Descend, go down"}},
    {"id": "water", "label": "Water", "spoken_text": "I need water", "category": "Scuba", "description": "Request water or indicate thirst.", "icon": "water-outline", "source": "Scuba signs", "context_overrides": {"Scuba": "Low on air"}},
    {"id": "left", "label": "Left", "spoken_text": "Turning left", "category": "Bike", "description": "Signal a left turn.", "icon": "arrow-back-outline", "source": "Bike rider signs", "context_overrides": {}},
    {"id": "right", "label": "Right", "spoken_text": "Turning right", "category": "Bike", "description": "Signal a right turn.", "icon": "arrow-forward-outline", "source": "Bike rider signs", "context_overrides": {}},
    {"id": "a", "label": "A", "spoken_text": "A", "category": "Alphabet", "description": "Alphabet sign A.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
    {"id": "b", "label": "B", "spoken_text": "B", "category": "Alphabet", "description": "Alphabet sign B.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
    {"id": "c", "label": "C", "spoken_text": "C", "category": "Alphabet", "description": "Alphabet sign C.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
    {"id": "d", "label": "D", "spoken_text": "D", "category": "Alphabet", "description": "Alphabet sign D.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
    {"id": "e", "label": "E", "spoken_text": "E", "category": "Alphabet", "description": "Alphabet sign E.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
    {"id": "f", "label": "F", "spoken_text": "F", "category": "Alphabet", "description": "Alphabet sign F.", "icon": "text-outline", "source": "Alphabet", "context_overrides": {}},
]

QUICK_PHRASE_SEED: list[dict] = [
    {"id": "qp-hello", "text": "Hello, how are you?", "icon": "hand-left-outline", "context_mode": "All"},
    {"id": "qp-thanks", "text": "Thank you so much", "icon": "heart-outline", "context_mode": "All"},
    {"id": "qp-help", "text": "I need help, please", "icon": "alert-circle-outline", "context_mode": "All"},
    {"id": "qp-water", "text": "May I have some water?", "icon": "water-outline", "context_mode": "Everyday"},
    {"id": "qp-restroom", "text": "Where is the restroom?", "icon": "navigate-outline", "context_mode": "Everyday"},
    {"id": "qp-wait", "text": "Please wait a moment", "icon": "time-outline", "context_mode": "Everyday"},
    {"id": "qp-ride-stop", "text": "Pulling over soon", "icon": "stop-circle-outline", "context_mode": "Riding"},
    {"id": "qp-ride-gas", "text": "Need to fuel up", "icon": "flame-outline", "context_mode": "Riding"},
    {"id": "qp-ride-break", "text": "Taking a break", "icon": "cafe-outline", "context_mode": "Riding"},
    {"id": "qp-scuba-ok", "text": "I am okay", "icon": "checkmark-done-outline", "context_mode": "Scuba"},
    {"id": "qp-scuba-air", "text": "Low on air", "icon": "warning-outline", "context_mode": "Scuba"},
    {"id": "qp-scuba-up", "text": "Let's go up", "icon": "arrow-up-outline", "context_mode": "Scuba"},
]

TTS_CACHE_DIR = ROOT_DIR / "tts_cache"
TTS_CACHE_DIR.mkdir(exist_ok=True)
MEDIA_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav"}


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
async def get_gestures(category: Optional[str] = None):
    await upsert_gesture_seed()
    # Keep legacy rows backward-compatible: default context_overrides for older seeded data.
    query = {"category": category} if category and category != "All" else {}
    gestures = await db.gestures.find(query, {"_id": 0}).sort("category", 1).to_list(500)
    return [Gesture(**{**gesture, "context_overrides": gesture.get("context_overrides") or {}}) for gesture in gestures]


@api_router.post("/gestures", response_model=Gesture)
async def create_custom_gesture(input: CustomGestureCreate):
    label = input.label.strip()
    spoken_text = input.spoken_text.strip()
    if not label or not spoken_text:
        raise HTTPException(status_code=400, detail="Label and spoken text are required")
    gesture = Gesture(
        id=f"custom-{uuid.uuid4().hex[:10]}",
        label=label,
        spoken_text=spoken_text,
        category="Custom",
        description=input.description.strip() or "A custom gesture added by the wearer.",
        icon="sparkles-outline",
        source="Your custom library",
        context_overrides={},
    )
    await db.gestures.insert_one(gesture.model_dump())
    return gesture


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

    # Strip data URI prefix if present
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

    # Robust JSON extraction
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
            # Snap to exact vocabulary entry (case-insensitive)
            lookup = {item.lower(): item for item in vocab}
            label = lookup.get(candidate.lower(), candidate)
            raw_conf = str(parsed.get("confidence", "low")).lower()
            confidence = raw_conf if raw_conf in {"high", "medium", "low", "none"} else "low"
    except Exception as parse_error:
        logger.warning("Could not parse vision response: %s | raw=%r", parse_error, response_text)

    # Map to spoken text using the gestures table + context overrides
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
