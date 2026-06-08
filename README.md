# Juke Remotion Recap

Offline pipeline that turns a long-form audio recording (like a 2-hour roving-host space) into a 1920×1080 recap video with per-guest PFPs, sentence-rolling captions, and an FFT waveform.

## What this is for

A single-host walkaround: one mic, host asks "who are you?" to each guest, captures intros. This pipeline:

1. Transcribes the full audio with Deepgram Nova-3 (diarization + utterances).
2. Detects host intro events ("who are you?", "what's your name?") and builds guest segments around them.
3. Lets you (the human) listen to a short clip per intro and fill in `@username`.
4. Looks up each filled-in username on Neynar, downloads PFPs, and renders the video.

### Acknowledged limits

- Guests not formally introduced are missed.
- Off-mic / noisy intros are missed.
- Deepgram mishears unusual names — manual review fixes this.
- Multiple people in one segment may collapse to one intro.
- Spoken names rarely match @-handles 1:1; the human-in-the-loop step exists for a reason.

The closing card in the rendered video acknowledges this with: "Some guests not pictured — apologies for any we missed."

## Setup

```bash
npm install

# Copy the example env file and fill in your keys
cp .env.example .env
# DEEPGRAM_API_KEY  → https://console.deepgram.com
# NEYNAR_API_KEY    → https://neynar.com
# HOST_USERNAME     → Farcaster handle of the space host (no @)

# Drop the audio file in
cp ~/Downloads/your-recording.ogg public/audio.ogg
```

Requires `ffmpeg` on PATH (for slicing speaker sample clips).

## Pipeline

```bash
npm run transcribe      # ~5–10 min for 2 hr audio. Writes data/transcript.json.
npm run intros          # Writes data/intros.json + data/samples/intro_N.mp3 clips.
# --- listen to clips, edit data/intros.json, fill in `username` per intro ---
npm run pfps            # Writes data/profiles.json + public/pfps/*.
npm run waveform        # Required before rendering long audio (>~15 min). Precomputes FFT data.
```

### Optional cleanup steps

```bash
npm run fixup           # Fix known Deepgram mishears in transcript.json (edit rules in scripts/4-fixup-transcript.ts).
npm run suggest         # Search Neynar for names found in the transcript; writes data/suggestions.json.
npm run review          # Flag filled handles with >1 year of inactivity (likely wrong match).
tsx scripts/find-user.ts <query>   # Quick Neynar search for a specific person.
```

## Preview & render

```bash
npm start                                                    # Remotion Studio at http://localhost:3000
npm run render SpaceRecap out/test.mp4 -- --frames=0-5400    # 3-min smoke test
npm run render SpaceRecap out/space-recap.mp4                # full render
```

A 2-hour 1920×1080 @ 30fps render takes 3–6 hours on M-series Macs. Speed knobs:

- 24 fps (`--fps=24`) → ~20% faster
- 1280×720 (`--scale=0.667`) → significantly faster

## Layout

```
src/
  compositions/SpaceRecap.tsx     # main 1920×1080 comp
  components/                     # GuestCard, HostBadge, Waveform, CaptionTrack, ...
  hooks/useActiveGuest.ts         # frame → current guest segment
scripts/
  1-transcribe.ts
  2-detect-intros.ts
  3-resolve-pfps.ts
  lib/                            # deepgram, neynar, ffmpeg, intro-patterns
data/                             # gitignored — transcript, intros, profiles, samples
public/                           # gitignored — audio.ogg, pfps/, default-avatar.png
out/                              # gitignored — rendered videos
```
