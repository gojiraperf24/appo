from fastapi import FastAPI, APIRouter, HTTPException, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.openai import OpenAITextToSpeech


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


GESTURE_SEED: list[dict] = [
    {"id": "hello", "label": "Hello", "spoken_text": "Hello", "category": "Fixed", "description": "A friendly greeting for starting a conversation.", "icon": "hand-left-outline", "source": "Core signs"},
    {"id": "thank-you", "label": "Thank you", "spoken_text": "Thank you", "category": "Fixed", "description": "A quick way to acknowledge help or kindness.", "icon": "heart-outline", "source": "Core signs"},
    {"id": "yes", "label": "Yes", "spoken_text": "Yes", "category": "Fixed", "description": "Confirm a question or request.", "icon": "checkmark-circle-outline", "source": "Core signs"},
    {"id": "no", "label": "No", "spoken_text": "No", "category": "Fixed", "description": "Decline or correct something clearly.", "icon": "close-circle-outline", "source": "Core signs"},
    {"id": "help", "label": "Help", "spoken_text": "I need help", "category": "Fixed", "description": "A useful support phrase for everyday situations.", "icon": "hand-right-outline", "source": "Core signs"},
    {"id": "water", "label": "Water", "spoken_text": "I need water", "category": "Scuba", "description": "A practical underwater communication sign.", "icon": "water-outline", "source": "Scuba signs"},
    {"id": "okay", "label": "Okay", "spoken_text": "Okay", "category": "Bike", "description": "Confirm that everything is safe and understood.", "icon": "bicycle-outline", "source": "Bike rider signs"},
    {"id": "a", "label": "A", "spoken_text": "A", "category": "Alphabet", "description": "Alphabet sign A from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
    {"id": "b", "label": "B", "spoken_text": "B", "category": "Alphabet", "description": "Alphabet sign B from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
    {"id": "c", "label": "C", "spoken_text": "C", "category": "Alphabet", "description": "Alphabet sign C from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
    {"id": "d", "label": "D", "spoken_text": "D", "category": "Alphabet", "description": "Alphabet sign D from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
    {"id": "e", "label": "E", "spoken_text": "E", "category": "Alphabet", "description": "Alphabet sign E from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
    {"id": "f", "label": "F", "spoken_text": "F", "category": "Alphabet", "description": "Alphabet sign F from the initial glove vocabulary.", "icon": "text-outline", "source": "Alphabet"},
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
    query = {"category": category} if category and category != "All" else {}
    gestures = await db.gestures.find(query, {"_id": 0}).sort("category", 1).to_list(200)
    if not gestures:
        await db.gestures.insert_many([dict(item) for item in GESTURE_SEED])
        gestures = await db.gestures.find(query, {"_id": 0}).sort("category", 1).to_list(200)
    return [Gesture(**gesture) for gesture in gestures]


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
