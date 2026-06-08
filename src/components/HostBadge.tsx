import type { Profile } from "../data";
import { theme } from "../theme";
import { PFPAvatar } from "./PFPAvatar";

export const HostBadge: React.FC<{ host: Profile }> = ({ host }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        right: 40,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 18px 12px 12px",
        background: "rgba(26,26,46,0.7)",
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        backdropFilter: "blur(12px)",
        fontFamily: theme.fontSans,
      }}
    >
      <PFPAvatar src={host.pfp_path} size={56} fallbackInitial={host.display_name} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span style={{ color: theme.textOnDarkTertiary, fontSize: 14, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>
          Host
        </span>
        <span style={{ color: theme.textOnDark, fontSize: 22, fontWeight: 600 }}>
          @{host.username}
        </span>
      </div>
    </div>
  );
};
