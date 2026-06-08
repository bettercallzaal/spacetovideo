import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Utterance, Word } from "../data";
import { theme } from "../theme";

type Props = {
  utterances: Utterance[];
};

const MAX_WORDS = 22; // rolling window — keeps caption box from overflowing
const HOLD_AFTER_END_SEC = 1.5;

function findActiveUtterance(utterances: Utterance[], t: number): Utterance | null {
  // Binary search for the latest utterance whose start <= t.
  let lo = 0;
  let hi = utterances.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (utterances[mid].start <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const u = utterances[best];
  if (t <= u.end + HOLD_AFTER_END_SEC) return u;
  return null;
}

export const CaptionTrack: React.FC<Props> = ({ utterances }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Recompute every frame — cheap, and quantizing the deps was producing
  // visible stutter on render playback at 30fps.
  const spoken = useMemo(() => {
    const u = findActiveUtterance(utterances, t);
    if (!u) return [] as Word[];
    const all = u.words ?? [];
    return all.filter((w) => w.start <= t).slice(-MAX_WORDS);
  }, [t, utterances]);

  const visible = spoken.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 80,
        right: 80,
        minHeight: 160,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 40px",
        background: visible ? "rgba(15,15,35,0.78)" : "transparent",
        borderRadius: 24,
        border: visible ? `1px solid ${theme.border}` : "1px solid transparent",
        backdropFilter: visible ? "blur(8px)" : undefined,
        fontFamily: theme.fontSans,
        transition: "opacity 200ms ease",
        opacity: visible ? 1 : 0,
      }}
    >
      <p
        style={{
          margin: 0,
          color: theme.textOnDark,
          fontSize: 44,
          lineHeight: 1.25,
          fontWeight: 500,
          textAlign: "center",
          letterSpacing: -0.3,
        }}
      >
        {spoken.map((w, i) => {
          const text = w.punctuated_word ?? w.word;
          // Soft fade-in on each new word — covers ~80ms after start time.
          const age = Math.max(0, t - w.start);
          const fade = Math.min(1, age / 0.08);
          return (
            // Key by start-time only so words keep identity when the rolling
            // window shifts (slice(-MAX_WORDS) drops oldest); index-based keys
            // were causing every visible span to remount on each shift.
            <span key={`${w.start}-${w.word}`} style={{ opacity: 0.35 + 0.65 * fade }}>
              {i > 0 ? " " : ""}
              {text}
            </span>
          );
        })}
      </p>
    </div>
  );
};
