"""
VenaSight rPPG Processing Engine
Phase 2: Real integration with ubicomplab/rPPG-Toolbox (POS Algorithm)

This module is the ONLY place where rPPG computation happens.
FastAPI's endpoint calls `run_pos_analysis(video_path)` and gets back metrics.

Architecture:
  1. OpenCV reads frames + detects face (Haar Cascade)
  2. Crop ROI (forehead + cheeks) from each frame
  3. Pass frame array to rPPG-Toolbox's POS_WANG()
  4. Compute BPM via FFT (from toolbox's post_process)
  5. Compute HRV estimate via RMSSD from peak intervals
  6. Compute confidence score from signal SNR
"""

import logging
import sys
import os
from pathlib import Path

import cv2
import numpy as np
from scipy import signal
from scipy.signal import find_peaks

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resolve rPPG-Toolbox path and inject into sys.path so toolbox imports work
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # venasight-mvp/backend/
TOOLBOX_DIR = BACKEND_DIR / "rPPG-Toolbox"

def _ensure_toolbox_on_path():
    """Add rPPG-Toolbox root to sys.path so its internal imports resolve."""
    toolbox_str = str(TOOLBOX_DIR)
    if toolbox_str not in sys.path:
        sys.path.append(toolbox_str)
        logger.info("✅ rPPG-Toolbox added to sys.path: %s", toolbox_str)

_ensure_toolbox_on_path()

# These imports MUST come after _ensure_toolbox_on_path()
try:
    from unsupervised_methods.methods.POS_WANG import POS_WANG  # type: ignore
    from evaluation.post_process import _calculate_fft_hr, _calculate_peak_hr  # type: ignore
    TOOLBOX_AVAILABLE = True
    logger.info("✅ rPPG-Toolbox modules loaded successfully.")
except ImportError as e:
    TOOLBOX_AVAILABLE = False
    logger.error("❌ Failed to import rPPG-Toolbox: %s", e)
    logger.error("   Make sure you have cloned the repo to: %s", TOOLBOX_DIR)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TARGET_FPS = 30            # Expected webcam FPS (used as rPPG sampling rate)
MIN_DURATION_SECONDS = 5.0 # Minimum recording duration for a valid BVP signal
MAX_FRAMES = 450           # Cap at 15s @ 30fps
HR_LOW_HZ = 0.6           # 36 BPM lower bound
HR_HIGH_HZ = 3.3          # 200 BPM upper bound
STABILIZATION_SECONDS = 1.0  # Skip first N seconds of BVP (user settling in)
WINDOW_SECONDS = 5.0         # Each FFT window length for windowed BPM
WINDOW_STEP_SECONDS = 2.5    # Overlap step between windows (50% overlap)

# Haar Cascade for face detection (bundled with OpenCV)
FACE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_face_cascade() -> cv2.CascadeClassifier:
    cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
    if cascade.empty():
        raise RuntimeError(
            f"Could not load Haar Cascade from: {FACE_CASCADE_PATH}. "
            "Ensure OpenCV is installed correctly."
        )
    return cascade


def _extract_face_roi_frames(video_path: str) -> tuple[np.ndarray, float]:
    """
    Read video, detect face in first stable frame, then crop and collect
    all frames to that bounding box.

    Returns:
        frames (np.ndarray): shape (N, H_crop, W_crop, 3), dtype float32, RGB
        fps (float): detected or assumed FPS of the video

    Raises:
        ValueError: if no face detected or video is unreadable
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or fps > 120:
        logger.warning("⚠️  Suspicious FPS detected (%.1f). Falling back to %d.", fps, TARGET_FPS)
        fps = TARGET_FPS

    cascade = _load_face_cascade()
    face_bbox = None
    frames_rgb = []

    # --- Pass 1: find a stable face bounding box from first 60 frames ---
    frame_buffer = []
    for _ in range(60):
        ret, frame = cap.read()
        if not ret:
            break
        frame_buffer.append(frame)

    for frame in frame_buffer:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=10,  # Increased from 5 to 10 to avoid false positive faces on walls/shadows
            minSize=(100, 100), # Slightly larger min face size
        )
        if len(faces) > 0:
            # Take the largest face
            face_bbox = max(faces, key=lambda f: f[2] * f[3])
            break

    if face_bbox is None:
        cap.release()
        raise ValueError(
            "Wajah tidak terdeteksi pada frame video atau pencahayaan terlalu rendah."
        )

    x, y, w, h = face_bbox
    logger.info("👤 Face detected at bbox: x=%d y=%d w=%d h=%d", x, y, w, h)

    # --- Pass 2: crop all frames to detected bbox ---
    # First, process the buffered frames
    for frame in frame_buffer:
        roi = frame[y : y + h, x : x + w]
        roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        frames_rgb.append(roi_rgb.astype(np.float32))

    # Then read the rest of the video
    frame_count = len(frame_buffer)
    while frame_count < MAX_FRAMES:
        ret, frame = cap.read()
        if not ret:
            break
        roi = frame[y : y + h, x : x + w]
        roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
        frames_rgb.append(roi_rgb.astype(np.float32))
        frame_count += 1

    cap.release()

    if len(frames_rgb) < 2:
        raise ValueError(
            "Video tidak dapat dibaca atau tidak mengandung frame yang valid."
        )

    # Validate by actual duration (works correctly regardless of webcam FPS)
    actual_duration = len(frames_rgb) / fps
    if actual_duration < MIN_DURATION_SECONDS:
        raise ValueError(
            f"Video terlalu pendek: hanya {actual_duration:.1f} detik terdeteksi "
            f"({len(frames_rgb)} frame @ {fps:.1f} fps). "
            f"Minimal {MIN_DURATION_SECONDS:.0f} detik diperlukan untuk analisis yang akurat."
        )

    frames_array = np.stack(frames_rgb, axis=0)  # (N, H, W, 3)
    logger.info("📹 Extracted %d frames @ %.1f FPS, ROI shape: %s",
                len(frames_rgb), fps, frames_array.shape[1:])
    return frames_array, fps


def _compute_hrv_rmssd(bvp_signal: np.ndarray, fps: float) -> float:
    """
    Estimate HRV using RMSSD (Root Mean Square of Successive Differences)
    from inter-beat intervals detected by peak-finding on the BVP signal.

    Improvements over naive implementation:
    1. Cubic-spline upsample 4x before peak detection — reduces quantization
       error from ±(1/fps) s to ±(1/fps/4) s. At 12.5 fps this shrinks the
       per-peak error from ±80 ms to ±20 ms, which massively reduces
       artificially inflated RMSSD values.
    2. Physiological IBI filtering — discard IBIs outside [300, 2000] ms
       (equivalent to 30–200 BPM). These are false peaks from noisy signal.
    3. Outlier IBI removal — IBIs that deviate >50% from the median IBI are
       likely artefacts and are removed before computing RMSSD.

    Returns:
        hrv_ms (float): RMSSD in milliseconds. Returns 0.0 if not enough
                        valid peaks remain after filtering.
    """
    from scipy.interpolate import CubicSpline

    # ── 1. Normalize ────────────────────────────────────────────────────────
    norm_signal = (bvp_signal - np.mean(bvp_signal)) / (np.std(bvp_signal) + 1e-9)

    # ── 2. Cubic-spline upsample 4× for sub-frame peak precision ───────────
    UPSAMPLE = 4
    n = len(norm_signal)
    t_orig = np.linspace(0.0, n / fps, n)
    t_up   = np.linspace(0.0, n / fps, n * UPSAMPLE)
    fps_up = fps * UPSAMPLE

    try:
        cs = CubicSpline(t_orig, norm_signal)
        signal_up = cs(t_up)
    except Exception:
        signal_up = norm_signal   # Fallback: use original if spline fails
        fps_up = fps

    # ── 3. Peak detection on upsampled signal ───────────────────────────────
    min_distance_up = int(fps_up * 0.3)   # 0.3 s = 200 BPM upper bound
    peaks_up, _ = find_peaks(
        signal_up,
        distance=min_distance_up,
        prominence=0.25,           # Slightly lower to catch real peaks in noisy rPPG
    )

    if len(peaks_up) < 3:
        logger.warning("⚠️  Not enough BVP peaks for HRV calc (%d found)", len(peaks_up))
        return 0.0

    # ── 4. Convert peak indices → IBI in ms (upsampled fps) ─────────────────
    ibi_ms = np.diff(peaks_up) / fps_up * 1000.0

    # ── 5. Physiological filter: keep only IBIs in [300, 2000] ms ───────────
    ibi_valid = ibi_ms[(ibi_ms >= 300) & (ibi_ms <= 2000)]
    if len(ibi_valid) < 2:
        logger.warning("⚠️  Too few physiologically valid IBIs (%d) for RMSSD.", len(ibi_valid))
        return 0.0

    # ── 6. Outlier removal: discard IBIs >50% away from median ──────────────
    median_ibi = float(np.median(ibi_valid))
    ibi_clean = ibi_valid[np.abs(ibi_valid - median_ibi) / median_ibi <= 0.5]
    if len(ibi_clean) < 2:
        ibi_clean = ibi_valid   # Fallback if filtering removes too many

    # ── 7. RMSSD ────────────────────────────────────────────────────────────
    successive_diffs = np.diff(ibi_clean)
    rmssd = float(np.sqrt(np.mean(successive_diffs ** 2)))

    logger.info(
        "📊 HRV: %d raw peaks → %d valid IBIs → median IBI %.0f ms → RMSSD %.1f ms",
        len(peaks_up), len(ibi_clean), median_ibi, rmssd
    )
    return round(rmssd, 2)



def _compute_snr_confidence(bvp_signal: np.ndarray, fps: float) -> float:
    """
    Estimate signal quality (confidence) from the SNR of the BVP signal
    within the physiological HR band (0.6–3.3 Hz).

    Returns:
        confidence (float): Value in [0.0, 1.0]
    """
    N = bvp_signal.shape[0]
    freqs, psd = signal.periodogram(bvp_signal, fs=fps, nfft=max(256, N))

    # Signal power: in HR band
    hr_mask = (freqs >= HR_LOW_HZ) & (freqs <= HR_HIGH_HZ)
    # Noise power: everything outside HR band (but within 0–5 Hz)
    noise_mask = (freqs >= 0.1) & (freqs <= 5.0) & ~hr_mask

    signal_power = np.sum(psd[hr_mask])
    noise_power = np.sum(psd[noise_mask])

    if noise_power < 1e-10:
        return 1.0

    snr = signal_power / (noise_power + signal_power)
    confidence = float(np.clip(snr, 0.0, 1.0))
    return round(confidence, 3)


def _compute_windowed_bpm(bvp_signal: np.ndarray, fps: float) -> int:
    """
    Estimate BPM using overlapping FFT windows and return the median.

    Why: A single FFT over the entire signal is sensitive to motion artifacts
    in any sub-segment. By computing BPM for multiple overlapping windows and
    taking the median, transient noise events affect at most a few windows and
    are naturally suppressed.

    Window size : WINDOW_SECONDS seconds
    Step size   : WINDOW_STEP_SECONDS seconds (50% overlap by default)
    """
    win_samples  = int(WINDOW_SECONDS * fps)
    step_samples = int(WINDOW_STEP_SECONDS * fps)
    n = len(bvp_signal)

    if n < win_samples:
        # Signal shorter than one window — fall back to full-signal FFT
        logger.warning("⚠️  Signal too short for windowed BPM, falling back to full-signal FFT.")
        bpm_raw = _calculate_fft_hr(bvp_signal, fs=fps, low_pass=HR_LOW_HZ, high_pass=HR_HIGH_HZ)
        return int(round(float(bpm_raw)))

    bpm_estimates = []
    start = 0
    while start + win_samples <= n:
        window = bvp_signal[start : start + win_samples]
        try:
            bpm_w = _calculate_fft_hr(window, fs=fps, low_pass=HR_LOW_HZ, high_pass=HR_HIGH_HZ)
            bpm_int = int(round(float(bpm_w)))
            if 30 <= bpm_int <= 220:  # Only keep physiologically plausible values
                bpm_estimates.append(bpm_int)
        except Exception as e:
            logger.warning("⚠️  Windowed FFT failed for window at %d: %s", start, e)
        start += step_samples

    if not bpm_estimates:
        # All windows failed — fall back to full-signal FFT
        logger.warning("⚠️  No valid windowed BPM estimates, falling back to full-signal FFT.")
        bpm_raw = _calculate_fft_hr(bvp_signal, fs=fps, low_pass=HR_LOW_HZ, high_pass=HR_HIGH_HZ)
        return int(round(float(bpm_raw)))

    median_bpm = int(round(float(np.median(bpm_estimates))))
    logger.info(
        "📊 Windowed BPM estimates: %s → median = %d",
        bpm_estimates, median_bpm
    )
    return median_bpm


# ---------------------------------------------------------------------------
# Public API — called by FastAPI endpoint
# ---------------------------------------------------------------------------

def run_pos_analysis(video_path: str) -> dict:
    """
    Full rPPG pipeline using rPPG-Toolbox's POS algorithm.

    Args:
        video_path: Absolute path to the saved video temp file.

    Returns:
        dict with keys: bpm (int), hrv_estimate (float), confidence_score (float)

    Raises:
        RuntimeError: if rPPG-Toolbox is not installed/importable
        ValueError: if face not detected or video too short
    """
    if not TOOLBOX_AVAILABLE:
        raise RuntimeError(
            "rPPG-Toolbox tidak ditemukan. "
            f"Clone repo ke: {TOOLBOX_DIR} dan install dependensinya."
        )

    # Step 1: Extract face ROI frames
    frames, fps = _extract_face_roi_frames(video_path)

    # Step 2: Run POS algorithm from rPPG-Toolbox
    # POS_WANG expects: (N, H, W, 3) float array + sampling rate
    logger.info("🔬 Running POS_WANG on %d frames @ %.1f Hz ...", len(frames), fps)
    bvp_signal = POS_WANG(frames, fps)  # Returns 1D numpy array (BVP signal)

    if bvp_signal is None or len(bvp_signal) < 10:
        raise ValueError("POS algorithm gagal menghasilkan sinyal BVP yang valid.")

    bvp_flat = np.squeeze(bvp_signal)

    # Step 3: Discard stabilization period (first N seconds are noisy —
    # user is still settling into position and face ROI is unstable).
    stab_samples = int(STABILIZATION_SECONDS * fps)
    if len(bvp_flat) > stab_samples + int(WINDOW_SECONDS * fps):
        bvp_stable = bvp_flat[stab_samples:]
        logger.info("✂️  Skipped first %.1fs (%d samples) for stabilization.",
                    STABILIZATION_SECONDS, stab_samples)
    else:
        bvp_stable = bvp_flat  # Signal too short to trim — use as-is

    # Step 4: Compute BPM via windowed FFT median (more robust than single FFT)
    bpm = _compute_windowed_bpm(bvp_stable, fps)
    logger.info("💓 BPM (windowed median): %d", bpm)

    # Sanity check BPM
    if not (30 <= bpm <= 220):
        logger.warning("⚠️  BPM out of physiological range (%d). Check signal quality.", bpm)

    # Step 5: Compute HRV estimate (RMSSD)
    hrv = _compute_hrv_rmssd(bvp_stable, fps)
    logger.info("📊 HRV RMSSD: %.2f ms", hrv)

    # Step 6: Signal quality / confidence
    confidence = _compute_snr_confidence(bvp_stable, fps)
    logger.info("🎯 Confidence score: %.3f", confidence)

    # Reject completely garbage signals (usually means false face detection or extreme motion)
    if confidence < 0.25:
        logger.error("Signal confidence too low (%.3f). Rejecting.", confidence)
        raise ValueError(
            "Kualitas sinyal sangat rendah. Pastikan pencahayaan cukup, wajah berada di tengah frame, dan Anda tidak bergerak selama pemindaian."
        )

    return {
        "bpm": bpm,
        "hrv_estimate": hrv,
        "confidence_score": confidence,
    }
