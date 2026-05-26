import CameraScanner from "./components/CameraScanner";
import { HeartbeatIcon } from "./components/HeartbeatIcon";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        gap: "2rem",
        background:
          "radial-gradient(ellipse 80% 50% at 50% -5%, rgba(13,148,136,0.08) 0%, transparent 65%)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{ textAlign: "center" }}>
        {/* Logo mark */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: "0.875rem",
            background: "rgba(20,184,166,0.1)",
            border: "1px solid rgba(20,184,166,0.2)",
            marginBottom: "1rem",
          }}
        >
          <HeartbeatIcon />
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            lineHeight: 1.1,
          }}
        >
          Vena<span style={{ color: "var(--accent)" }}>Sight</span>
        </h1>

        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            maxWidth: "34ch",
            lineHeight: 1.6,
            margin: "0.5rem auto 0",
          }}
        >
          Pemindaian kardiovaskular optis berbasis rPPG — tanpa sensor tambahan.
        </p>
      </header>

      {/* ── Scanner ─────────────────────────────────────────────────────── */}
      <CameraScanner />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ textAlign: "center" }}>
        <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", letterSpacing: "0.04em" }}>
          Data video tidak disimpan &bull; Algoritma POS (Plane-Orthogonal-to-Skin)
        </p>
      </footer>
    </main>
  );
}
