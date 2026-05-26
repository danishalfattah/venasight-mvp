"""
VenaSight Backend - FastAPI Application
Phase 1: API Wrapper with Mocked rPPG Processing

Architecture:
  - Receives video via POST /api/v1/analyze (multipart/form-data)
  - Saves to temp dir, processes (mocked), returns metrics, cleans up
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import api_router

app = FastAPI(
    title="VenaSight API",
    description="Cardiovascular screening via remote Photoplethysmography (rPPG)",
    version="1.0.0",
)

# Allow requests from Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "service": "VenaSight API"}
