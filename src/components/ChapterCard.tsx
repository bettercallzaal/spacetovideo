import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

// A small chapter-title lower-third that shows the current segment label. Static-per-frame:
// picks the active chapter by time, a cheap opacity fade on entry (interpolate, not a spring).
export const ChapterCard: React.FC<{ chapters?: { t: number; label: string }[] }> = ({ chapters }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!chapters?.length) return null;
  const sec = frame / fps;

  let active: { t: number; label: string } | null = null;
  for (const c of chapters) {
    if (c.t <= sec) active = c;
    else break;
  }
  if (!active || !active.label) return null;

  const into = sec - active.t;
  const opacity = interpolate(into, [0, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        top: 108,
        left: 40,
        opacity,
        background: "rgba(6, 6, 18, 0.72)",
        border: `1px solid ${theme.orange}`,
        borderRadius: 8,
        padding: "6px 14px",
        color: theme.orange,
        fontSize: 22,
        fontFamily: theme.fontSans,
        letterSpacing: 1,
        maxWidth: 620,
      }}
    >
      {active.label}
    </div>
  );
};
