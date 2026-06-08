import { useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

const formatHMS = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const TimeBadge: React.FC<{ totalSec: number }> = ({ totalSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame / fps;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 32,
        right: 40,
        padding: "10px 16px",
        background: "rgba(26,26,46,0.7)",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        backdropFilter: "blur(12px)",
        color: theme.textOnDarkSecondary,
        fontSize: 18,
        fontFamily: theme.fontSans,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: 0.5,
      }}
    >
      {formatHMS(elapsed)} / {formatHMS(totalSec)}
    </div>
  );
};
