/** Animated ECG/heartbeat SVG icon for the VenaSight logo mark */
export function HeartbeatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polyline
        points="2,12 6,12 8,5 10,19 12,9 14,15 16,12 22,12"
        stroke="#14B8A6"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 60,
          strokeDashoffset: 0,
          animation: "bracket-draw 1.2s ease-out forwards",
        }}
      />
    </svg>
  );
}
