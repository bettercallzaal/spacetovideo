---
name: space-recap
description: Walk through the full Juke Space Recap pipeline — transcribe audio, detect guest intros, resolve Farcaster PFPs, and render a 1920×1080 recap video.
---

# Skill: space-recap

Guide the user through the full pipeline to produce a Remotion recap video from a Farcaster space recording. The pipeline has a mandatory human-in-the-loop step (Step 2 review) — don't skip it.

## Before you start

Check prerequisites:

1. Verify `ffmpeg` is on PATH: run `ffmpeg -version` and report the version, or tell the user to install it (`brew install ffmpeg` on Mac).
2. Check `.env` exists and has the three required keys: `DEEPGRAM_API_KEY`, `NEYNAR_API_KEY`, `HOST_USERNAME`. If any are missing, show the user `.env.example` and ask them to fill in the blanks.
3. Check that `public/audio.ogg` exists (or `AUDIO_PATH` is set). If missing, tell the user to copy their recording there.
4. Run `npm install` if `node_modules/` doesn't exist yet.

Only proceed once all four checks pass.

---

## Step 1 — Transcribe

Run:
```
npm run transcribe
```

This calls Deepgram Nova-3 with diarization and utterances enabled. It takes **5–10 minutes for a 2-hour recording** — tell the user to expect this wait. Once it finishes, confirm `data/transcript.json` was written and show the summary output (duration, speaker count, utterance count).

If it fails, the most likely causes are:
- `DEEPGRAM_API_KEY` is wrong or expired
- The audio file is missing or in an unsupported format (supported: .ogg, .mp3, .wav, .m4a)

---

## Step 2 — Detect intros

Run:
```
npm run intros
```

This detects host intro prompts ("who are you?", "what's your name?") and slices a 15-second sample clip per intro into `data/samples/intro_N.mp3`.

**HUMAN REVIEW REQUIRED — do not proceed past this step automatically.**

Tell the user:
1. Open `data/intros.json` in their editor.
2. For each entry, listen to the corresponding `data/samples/intro_N.mp3` clip.
3. Fill in the `"username"` field with the guest's Farcaster handle (no `@`). Leave it blank to skip that intro.
4. Optionally fill in `"display_name"` for guests who aren't on Farcaster.
5. Save the file.

Wait for the user to confirm they've finished the review before continuing.

**Optional helpers** (suggest these if the user is having trouble identifying guests):
- `npm run suggest` — searches Neynar for names extracted from the transcript and writes `data/suggestions.json`
- `npm run review` — flags any filled handles whose accounts have been inactive for >1 year (possible wrong match)
- `tsx scripts/find-user.ts <query>` — quick Neynar search for a specific person

---

## Step 3 — Resolve PFPs

Run:
```
npm run pfps
```

This looks up each filled-in username on Neynar and downloads their profile picture. Writes `data/profiles.json` and `public/pfps/`. Show the user the summary output (guests resolved, any that were not found).

If a username isn't found on Neynar, the script falls back to the default avatar — this is expected for off-platform guests.

---

## Step 4 — Preview

Tell the user to run:
```
npm start
```

This opens Remotion Studio at `http://localhost:3000`. They should scrub through the `SpaceRecap` composition and verify:
- Guest cards appear at the right times
- Captions are readable
- Waveform syncs to audio

If the waveform is missing or the video is slow to preview, they may need to precompute it:
```
npm run waveform
```

---

## Step 5 — Render

Once they're happy with the preview:

**Smoke test first (3 minutes of output, much faster):**
```
npm run render SpaceRecap out/test.mp4 -- --frames=0-5400
```

**Full render:**
```
npm run render SpaceRecap out/space-recap.mp4
```

Warn the user: a 2-hour recording at 1920×1080 @ 30fps takes **3–6 hours on M-series Macs**.

Speed options if they want faster output:
- `--fps=24` → ~20% faster
- `--scale=0.667` → 1280×720, significantly faster

---

## Troubleshooting

| Symptom | Likely fix |
|---------|-----------|
| `DEEPGRAM_API_KEY not set` | Add the key to `.env` |
| `Audio not found` | Copy recording to `public/audio.ogg` or set `AUDIO_PATH` in `.env` |
| `ffmpeg exited` error | Install ffmpeg: `brew install ffmpeg` |
| No intros detected | Host prompts weren't recognized — ask the user what phrases the host used; check `scripts/lib/intro-patterns.ts` |
| Username not found on Neynar | The handle might be different — use `tsx scripts/find-user.ts <name>` to search |
| Render OOM crash | Reduce `Config.setConcurrency` in `remotion.config.ts` (try `2`) |
