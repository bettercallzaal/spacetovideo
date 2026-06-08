import { AbsoluteFill, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import type { Profiles, Transcript } from "../data";
import { theme } from "../theme";
import { GuestCard } from "../components/GuestCard";
import { HostBadge } from "../components/HostBadge";
import { IntroHero } from "../components/IntroHero";
import { Waveform } from "../components/Waveform";
import { CaptionTrack } from "../components/CaptionTrack";
import { TitleCard } from "../components/TitleCard";
import { TimeBadge } from "../components/TimeBadge";
import { useActiveGuest } from "../hooks/useActiveGuest";

export type SpaceRecapProps = {
  audioSrc: string;
  title: string;
  subtitle: string;
  transcript: Transcript;
  profiles: Profiles;
};

export const SpaceRecap: React.FC<SpaceRecapProps> = ({
  audioSrc,
  title,
  subtitle,
  transcript,
  profiles,
}) => {
  const { width, height } = useVideoConfig();
  const utterances = transcript.results.utterances ?? [];
  const totalSec = transcript.metadata.duration;

  const { guest, changedAtFrame } = useActiveGuest(profiles.guests);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 30% 20%, ${theme.surface} 0%, ${theme.navy} 55%, #050309 100%)`,
        fontFamily: theme.fontSans,
      }}
    >
      <Audio src={audioSrc} />

      {/* Top-left brand label */}
      <TitleCard title={title} subtitle={subtitle} />

      {/* Top-right host badge — always on */}
      <HostBadge host={profiles.host} />

      {/* Left zone: host hero shows during dead time, guest card on top when active */}
      <IntroHero host={profiles.host} visible={!guest} />
      <GuestCard guest={guest} changedAtFrame={changedAtFrame} />

      {/* Right zone: FFT waveform — gives motion when no guest is active */}
      <Waveform
        audioSrc={audioSrc}
        x={width * 0.55}
        y={220}
        width={width * 0.4}
        height={520}
      />

      {/* Lower-third caption */}
      <CaptionTrack utterances={utterances} />

      {/* Bottom-right time badge */}
      <TimeBadge totalSec={totalSec} />

      {/* Footer caveat */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 40,
          color: theme.textOnDarkTertiary,
          fontSize: 14,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        juke.audio
      </div>
    </AbsoluteFill>
  );
};

