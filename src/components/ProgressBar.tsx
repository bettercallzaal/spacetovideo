import { useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

// Thin bottom progress bar - shows how far through the session you are. Cheap to render
// (one div per frame), brand gold->cyan fill.
export const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = Math.max(0, Math.min(100, (frame / durationInFrames) * 100));
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 6,
        background: "rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${theme.orange}, ${theme.purple})`,
          boxShadow: `0 0 12px ${theme.orange}99`,
        }}
      />
    </div>
  );
};
