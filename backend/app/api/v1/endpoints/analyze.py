"""
POST /api/v1/analyze — rPPG Video Analysis Endpoint

Phase 2: Real rPPG-Toolbox (POS) integration.
  - Accepts multipart/form-data with key 'video'
  - Saves to a temp file
  - Calls rppg_engine.run_pos_analysis() → POS algorithm via rPPG-Toolbox
  - Returns BPM / HRV / confidence metrics
  - Deletes temp file in `finally` block regardless of success/failure
"""

import os
import tempfile
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from app.core.rppg_engine import run_pos_analysis

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    summary="Analyze a 20-second face video for BPM and HRV",
    response_description="Extracted physiological metrics from rPPG (POS algorithm)",
)
async def analyze_video(video: UploadFile = File(..., description="20-second webcam video (webm/mp4)")):
    """
    ## rPPG Video Analysis (POS Algorithm)

    Accepts a 20-second face video, runs POS-based rPPG extraction
    using the `ubicomplab/rPPG-Toolbox`, and returns:

    - **bpm**: Estimated heart rate in beats per minute
    - **hrv_estimate**: RMSSD-based heart rate variability estimate (ms)
    - **confidence_score**: Signal quality score [0.0–1.0]

    **Data Privacy**: The uploaded video file is deleted immediately
    after metrics are computed. No video is persisted to disk.

    **Error 400**: Returned when no face is detected or video is too short.
    **Error 500**: Returned for unexpected processing failures.
    **Error 503**: Returned if rPPG-Toolbox is not installed.
    """

    # ── 1. Validate MIME type ───────────────────────────────────────────────
    allowed_mime_types = {
        "video/webm",
        "video/mp4",
        "video/quicktime",
        "application/octet-stream",  # Some browsers send this for webm
    }
    if video.content_type not in allowed_mime_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: '{video.content_type}'. Send video/webm or video/mp4.",
        )

    # ── 2. Save to temp file ────────────────────────────────────────────────
    suffix = ".webm" if "webm" in (video.content_type or "") else ".mp4"
    tmp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            prefix="venasight_session_",
        ) as tmp_file:
            tmp_path = tmp_file.name
            content = await video.read()
            tmp_file.write(content)

        logger.info("📁 Video saved to temp path: %s (%d bytes)", tmp_path, len(content))

        if len(content) < 1024:
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "error",
                    "message": "File video terlalu kecil atau kosong. Pastikan kamera aktif saat merekam.",
                },
            )

        # ── 3. Run real rPPG-Toolbox POS processing ─────────────────────────
        try:
            metrics = run_pos_analysis(tmp_path)
        except RuntimeError as e:
            # Toolbox not installed
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "error",
                    "message": str(e),
                },
            ) from e
        except ValueError as e:
            # Face not detected, video too short, etc.
            raise HTTPException(
                status_code=400,
                detail={
                    "status": "error",
                    "message": str(e),
                },
            ) from e

        # ── 4. Build success response ────────────────────────────────────────
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {
                    "bpm": metrics["bpm"],
                    "hrv_estimate": metrics["hrv_estimate"],
                    "confidence_score": metrics["confidence_score"],
                },
            },
        )

    except HTTPException:
        raise  # Re-raise all HTTP exceptions as-is

    except Exception as exc:
        logger.exception("❌ Unexpected error during rPPG analysis: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": "Internal server error saat memproses video. Silakan coba lagi.",
            },
        ) from exc

    finally:
        # ── 5. CRITICAL: Delete temp file (data privacy guarantee) ──────────
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
                logger.info("🗑️  Temp file deleted: %s", tmp_path)
            except OSError as cleanup_err:
                logger.error("⚠️  Failed to delete temp file %s: %s", tmp_path, cleanup_err)
