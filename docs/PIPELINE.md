# The Spacetovideo Pipeline

Complete walkthrough of the transcription-to-render process. Two paths depending on your Space format.

## Overview

The pipeline takes audio -> transcription -> speaker identification -> profile resolution -> FFT precompute -> render.

**Path A: Hosted Spaces / AMAs** (audience members speak, host introduces/names them)
- Transcribe
- Auto-suggest speakers (optional but recommended)
- Manual speaker mapping (if needed)
- Resolve profiles + download avatars
- Precompute waveform
- Render

**Path B: Roving-host walkarounds** (host walks around saying "who are you?" to each guest)
- Transcribe
- Detect intro prompts
- Listen to clips, fill in handles
- Resolve profiles + download avatars
- Precompute waveform
- Render

## Step 0: Prepare audio

Place your audio file in `public/audio.ogg` (or set `AUDIO_PATH` env).

Supported formats: `.ogg`, `.opus`, `.wav`, `.mp3`, `.m4a`.

```bash
cp ~/Downloads/recording.ogg public/audio.ogg

# Or specify a different path:
export AUDIO_PATH=/path/to/recording.wav
npm run transcribe
```

ffmpeg will auto-detect the format from the file extension. If transcoding is needed (e.g., `.m4a` -> `.ogg`), you can pre-process:

```bash
ffmpeg -i original.m4a -c:a libopus -b:a 128k public/audio.ogg
```

## Step 1: Transcribe with Deepgram

Sends the full audio to Deepgram Nova-3 for transcription + automatic speaker diarization (who spoke when). Outputs `data/transcript.json`.

```bash
npm run transcribe
```

What it does:

1. Reads `public/audio.ogg` (or `AUDIO_PATH`)
2. Splits audio into chunks if needed (Deepgram has a ~1hr async limit)
3. Submits with diarization + utterances enabled
4. Polls for completion (5-10 min for 2hr audio)
5. Writes `data/transcript.json` with:
   - Full transcript text
   - Word-level timing + speaker_id for each word
   - Utterance-level boundaries (sentence-like chunks per speaker)
   - Detected language + confidence

The result is an object like:

```json
{
  "metadata": { "duration": 3600.0 },
  "results": {
    "utterances": [
      { "start": 0.5, "end": 5.2, "transcript": "...", "speaker": 1 },
      { "start": 5.3, "end": 12.1, "transcript": "...", "speaker": 2 }
    ],
    "channels": [
      {
        "alternatives": [
          {
            "words": [
              { "word": "hello", "start": 0.5, "end": 1.0, "speaker": 1 },
              { "word": "friend", "start": 1.0, "end": 1.5, "speaker": 1 }
            ]
          }
        ]
      }
    ]
  }
}
```

Keyterms: You can pass Deepgram domain-specific keywords to boost accuracy:

```bash
DEEPGRAM_KEYTERMS="Farcaster,Warpcast,Neynar,Zora" npm run transcribe
```

### Troubleshooting transcription

**"Deepgram mishears unusual names"** - Expected. The manual speaker confirmation step fixes this.

**"Utterances are blank"** - Re-run with `utterances=true` in `scripts/1-transcribe.ts` (default is true). Check your API key.

**"Large audio times out"** - Deepgram has limits on async jobs. For >6hr audio, you may need to split manually or contact Deepgram support.

## Step 2a: Path A - Auto-suggest speakers (Hosted Spaces)

For hosted Spaces where a host introduces audience members, auto-mine speaker names from:

1. Host's hand-off lines: "what up Benny", "welcome Alice", "go ahead X"
2. Guest self-intros: "I'm X", "This is Y", "Name's Z"

Searches Neynar for each candidate name and suggests handles.

```bash
npm run suggest-speakers
```

Outputs:

- `data/speaker-suggestions.json` - all candidates per speaker_id
- Console printout of a pre-filled `SPEAKER_TO_USERNAME` block to paste into `scripts/build-speaker-intros.ts`

Example output:

```
[auto-suggest] Speaker 2 (4m talk, starts at 1:23):
  Candidates: ["Benny", "BennyJ", "bennyj504"]
  Top match: bennyj504 (89% confidence, last active 3 days ago)

// Paste this into scripts/build-speaker-intros.ts:
let SPEAKER_TO_USERNAME: Record<number, string> = {
  1: "zaal",      // host
  2: "bennyj504",
  3: "imanafrikah",
};
```

Review the suggestions, edit `data/speaker-map.json` (or `scripts/build-speaker-intros.ts`), and move on.

If suggestions are poor (e.g., mining "Pizza" from "Let's grab pizza"), manually fill in `data/speaker-map.json`:

```json
{
  "1": "zaal",
  "2": "bennyj504",
  "3": "imanafrikah"
}
```

Then run step 2b (build-speaker-intros).

## Step 2b: Path A - Build speaker intros (Hosted Spaces)

Converts diarized speaker_ids into guest segments for the render. Merges consecutive same-speaker utterances, pads short bursts, and outputs `data/intros.json`.

This step is automatic once you've filled in the speaker mapping:

```bash
# Either:
# 1) fill data/speaker-map.json
# 2) fill SPEAKER_TO_USERNAME in scripts/build-speaker-intros.ts
# Then:
tsx scripts/build-speaker-intros.ts
```

The script reads `data/transcript.json` and the speaker mapping, then outputs `data/intros.json`:

```json
[
  {
    "id": 0,
    "start_ms": 500,
    "end_ms": 185000,
    "host_speaker_id": 1,
    "host_prompt": "",
    "candidate_name": null,
    "candidate_raw": "",
    "context_snippet": "",
    "sample_audio": "",
    "username": "bennyj504",
    "display_name": ""
  }
]
```

Key fields:

- `start_ms`, `end_ms` - when this speaker appears in the render
- `username` - Farcaster handle (used in step 3 to resolve profiles)
- `display_name` - optional label (shown instead of @handle if set, e.g., "Music by Iman")
- `host_speaker_id` - ignored for rendering (legacy from Path B)

## Step 2b: Path B - Detect intro prompts (Roving-host walkarounds)

For roving-host walkarounds where the host repeatedly asks "who are you?", detect:

1. Host intro prompts ("who are you?", "what's your name?", "how do you spell that?")
2. Guest response utterances (next 1-3 non-host speaker_ids)
3. Extract candidate names ("I'm Benny", "It's Alice")
4. Slice 15-second audio samples of guest responses for human review

```bash
npm run intros
```

Outputs:

- `data/intros.json` - intro segments with empty `username` fields (you fill these in)
- `data/samples/intro_0.mp3`, `intro_1.mp3`, ... - guest response clips for review

Example `intros.json`:

```json
[
  {
    "id": 0,
    "start_ms": 5000,
    "end_ms": 90000,
    "host_speaker_id": 1,
    "host_prompt": "Hey, who are you?",
    "candidate_name": "Benny",
    "candidate_raw": "I'm Benny, I'm from Ethereum",
    "context_snippet": "[1] Hey, who are you?\n[2] I'm Benny, I'm from Ethereum",
    "sample_audio": "data/samples/intro_0.mp3",
    "username": "",
    "display_name": ""
  }
]
```

### Manual review

Listen to each clip in `data/samples/intro_N.mp3`. For each one you recognize, fill in the Farcaster `@handle` in `data/intros.json`:

```json
{
  "username": "bennyj504"    // <- fill this in
}
```

Leave `username` empty (or "Guest") for guests you don't recognize - they'll render with the default avatar.

If a candidate name is wrong (Deepgram mishear), you can correct `candidate_name` or set `display_name` to a label ("Jellyfish", "Duck", etc.) that the render will use instead of the @handle.

### Roving-host detection warnings

The script warns if it detects a hosted Space / AMA instead of a roving-host walkaround:

```
WARNING: only 2 host intro prompt(s) across 8 speakers.
  This looks like a hosted Space / AMA, not a roving-host walkaround.
  Intro detection will miss most or all guests, and the render will sit on the host card.
  Use the hosted-Space path instead: ...
```

This is intentional - intro detection is unreliable for hosted Spaces. Use Path A (auto-suggest + build-speaker-intros) instead.

## Step 3: Resolve profiles + download avatars

Takes filled-in usernames from `data/intros.json` and:

1. Looks up each handle on Neynar
2. Downloads their profile picture (pfp)
3. Falls back to unavatar.io if the primary image host refuses (e.g., seadn.io for NFT avatars)
4. Outputs `data/profiles.json` + pfp files in `public/pfps/`

```bash
npm run pfps
```

Requires `NEYNAR_API_KEY` env + `HOST_USERNAME` (for the host's profile, which always renders).

Example output `data/profiles.json`:

```json
{
  "host": {
    "username": "zaal",
    "fid": 2,
    "display_name": "Zaal",
    "pfp_path": "/pfps/zaal.png"
  },
  "guests": [
    {
      "username": "bennyj504",
      "fid": 1234,
      "display_name": "Benny J",
      "pfp_path": "/pfps/bennyj504.jpeg",
      "intro_id": 0,
      "start_ms": 5000,
      "end_ms": 90000
    }
  ]
}
```

PFP fallback chain:

1. Try Neynar's pfp_url
2. Try unavatar.io/farcaster/{handle} (Farcaster-only proxy, works around image host blocks)
3. Try unavatar.io/x/{handle} (X handle, if it matches FC handle)
4. Fall back to default-avatar.png (1x1 transparent pixel)

### Troubleshooting pfp resolution

**"@handle not found on Neynar"** - User doesn't exist or Neynar is down. Falls back to default avatar. Double-check the handle spelling.

**"Primary pfp failed, recovered via unavatar"** - The user's primary pfp host (e.g., seadn.io) refused access. The fallback succeeded. This is expected for NFT avatars.

## Step 4: Precompute FFT waveform

The Waveform component renders a real-time FFT (frequency spectrum) visualization. For long audio (>15 min), precomputing the FFT data as JSON saves render time and prevents timeouts.

```bash
npm run waveform
```

Outputs `data/waveform.json`:

```json
{
  "fps": 30,
  "frames": [
    [255, 128, 64, 32, ...],  // frame 0: FFT bins
    [254, 127, 63, 31, ...],  // frame 1
    ...
  ]
}
```

**This is required for renders >~15 min.** Without it, the Waveform component will compute FFT per-frame, causing severe slowdowns and timeouts.

For short audio (<5 min), this step is optional.

## Step 5: Render

Use the Remotion CLI to render the `SpaceRecap` composition to MP4.

```bash
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
```

Flags:

- `--concurrency=2` - number of parallel Chromium instances. Default is CPU count. Use 2-4 for stability; high concurrency = OOM on sustained renders.
- `--timeout=300000` - 5-minute timeout per frame. Default is 30s. Increase this for slow machines.
- `--fps=24` or `--fps=30` - frames per second (default 30). 24 fps is ~20% faster.
- `--scale=0.667` - render at 66.7% resolution (1280x720), ~4x faster than 1920x1080.

For a 2-hour 1920x1080 @ 30fps render:

- Rendering phase: 2-4 hours (depends on machine + load)
- Encoding phase: 30-60 min (H264 encode to MP4)
- Total: 3-6 hours

See [Troubleshooting](TROUBLESHOOTING.md) for timeout handling.

### Preview in Remotion Studio

Before a full render, preview in the local Studio:

```bash
npm start   # http://localhost:3000
```

In the Studio, you can scrub through frames, adjust composition props, and check timing.

### Smoke test

Test a 3-minute render to verify configuration:

```bash
npm run render SpaceRecap out/test.mp4 -- --frames=0-5400 --concurrency=2
```

### Detached render

For long renders, run detached (survive terminal close):

```bash
nohup npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000 > render.log 2>&1 &
disown
# Terminal can close; render continues. Check render.log for progress.
tail -f render.log
```

Do not kill the process until the MP4 is fully encoded (final "Wrote out/space-recap.mp4").

## Step 6: Optional - Add intro + outro

Use the dashboard or ffmpeg to splice branded intro/outro templates:

```bash
node dashboard/server.mjs
# Open http://localhost:4747, click "Add bookends"
```

Or manually with ffmpeg:

```bash
ffmpeg -i intro.mp4 -i out/space-recap.mp4 -i outro.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -b:a 192k -movflags +faststart \
  out/space-recap-bookended.mp4
```

## Data files reference

All generated during the pipeline:

| File | Purpose | Edited by |
|------|---------|-----------|
| `data/transcript.json` | Full Deepgram output (words + utterances + diarization) | Deepgram API |
| `data/intros.json` or `speaker-map.json` | Speaker -> Farcaster handle mapping | You (manual review) |
| `data/profiles.json` | Resolved profiles (FID, display name, pfp path) | Step 3 (auto) |
| `data/waveform.json` | Precomputed FFT frames (required for long audio) | Step 4 (auto) |
| `public/audio.ogg` | Input audio | You (place it) |
| `public/pfps/*.{jpg,png}` | Downloaded profile pictures | Step 3 (auto) |
| `out/space-recap.mp4` | Final render | Step 5 (auto) |

All `data/` and `public/` directories are gitignored.

## Tips

1. **Reuse profiles** - If rendering multiple times from the same speaker roster, copy `data/profiles.json` and `public/pfps/` to skip the lookup step.

2. **Keyterms** - Use domain-specific Deepgram keyterms to improve accuracy:
   ```bash
   DEEPGRAM_KEYTERMS="Farcaster,Neynar,Warpcast" npm run transcribe
   ```

3. **Smoke test first** - Always render a 1-3 min segment before committing to a full render. Catches timing/caption bugs early.

4. **Monitor render progress** - Renders are verbose. Watch `render-full.log` for frame/encode progress + ETA.

5. **Fallback avatars** - If a handle is wrong/inactive, the render still works with the default avatar. No breakage, just less visual.

## See also

- [DASHBOARD.md](DASHBOARD.md) - browser UI for speaker confirmation + rendering
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - render timeouts, performance, common errors
- [CUSTOMIZING.md](CUSTOMIZING.md) - reskinning colors, fonts, title, intro/outro
