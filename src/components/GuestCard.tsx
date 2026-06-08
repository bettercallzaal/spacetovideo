import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Guest } from "../data";
import { theme } from "../theme";
import { PFPAvatar } from "./PFPAvatar";

const SLIDE_FRAMES = 18;

type Props = {
  guest: Guest | null;
  /** Frame at which the active guest changed — used to animate the slide-in. */
  changedAtFrame: number;
};

export const GuestCard: React.FC<Props> = ({ guest, changedAtFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sinceChange = frame - changedAtFrame;

  const enter = spring({
    fps,
    frame: sinceChange,
    config: { damping: 18, stiffness: 120 },
  });

  const opacity = guest ? interpolate(enter, [0, 1], [0, 1]) : 0;
  const translate = guest ? interpolate(enter, [0, 1], [-60, 0]) : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 200,
        left: 80,
        width: 880,
        height: 560,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        opacity,
        transform: `translateX(${translate}px)`,
        fontFamily: theme.fontSans,
      }}
    >
      {guest && (
        <>
          <div
            style={{
              padding: 12,
              borderRadius: "50%",
              boxShadow: `0 0 80px ${theme.orange}66, 0 0 24px ${theme.orange}99`,
              border: `4px solid ${theme.orange}`,
              background: theme.surface,
            }}
          >
            <PFPAvatar src={guest.pfp_path} size={320} fallbackInitial={guest.display_name} />
          </div>
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                color: theme.textOnDark,
                fontSize: 56,
                fontWeight: 700,
                letterSpacing: -0.5,
                lineHeight: 1.1,
              }}
            >
              {guest.display_name}
            </div>
            <div
              style={{
                color: theme.orange,
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: 0.5,
              }}
            >
              @{guest.username}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
