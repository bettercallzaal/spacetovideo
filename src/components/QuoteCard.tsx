import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

// A pull-quote card that flashes for a few seconds at the start of each highlight window.
// Static-per-frame: shows only inside [start, start+DURATION]; cheap opacity fade in/out.
const DURATION = 5; // seconds a quote stays up

export const QuoteCard: React.FC<{ quotes?: { start: number; end: number; text: string }[] }> = ({ quotes }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (!quotes?.length) return null;
  const sec = frame / fps;

  const q = quotes.find((x) => sec >= x.start && sec <= x.start + DURATION);
  if (!q || !q.text) return null;

  const into = sec - q.start;
  const opacity = interpolate(into, [0, 0.4, DURATION - 0.5, DURATION], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: width * 0.08,
        width: width * 0.84,
        textAlign: "center",
        opacity,
        color: theme.textOnDark,
        fontSize: 44,
        lineHeight: 1.25,
        fontWeight: 700,
        fontFamily: theme.fontSans,
        textShadow: "0 2px 16px rgba(0,0,0,0.85)",
      }}
    >
      &ldquo;{q.text}&rdquo;
    </div>
  );
};
