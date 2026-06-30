import { Composition, staticFile } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { SpaceRecap, type SpaceRecapProps } from "./compositions/SpaceRecap";
import type { Profiles, Transcript } from "./data";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

async function fetchJson<T>(url: string, hint: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load ${url} (${resp.status}). ${hint}`);
  }
  return (await resp.json()) as T;
}

const calculateMetadata: CalculateMetadataFunction<SpaceRecapProps> = async ({ props }) => {
  // Data files are symlinked into public/data/ so the same fetch works in
  // both Studio (browser) and render (Node).
  const audioSrc = props.audioSrc || staticFile("audio.ogg");

  const [duration, transcript, profiles] = await Promise.all([
    getAudioDurationInSeconds(audioSrc),
    fetchJson<Transcript>(
      staticFile("data/transcript.json"),
      "Run `npm run transcribe` first.",
    ),
    fetchJson<Profiles>(
      staticFile("data/profiles.json"),
      "Fill data/intros.json then run `npm run pfps`.",
    ),
  ]);

  return {
    durationInFrames: Math.ceil(duration * FPS),
    props: { ...props, audioSrc, transcript, profiles },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SpaceRecap"
      component={SpaceRecap}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={FPS * 60}
      calculateMetadata={calculateMetadata}
      defaultProps={{
        audioSrc: staticFile("audio.ogg"),
        title: "AMA with The Farcaster Intern",
        subtitle: "ZABAL GAMEZ",
        // calculateMetadata fills these in before render — empties are placeholders.
        transcript: {
          metadata: { duration: 60, channels: 1 },
          results: { channels: [{ alternatives: [{ transcript: "", words: [] }] }], utterances: [] },
        },
        profiles: {
          host: { username: "host", fid: 0, display_name: "Host", pfp_path: "/default-avatar.png" },
          guests: [],
        },
      }}
    />
  );
};
