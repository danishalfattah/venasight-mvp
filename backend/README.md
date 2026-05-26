# VenaSight Backend

FastAPI-based backend for the VenaSight cardiovascular screening system.

## Project Structure

```
backend/
├── main.py                        # FastAPI app entry point
├── requirements.txt               # Python dependencies
├── app/
│   └── api/
│       └── v1/
│           ├── router.py          # API v1 route aggregator
│           └── endpoints/
│               └── analyze.py    # POST /api/v1/analyze
└── rPPG-Toolbox/                  # (Phase 2) cloned from ubicomplab
```

## Setup & Run

```powershell
# 1. Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/analyze` | Analyze face video for BPM/HRV |

### POST /api/v1/analyze

**Request:** `multipart/form-data` with key `video` (binary file, webm/mp4)

**Response (200):**
```json
{
  "status": "success",
  "timestamp": "2026-05-26T10:24:00Z",
  "data": {
    "bpm": 75,
    "hrv_estimate": 45.0,
    "confidence_score": 0.85
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Wajah tidak terdeteksi pada frame video atau pencahayaan terlalu rendah."
}
```

## Development Phases

- **Phase 1 (current):** Mocked processing — `time.sleep(3)` returns static BPM/HRV
- **Phase 2:** Real rPPG-Toolbox POS algorithm integration
