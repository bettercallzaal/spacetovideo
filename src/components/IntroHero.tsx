import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Profile } from "../data";
import { theme } from "../theme";
import { PFPAvatar } from "./PFPAvatar";

type Props = {
  host: Profile;
  visible: boolean;
};

/**
 * Fills the left zone with a host-led hero whenever no guest card is active —
 * the empty-stage feeling between intros otherwise reads as a render glitch.
 */
export const IntroHero: React.FC<Props> = ({ host, visible }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slow ring pulse so the dead-time card has visible motion of its own.
  const t = frame / fps;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
  const ringGlow = interpolate(pulse, [0, 1], [40, 90]);

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
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms ease",
        fontFamily: theme.fontSans,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: 12,
          borderRadius: "50%",
          boxShadow: `0 0 ${ringGlow}px ${theme.orange}66, 0 0 24px ${theme.orange}99`,
          border: `4px solid ${theme.orange}`,
          background: theme.surface,
        }}
      >
        <PFPAvatar src={host.pfp_path} size={320} fallbackInitial={host.display_name} />
      </div>
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            color: theme.textOnDarkTertiary,
            fontSize: 18,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Hosted by
        </div>
        <div
          style={{
            color: theme.textOnDark,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          {host.display_name}
        </div>
        <div
          style={{
            color: theme.orange,
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: 0.5,
          }}
        >
          @{host.username}
        </div>
      </div>
    </div>
  );
};
