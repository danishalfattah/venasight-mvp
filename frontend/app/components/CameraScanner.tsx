"use client";

import {
  VideoCamera,
  VideoCameraSlash,
  Heart,
  Waveform,
  SealCheck,
  Warning,
  ArrowCounterClockwise,
  Heartbeat,
  Timer,
  CheckCircle,
} from "@phosphor-icons/react";
import { useRppgScanner, classifyBpm, type FaceStatus } from "../hooks/useRppgScanner";

// ─── Face status config ───────────────────────────────────────────────────────

const FACE_STATUS_CONFIG: Record<
  FaceStatus,
  { color: string; hint: string; icon: string }
> = {
  none:      { color: "#ef4444",  hint: "Posisikan wajah di dalam oval",       icon: "👤" },
  too_dark:  { color: "#f97316",  hint: "Pencahayaan terlalu gelap — cari tempat lebih terang", icon: "💡" },
  too_far:   { color: "#eab308",  hint: "Dekatkan wajah ke kamera",            icon: "🔍" },
  too_close: { color: "#eab308",  hint: "Mundurkan sedikit dari kamera",       icon: "↔️" },
  good:      { color: "#14B8A6",  hint: "Posisi sempurna — siap memindai!",    icon: "✅" },
};

// ─── HRV classification (qualitative — webcam rPPG tidak cukup akurat untuk ms) ──

interface HrvStatus {
  label: string;
  sublabel: string;
  color: string;
}

function classifyHrv(hrv_ms: number): HrvStatus {
  // Webcam rPPG adds ~30-80ms systematic noise to RMSSD.
  // We use wider-than-clinical thresholds and show a qualitative label
  // instead of a precise number to avoid misleading the user.
  if (hrv_ms <= 0)
    return { label: "Tidak Terukur", sublabel: "Sinyal kurang bersih", color: "var(--text-muted)" };
  if (hrv_ms < 50)
    return { label: "Rendah",        sublabel: "Mungkin stres / lelah",  color: "var(--warning)" };
  if (hrv_ms <= 150)
    return { label: "Normal",        sublabel: "Sistem saraf otonom baik", color: "var(--success)" };
  return   { label: "Tinggi",        sublabel: "Sangat relaks / estimasi", color: "var(--accent)" };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RING_CIRCUMFERENCE = 2 * Math.PI * 45; // r=45 → C ≈ 283

// ─── Sub-components ───────────────────────────────────────────────────────────

/** SVG corner bracket overlay — dims when idle, teal when recording */
function CornerBrackets({ active }: { active: boolean }) {
  const color = active ? "#14B8A6" : "rgba(255,255,255,0.15)";
  const arm = 22;
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <polyline points={`${arm},4 4,4 4,${arm}`}          fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <polyline points={`${100 - arm},4 96,4 96,${arm}`}  fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <polyline points={`${arm},96 4,96 4,${100 - arm}`}  fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <polyline points={`${100 - arm},96 96,96 96,${100 - arm}`} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Circular SVG countdown ring that drains over 20 seconds */
function CountdownRing({ secondsLeft }: { secondsLeft: number }) {
  const progress = (20 - secondsLeft) / 20;
  const dashOffset = RING_CIRCUMFERENCE * progress;
  const urgent = secondsLeft <= 3;

  return (
    <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke={urgent ? "var(--warning)" : "#14B8A6"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
        />
      </svg>
      <span style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: "1rem",
        fontWeight: 600,
        color: urgent ? "var(--warning)" : "var(--text-primary)",
        transition: "color 0.3s ease",
      }}>
        {secondsLeft}
      </span>
    </div>
  );
}

/** Formatted scan timestamp */
function ScanTimestamp({ iso }: { iso: string }) {
  const date = new Date(iso);
  const formatted = date.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.375rem",
      color: "var(--text-muted)", fontSize: "0.6875rem", letterSpacing: "0.04em",
    }}>
      <Timer size={12} weight="regular" />
      <span style={{ fontFamily: "var(--font-mono)" }}>{formatted}</span>
    </div>
  );
}

/** BPM status pill badge */
function BpmStatusPill({ bpm }: { bpm: number }) {
  const status = classifyBpm(bpm);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.3rem",
      padding: "0.2rem 0.6rem",
      borderRadius: "9999px",
      fontSize: "0.6875rem",
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: status.color,
      background: `color-mix(in srgb, ${status.color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${status.color} 30%, transparent)`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: status.color, display: "inline-block",
      }} />
      {status.label}
    </span>
  );
}

/** Animated confidence bar */
function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 75 ? "var(--success)" : pct >= 45 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Kualitas Sinyal
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", fontWeight: 500, color }}>
          {pct}%
        </span>
      </div>
      <div className="confidence-bar-track">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** Real-time framing hint bar shown below the oval */
function FaceGuideHint({ faceStatus }: { faceStatus: FaceStatus }) {
  const cfg = FACE_STATUS_CONFIG[faceStatus];
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.4rem",
      marginTop: "0.5rem",
      padding: "0.4rem 0.75rem",
      borderRadius: "0.625rem",
      background: `color-mix(in srgb, ${cfg.color} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
      transition: "background 0.3s ease, border-color 0.3s ease",
    }}>
      <span style={{ fontSize: "0.85rem" }}>{cfg.icon}</span>
      <span style={{
        fontSize: "0.75rem",
        fontWeight: 500,
        color: cfg.color,
        transition: "color 0.3s ease",
      }}>
        {cfg.hint}
      </span>
    </div>
  );
}

export default function CameraScanner() {
  const {
    appState, hasPermission,
    secondsLeft, processingElapsed,
    result, error,
    faceStatus,
    videoRef,
    startCamera, startRecording, resetScan,
  } = useRppgScanner();

  const isRecording  = appState === "RECORDING";
  const isProcessing = appState === "PROCESSING";
  const isIdle       = appState === "IDLE";

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>

      {/* ══════════════════════════════════════════════════════════════════════
          CAMERA FRAME
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        id="camera-frame"
        className={`camera-frame ${isRecording ? "recording" : ""}`}
      >
        {/* Live mirror video */}
        <video
          ref={videoRef}
          id="camera-feed"
          className="camera-video"
          autoPlay
          playsInline
          muted
        />

        {/* Face placement oval — border color reflects faceStatus */}
        {hasPermission && !isProcessing && (
          <div className={`face-guide ${isRecording ? "recording" : ""}`}>
            <div
              className="face-guide-oval"
              style={{
                borderColor: isRecording
                  ? "#14B8A6"
                  : FACE_STATUS_CONFIG[faceStatus].color,
                boxShadow: isRecording
                  ? `0 0 0 2px color-mix(in srgb, #14B8A6 20%, transparent)`
                  : `0 0 0 2px color-mix(in srgb, ${FACE_STATUS_CONFIG[faceStatus].color} 15%, transparent)`,
                transition: "border-color 0.4s ease, box-shadow 0.4s ease",
              }}
            />
          </div>
        )}

        {/* Corner brackets */}
        {hasPermission && <CornerBrackets active={isRecording} />}

        {/* Scanner sweep — only during recording */}
        {isRecording && <div className="scanner-line" />}

        {/* ── Top-left status badge ── */}
        {hasPermission && !isProcessing && (
          <div
            id="status-badge"
            className="status-badge glass"
            style={{
              color:       isRecording ? "var(--accent)"            : "var(--text-secondary)",
              background:  isRecording ? "rgba(20,184,166,0.08)"    : "rgba(13,21,32,0.72)",
              borderColor: isRecording ? "rgba(20,184,166,0.22)"    : "var(--border-subtle)",
            }}
          >
            <span
              className={`status-dot ${isRecording ? "live" : ""}`}
              style={{ background: isRecording ? "var(--accent)" : "var(--text-muted)" }}
            />
            {isRecording ? "MEREKAM" : "SIAP"}
          </div>
        )}

        {/* ── Bottom-right countdown ring ── */}
        {isRecording && (
          <div style={{ position: "absolute", bottom: "0.875rem", right: "0.875rem" }}>
            <CountdownRing secondsLeft={secondsLeft} />
          </div>
        )}

        {/* ── Processing overlay ── */}
        {isProcessing && (
          <div className="processing-overlay">
            <div className="processing-spinner" />
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.9375rem" }}>
                Menganalisis Data
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.3rem" }}>
                Algoritma POS sedang berjalan
                {processingElapsed > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", marginLeft: "0.35rem", color: "var(--accent)" }}>
                    {processingElapsed}s
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Camera permission denied overlay ── */}
        {hasPermission === false && (
          <div
            className="permission-card"
            style={{ position: "absolute", inset: 0, borderRadius: "1.25rem", aspectRatio: "auto" }}
          >
            <VideoCameraSlash size={36} weight="thin" style={{ color: "var(--text-muted)" }} />
            <div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", fontWeight: 600 }}>
                Akses Kamera Diperlukan
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.375rem", lineHeight: 1.55 }}>
                Izinkan akses kamera di pengaturan browser Anda, lalu klik tombol di bawah.
              </p>
            </div>
            <button
              id="btn-retry-camera"
              className="btn-primary"
              style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
              onClick={startCamera}
            >
              <VideoCamera size={16} weight="bold" />
              Izinkan Kamera
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          IDLE HINT TEXT
      ══════════════════════════════════════════════════════════════════════ */}
      {hasPermission && isIdle && !result && !error && (
        <>
          <FaceGuideHint faceStatus={faceStatus} />
          {faceStatus === "good" && (
            <p style={{
              marginTop: "0.375rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textAlign: "center",
              opacity: 0.6,
            }}>
              Tekan{" "}
              <kbd style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                padding: "0.1rem 0.35rem",
                borderRadius: "0.25rem",
                background: "var(--bg-raised)",
                border: "1px solid var(--border-muted)",
              }}>Space</kbd>{" "}
              untuk memulai
            </p>
          )}
        </>
      )}

      {hasPermission && isIdle && result && !error && (
        <FaceGuideHint faceStatus={faceStatus} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ERROR BANNER
      ══════════════════════════════════════════════════════════════════════ */}
      {error && (
        <div id="error-banner" className="error-banner" style={{ marginTop: "0.875rem" }}>
          <Warning size={15} weight="fill" style={{ flexShrink: 0, marginTop: "0.125rem" }} />
          <span style={{ lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          RESULTS PANEL
      ══════════════════════════════════════════════════════════════════════ */}
      {result && isIdle && (
        <div
          id="results-panel"
          style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}
        >
          {/* ── Result header row ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingInline: "0.125rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle size={15} weight="fill" style={{ color: "var(--success)" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                Hasil Pemindaian
              </span>
            </div>
            <ScanTimestamp iso={result.scanned_at} />
          </div>

          {/* ── BPM card (full width, prominent) ── */}
          <div
            className="metric-card"
            style={{ animationDelay: "0ms", display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <Heartbeat size={15} weight="fill" style={{ color: "var(--accent)" }} />
                <span className="metric-label" style={{ marginTop: 0 }}>Detak Jantung</span>
              </div>
              <BpmStatusPill bpm={result.bpm} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
              <span className="metric-value" style={{ fontSize: "3rem" }}>{result.bpm}</span>
              <span className="metric-unit" style={{ fontSize: "1rem" }}>bpm</span>
            </div>
          </div>

          {/* ── HRV + Confidence row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
            {/* HRV card */}
            <div className="metric-card" style={{ animationDelay: "80ms" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.6rem" }}>
                <Waveform size={15} weight="fill" style={{ color: "var(--accent)" }} />
                <span className="metric-label" style={{ marginTop: 0 }}>HRV (RMSSD)</span>
              </div>
              {(() => {
                const hrv = classifyHrv(result.hrv_estimate);
                return (
                  <div>
                    <span className="metric-value" style={{ fontSize: "1.5rem", color: hrv.color }}>
                      {hrv.label}
                    </span>
                    <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                      {hrv.sublabel}
                    </p>
                    {result.hrv_estimate > 0 && (
                      <p style={{
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                        marginTop: "0.25rem",
                        opacity: 0.6,
                      }}>
                        ~{result.hrv_estimate.toFixed(0)} ms (estimasi)
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Confidence card */}
            <div className="metric-card" style={{ animationDelay: "160ms" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.6rem" }}>
                <SealCheck size={15} weight="fill" style={{ color: "var(--accent)" }} />
                <span className="metric-label" style={{ marginTop: 0 }}>Kepercayaan</span>
              </div>
              <ConfidenceBar score={result.confidence_score} />
            </div>
          </div>

          {/* ── Disclaimer ── */}
          <p style={{
            fontSize: "0.6875rem", color: "var(--text-muted)",
            lineHeight: 1.55, paddingInline: "0.125rem", opacity: 0.7,
          }}>
            Hasil ini bersifat estimasi dan bukan pengganti diagnosis medis profesional.
          </p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ACTION BUTTONS
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.625rem" }}>

        {/* Primary CTA — IDLE state */}
        {hasPermission && isIdle && !isProcessing && !isRecording && (
          <button
            id="btn-start-scan"
            className="btn-primary"
            style={{
              flex: 1,
              opacity: faceStatus === "good" ? 1 : 0.45,
              cursor: faceStatus === "good" ? "pointer" : "not-allowed",
              transition: "opacity 0.3s ease",
            }}
            disabled={faceStatus !== "good"}
            onClick={startRecording}
            title={
              faceStatus !== "good"
                ? FACE_STATUS_CONFIG[faceStatus].hint
                : undefined
            }
          >
            <Heart size={17} weight="fill" />
            {result ? "Scan Ulang" : "Mulai Sesi Pemindaian"}
          </button>
        )}

        {/* Reset icon button — only when result exists */}
        {result && isIdle && (
          <button
            id="btn-reset"
            aria-label="Hapus hasil"
            onClick={resetScan}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 48, height: 48, flexShrink: 0,
              borderRadius: "0.75rem",
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "border-color 0.2s ease, color 0.2s ease",
            }}
          >
            <ArrowCounterClockwise size={18} />
          </button>
        )}

        {/* Locked CTA — RECORDING state */}
        {isRecording && (
          <button
            className="btn-primary"
            style={{
              flex: 1,
              background: "var(--bg-raised)",
              color: "var(--text-muted)",
              cursor: "not-allowed",
              border: "1px solid var(--border-muted)",
            }}
            disabled
          >
            <span style={{
              width: 13, height: 13, flexShrink: 0,
              border: "2px solid var(--text-muted)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.85s linear infinite",
            }} />
            Merekam — {secondsLeft}s tersisa
          </button>
        )}

        {/* Locked CTA — PROCESSING state */}
        {isProcessing && (
          <button
            className="btn-primary"
            style={{
              flex: 1,
              background: "var(--bg-raised)",
              color: "var(--text-muted)",
              cursor: "not-allowed",
              border: "1px solid var(--border-muted)",
            }}
            disabled
          >
            <span style={{
              width: 13, height: 13, flexShrink: 0,
              border: "2px solid var(--text-muted)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.85s linear infinite",
            }} />
            Memproses...
          </button>
        )}
      </div>
    </div>
  );
}
