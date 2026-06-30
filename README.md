# spacetovideo

Turn a long-form audio recording into a shareable recap video with automatic speaker detection, profile cards, word-level captions, and a waveform.

`spacetovideo` is a video synthesis pipeline for podcast, AMA, and Farcaster Space recordings. Drop an audio file, confirm the speakers, and render a 1920x1080 video with:

- Per-speaker profile cards with avatars and names
- Word-level animated karaoke captions (lower third)
- FFT waveform visualization (right side)
- Title card, host badge, time counter, and progress bar
- Optional intro/outro bookends

Built on Remotion (React video), Deepgram Nova-3 (transcription + diarization), and Neynar (Farcaster identity resolution). Runs on Node.js; no cloud, no subscriptions beyond the APIs.

## What it makes

A 1920x1080 @ 30fps video recap, typically 30-90 minutes long. The Remotion composition (`SpaceRecap`) combines:

- `TitleCard` - top-left "Space name" branding
- `HostBadge` - top-right host avatar and name
- `IntroHero` - left-side host card during quiet moments
- `GuestCard` - left-side guest avatar and name, updates per diarized speaker segment
- `Waveform` - right-side animated FFT waveform (precomputed; drives visual interest during low-speech moments)
- `CaptionTrack` - lower third: word-by-word captions with speaker-color underlines
- `TimeBadge` - bottom-right elapsed time
- `ProgressBar` - bottom: playhead showing video progress
- Footer caveat: "Some guests not pictured - apologies for any we missed"

See [`src/components/`](src/components/) for individual component code.

## 60-second quickstart

```bash
# 1. Install
npm install

# 2. Set up env (keys from https://console.deepgram.com and https://neynar.com)
cp .env.example .env
# Edit .env: DEEPGRAM_API_KEY, NEYNAR_API_KEY, HOST_USERNAME (your Farcaster handle)

# 3. Drop audio in
cp ~/Downloads/recording.ogg public/audio.ogg

# 4. Transcribe + detect speakers
npm run transcribe                    # 5-10 min for 2hr audio
npm run suggest-speakers              # Auto-suggest speaker handles
# (edit data/speaker-map.json if needed)

# 5. Resolve pfps + render
npm run pfps                          # Download avatars
npm run waveform                      # Precompute FFT (required for long audio)
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000

# 6. Done
out/space-recap.mp4
```

For **roving-host walkarounds** (host walks around saying "who are you?" to each guest), use the intro-detection path instead (see [Pipeline](#pipeline)).

## Requirements

- **Node.js** 20+
- **ffmpeg + ffprobe** on PATH (transcoding, audio slicing)
- **Deepgram API key** - https://console.deepgram.com (Nova-3 transcription model, ~$0.01/min audio)
- **Neynar API key** - https://neynar.com (Farcaster user lookup)
- **Farcaster handle** - your own or the space host's handle (for Neynar lookups)

Install ffmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt-get install ffmpeg

# or download from https://ffmpeg.org/download.html
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your keys
cp .env.example .env
# DEEPGRAM_API_KEY  → https://console.deepgram.com
# NEYNAR_API_KEY    → https://neynar.com
# HOST_USERNAME     → Farcaster handle of the space host (no @ symbol)

# 3. Place the audio file
cp ~/Downloads/your-recording.ogg public/audio.ogg
```

Supported audio formats: `.ogg`, `.opus`, `.wav`, `.mp3`, `.m4a`.

## Pipeline

Complete walkthrough: see [`docs/PIPELINE.md`](docs/PIPELINE.md).

Quick reference:

### Hosted Spaces / AMAs (audience speakers, named by host)

```bash
npm run transcribe                    # Deepgram transcription + diarization
npm run suggest-speakers              # Auto-mine speaker names from host's intros
# Check/edit data/speaker-map.json
npm run pfps                          # Resolve handles + download avatars
npm run waveform                      # Precompute FFT waveform
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
```

### Roving-host walkarounds (host asks each guest "who are you?")

```bash
npm run transcribe                    # Deepgram transcription + diarization
npm run intros                        # Detect intro prompts, slice guest response clips
# Listen to data/samples/intro_N.mp3, fill data/intros.json with @handles
npm run pfps                          # Resolve handles + download avatars
npm run waveform                      # Precompute FFT waveform
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
```

## Local dashboard

A browser-based UI at `localhost:4747` guides you through the pipeline (speaker confirmation, rendering, optional intro/outro splicing):

```bash
node dashboard/server.mjs
# Open http://localhost:4747 in your browser
```

The dashboard:

1. **Confirm speakers** - listen to audio samples, fill in Farcaster handles
2. **Render** - runs the full Remotion render, shows progress
3. **Add intro + outro** - optional: splice branded bookends onto the recap

See [`docs/DASHBOARD.md`](docs/DASHBOARD.md) for details.

## Preview in Remotion Studio

```bash
npm start   # Opens http://localhost:3000
```

In the Studio, you can preview the `SpaceRecap` composition, adjust timing, and tweak component behavior before rendering.

## Full render

A 2-hour 1920x1080 @ 30fps render takes 3-6 hours on modern hardware (M1/M2 Mac, high-core Linux machine). The render is stable; see [Troubleshooting](#troubleshooting) if timeouts occur.

```bash
# Full render (adjust concurrency + timeout if needed)
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000

# Smoke test (3 min)
npm run render SpaceRecap out/test.mp4 -- --frames=0-5400 --concurrency=2

# Faster render (sacrifice FPS or resolution)
npm run render SpaceRecap out/space-recap.mp4 -- --fps=24 --concurrency=2 --timeout=300000
npm run render SpaceRecap out/space-recap.mp4 -- --scale=0.667 --concurrency=2 --timeout=300000
```

## Customizing

See [`docs/CUSTOMIZING.md`](docs/CUSTOMIZING.md) for:

- Reskinning colors, fonts, and layout via `src/theme.ts`
- Changing the title, subtitle, and footer text
- Swapping intro/outro templates
- Adjusting caption size, guest card animation, waveform height

To recap: all visual branding lives in `src/theme.ts` (colors), `src/compositions/SpaceRecap.tsx` (layout), and individual component files.

## Troubleshooting

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) for:

- Render timeouts under load
- Per-frame animation performance (springs/easing)
- Detached render survival (terminal disconnect)
- Farcaster Spaces roster limitations (no API)
- PFP fallback chain (unavatar.io for seadn.io, etc.)
- Speaker detection accuracy

## Optional CLI tools

```bash
npm run fixup               # Correct known Deepgram mishears (edit rules in scripts/4-fixup-transcript.ts)
npm run suggest             # Search Neynar for names found in the transcript
npm run review              # Flag handles with >1 year of inactivity
npm run sync                # Copy resolved data to public/
tsx scripts/find-user.ts <name>   # Quick Neynar search
```

## Architecture

```
src/
  compositions/SpaceRecap.tsx     # main 1920x1080 Remotion composition
  components/                     # GuestCard, HostBadge, Waveform, CaptionTrack, ...
  hooks/useActiveGuest.ts         # frame -> current guest segment
  theme.ts                        # colors, fonts, spacing (edit here to rebrand)

scripts/
  1-transcribe.ts                 # Deepgram Nova-3 transcription + diarization
  2-detect-intros.ts              # roving-host path: detect "who are you?" prompts
  3-resolve-pfps.ts               # Neynar handle lookup + pfp download
  auto-suggest-speakers.ts        # hosted-Space path: mine host intros for names
  build-speaker-intros.ts         # hosted-Space path: turn speaker_ids into guest segments
  7-precompute-waveform.ts        # FFT waveform data (required for long renders)
  lib/                            # helpers: deepgram, neynar, ffmpeg, intro-patterns

dashboard/
  server.mjs                      # browser UI on localhost:4747
  index.html                      # dashboard frontend

data/                             # gitignored; populated by scripts
  transcript.json                 # Deepgram output
  intros.json / speaker-map.json  # speaker identity mapping (human-edited or auto-detected)
  profiles.json                   # resolved Farcaster profiles + pfp paths
  waveform.json                   # precomputed FFT (required for long audio)

public/                           # gitignored; static assets + audio
  audio.ogg                       # input audio file
  pfps/                           # downloaded profile pictures
  default-avatar.png

out/                              # gitignored; rendered videos
  space-recap.mp4                 # final render
```

## API endpoints (edge functions)

The dashboard and CLI use these REST endpoints (in `dashboard/server.mjs` and scripts):

- `GET /api/speakers` - list diarized speakers with samples
- `POST /api/speakers` - confirm speaker handles + start PFP resolution
- `GET /api/speakers/progress` - check resolution + build progress
- `POST /api/render` - start Remotion render
- `GET /api/render/progress` - check render progress
- `POST /api/splice` - start intro+outro concat
- `GET /api/splice/progress` - check splice progress

See `dashboard/server.mjs` for implementation.

## Examples

All examples assume a Farcaster Space recording. Adapt as needed for podcasts, AMAs, or any long-form audio.

### ZABAL Gamez workshop recap

```bash
# Input: 90-min Space with 8 guest speakers
HOST_USERNAME=zaal npm run transcribe
npm run suggest-speakers
# edit data/speaker-map.json
npm run pfps
npm run waveform
npm run render SpaceRecap out/zabal-workshop-1.mp4 -- --concurrency=2 --timeout=300000
# Result: 90-min recap video with 8 guest cards
```

### Podcast episode

```bash
# Input: recorded podcast with 3 permanent hosts
cp podcast-episode-42.mp3 public/audio.ogg
HOST_USERNAME=host1 npm run transcribe
# (adjust scripts/build-speaker-intros.ts to map speakers to the 3 hosts)
tsx scripts/build-speaker-intros.ts
npm run pfps
npm run waveform
npm run render SpaceRecap out/podcast-42.mp4 -- --concurrency=2 --timeout=300000
```

## Credits

Fork of [99darwin/juke-space-recap](https://github.com/99darwin/juke-space-recap), extended with:
- Dashboard UI for speaker confirmation + render progress
- Auto-suggest speakers (hosted Space path)
- Build-speaker-intros (alternative to roving-host intro detection)
- Waveform precomputation
- Customizing guide

## License

MIT. See LICENSE file.

## Contributing

Issues, PRs, and forks welcome. Before pushing large changes, open an issue to discuss.

## FAQ

**Q: Can I use this for non-Farcaster audio?**
Yes. Swap `NEYNAR_API_KEY` for any identity API (Discord, Twitter, etc.). The transcription + diarization + render pipeline is generic.

**Q: How long does a render take?**
2-6 hours for 2-hour 1920x1080 @ 30fps, depending on machine load. See Troubleshooting for tuning.

**Q: What if I have no guest intros (solo podcast)?**
The `IntroHero` and `HostBadge` components stay on-screen. `GuestCard` won't appear. The waveform and captions drive visual interest.

**Q: Can I run on Remotion Lambda?**
Yes. The render command supports `--key=<lambda-key>`. See Remotion docs.

**Q: Can I splice multiple renders together?**
Yes. Manually run `ffmpeg concat` or edit `dashboard/server.mjs` to support it.

**Q: Why no test suite?**
The pipeline is primarily I/O (API calls, file writes). Tests would be async integration tests, which are slower than just running the real pipeline. Validation (`node scripts/validate.mjs`) checks JSON syntax + Deepgram response integrity.
