import os
from dotenv import load_dotenv

# Load .env from the backend directory (works for both uvicorn and pytest)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import router as documents_router
from backend.api.analysis_routes import router as analysis_router
from backend.api.auth_routes import router as auth_router
from backend.api.stats_routes import router as stats_router
from backend.api.settings_routes import router as settings_router

app = FastAPI(
    title="File Classifier API",
    description="Backend API for the Italian Legal Document Classifier",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development (Vite can use different ports)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth router already has prefix="/auth" inside its file,
# so including it with "/api" results in "/api/auth/..."
app.include_router(auth_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(settings_router, prefix="/api")

@app.on_event("startup")
def on_startup():
    from backend.db.init_db import init_db
    init_db()

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "file_classifier_api"}
