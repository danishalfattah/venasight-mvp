"use client";

import { useRef, useEffect, useCallback, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AppState = "IDLE" | "RECORDING" | "PROCESSING";

/**
 * Real-time face framing status, derived from canvas pixel analysis:
 *  "none"      — no skin-tone pixels detected in oval area
 *  "too_dark"  — overall brightness too low for reliable detection
 *  "too_far"   — some skin pixels but below threshold (face too small/far)
 *  "too_close" — skin pixels fill >55% of oval (face too large/close)
 *  "good"      — skin coverage is within the optimal range
 */
export type FaceStatus = "none" | "too_dark" | "too_far" | "too_close" | "good";

export interface ScanResult {
  bpm: number;
  hrv_estimate: number;
  confidence_score: number;
  scanned_at: string; // ISO timestamp from backend
}

export interface BpmStatus {
  label: string;
  labelShort: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECORDING_DURATION_MS = 20_000;
const BACKEND_URL = "http://localhost:8000/api/v1/analyze";

/** How often (ms) we run the canvas face-check while camera is idle */
const FACE_CHECK_INTERVAL_MS = 500;

// ─── Helper: classify BPM ────────────────────────────────────────────────────

export function classifyBpm(bpm: number): BpmStatus {
  if (bpm < 60)
    return { label: "Bradikardia", labelShort: "Rendah", color: "var(--warning)" };
  if (bpm > 100)
    return { label: "Takikardia", labelShort: "Tinggi", color: "var(--danger)" };
  return { label: "Normal", labelShort: "Normal", color: "var(--success)" };
}

// ─── Helper: canvas-based face / lighting analysis ───────────────────────────

/**
 * Draws the current video frame to an offscreen canvas and samples the center
 * oval region (≈ 45 % width × 55 % height) for skin-tone pixel coverage and
 * overall brightness. Returns a FaceStatus enum value.
 *
 * Skin detection uses the classic RGB heuristic:
 *   R > 80, G > 30, B > 15, R > G, R > B,
 *   max(R,G,B) − min(R,G,B) > 15, |R−G| > 10, R−B > 10
 * This handles a wide range of skin tones under reasonable lighting.
 */
function analyzeFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): FaceStatus {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || video.readyState < 2) return "none";

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return "none";

  canvas.width = vw;
  canvas.height = vh;
  ctx.drawImage(video, 0, 0, vw, vh);

  // Sample the center oval region (approx 45% width, 55% height centered)
  const rx = Math.floor(vw * 0.275);
  const ry = Math.floor(vh * 0.15);
  const rw = Math.floor(vw * 0.45);
  const rh = Math.floor(vh * 0.55);

  let data: ImageData;
  try {
    data = ctx.getImageData(rx, ry, rw, rh);
  } catch {
    return "none";
  }

  const pixels = data.data;
  const totalPixels = rw * rh;
  let brightnessSum = 0;
  let skinCount = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    brightnessSum += (r * 299 + g * 587 + b * 114) / 1000;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isSkin =
      r > 80 &&
      g > 30 &&
      b > 15 &&
      r > g &&
      r > b &&
      max - min > 15 &&
      Math.abs(r - g) > 10 &&
      r - b > 10;

    if (isSkin) skinCount++;
  }

  const avgBrightness = brightnessSum / totalPixels;
  const skinRatio = skinCount / totalPixels;

  if (avgBrightness < 40) return "too_dark";
  if (skinRatio > 0.55)   return "too_close";
  if (skinRatio > 0.15)   return "good";
  if (skinRatio > 0.04)   return "too_far";
  return "none";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRppgScanner() {
  // ── State ───────────────────────────────────────────────────────────────────
  const [appState, setAppState]               = useState<AppState>("IDLE");
  const [hasPermission, setHasPermission]     = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft]         = useState(20);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [result, setResult]                   = useState<ScanResult | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [faceStatus, setFaceStatus]           = useState<FaceStatus>("none");

  // ── Refs ────────────────────────────────────────────────────────────────────
  const videoRef            = useRef<HTMLVideoElement>(null);
  const streamRef           = useRef<MediaStream | null>(null);
  const recorderRef         = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const mimeTypeRef         = useRef<string>("video/webm");
  const countdownRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceCheckRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisCanvasRef   = useRef<HTMLCanvasElement | null>(null);

  // ── Camera boot ─────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // 640×480 is sufficient for rPPG and much lighter than 1280×720
          width:       { ideal: 640 },
          height:      { ideal: 480 },
          frameRate:   { ideal: 30 },
          facingMode:  "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setHasPermission(true);
      setError(null);

      // Create offscreen canvas for pixel analysis (reused every interval tick)
      if (!analysisCanvasRef.current) {
        analysisCanvasRef.current = document.createElement("canvas");
      }
    } catch (err) {
      console.error("[VenaSight] Camera error:", err);
      setHasPermission(false);
      setError(
        "Akses kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi."
      );
    }
  }, []);

  // Boot camera on mount, cleanup on unmount
  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      clearInterval(countdownRef.current ?? undefined);
      clearTimeout(stopTimerRef.current ?? undefined);
      clearInterval(processingTimerRef.current ?? undefined);
      clearInterval(faceCheckRef.current ?? undefined);
    };
  }, [startCamera]);

  // ── Real-time face detection loop ───────────────────────────────────────────
  useEffect(() => {
    if (hasPermission !== true) return;

    faceCheckRef.current = setInterval(() => {
      // Pause analysis during recording/processing — avoid unnecessary CPU use
      if (appState !== "IDLE") return;

      const video  = videoRef.current;
      const canvas = analysisCanvasRef.current;
      if (!video || !canvas) return;

      const status = analyzeFrame(video, canvas);
      setFaceStatus(status);
    }, FACE_CHECK_INTERVAL_MS);

    return () => clearInterval(faceCheckRef.current ?? undefined);
  }, [hasPermission, appState]);

  // ── Keyboard shortcut: Space = start (when IDLE + face is good) ─────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        appState === "IDLE" &&
        hasPermission === true &&
        faceStatus === "good"
      ) {
        e.preventDefault();
        startRecording();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, hasPermission, faceStatus]);

  // ── API call ─────────────────────────────────────────────────────────────────
  const sendToBackend = useCallback(async (blob: Blob) => {
    setAppState("PROCESSING");
    setProcessingElapsed(0);
    setFaceStatus("none");

    // Processing elapsed ticker
    let elapsed = 0;
    processingTimerRef.current = setInterval(() => {
      elapsed += 1;
      setProcessingElapsed(elapsed);
    }, 1000);

    const formData = new FormData();
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("video", blob, `venasight_scan.${ext}`);

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        const msg =
          json?.detail?.message ??
          json?.detail ??
          `Server error ${response.status}`;
        throw new Error(msg);
      }

      setResult({
        bpm:              json.data.bpm,
        hrv_estimate:     json.data.hrv_estimate,
        confidence_score: json.data.confidence_score,
        scanned_at:       json.timestamp ?? new Date().toISOString(),
      });
      setError(null);
    } catch (err: unknown) {
      let msg: string;
      if (err instanceof TypeError && err.message.includes("fetch")) {
        msg =
          "Tidak dapat terhubung ke server. Pastikan backend berjalan: uvicorn main:app --port 8000";
      } else if (err instanceof Error) {
        msg = err.message;
      } else {
        msg = "Terjadi kesalahan yang tidak diketahui.";
      }
      setError(msg);
    } finally {
      clearInterval(processingTimerRef.current ?? undefined);
      setAppState("IDLE");
    }
  }, []);

  // ── Start recording ──────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || appState !== "IDLE") return;

    setResult(null);
    setError(null);
    setSecondsLeft(20);
    chunksRef.current = [];

    // Best supported MIME type (prefer webm vp9 → webm → mp4)
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";
    mimeTypeRef.current = mimeType;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType });
    } catch {
      // Fallback: let browser pick MIME type
      recorder = new MediaRecorder(streamRef.current);
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const finalMime = mimeTypeRef.current.split(";")[0];
      const blob = new Blob(chunksRef.current, { type: finalMime });
      console.log(
        `[VenaSight] Recording complete — ${blob.size} bytes, type: ${blob.type}`
      );
      sendToBackend(blob);
    };

    recorder.onerror = (e) => {
      console.error("[VenaSight] MediaRecorder error:", e);
      setError("Terjadi kesalahan saat merekam video. Silakan coba lagi.");
      setAppState("IDLE");
    };

    // Collect data every 250ms to ensure we get all chunks
    recorder.start(250);
    setAppState("RECORDING");

    // ── Countdown ticker (1s interval) ─────────────────────────────────────
    let remaining = 20;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(countdownRef.current ?? undefined);
    }, 1000);

    // ── Hard stop — guaranteed exactly at 10 000ms ──────────────────────────
    stopTimerRef.current = setTimeout(() => {
      clearInterval(countdownRef.current ?? undefined);
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, RECORDING_DURATION_MS);
  }, [appState, sendToBackend]);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetScan = useCallback(() => {
    setResult(null);
    setError(null);
    setSecondsLeft(20);
    setProcessingElapsed(0);
    setAppState("IDLE");
  }, []);

  return {
    // State
    appState,
    hasPermission,
    secondsLeft,
    processingElapsed,
    result,
    error,
    faceStatus,
    // Refs
    videoRef,
    // Actions
    startCamera,
    startRecording,
    resetScan,
  };
}
