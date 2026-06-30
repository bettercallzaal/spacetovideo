# Dashboard Guide

The dashboard is a local browser UI for the spacetovideo pipeline. It guides you through speaker confirmation, rendering, and optional intro/outro splicing.

## Starting the dashboard

```bash
node dashboard/server.mjs
```

Opens at `http://localhost:4747`. Keep it running while you work; it manages background processes and shows live progress.

The dashboard assumes:
- Audio file is at `public/audio.ogg`
- Transcription has completed (`data/transcript.json` exists)
- You're on the speaker-confirmation step

## Three-step workflow

### Step 1: Confirm the speakers

Listen to audio samples for each diarized speaker and fill in their Farcaster handle.

The dashboard shows:

- Speaker ID (sp0, sp1, sp2, ...)
- Duration of talk (e.g., "4m")
- Time of first appearance (e.g., "1:23")
- 30-second audio sample (from the start of their segment)
- Text input for the Farcaster handle

**Rules:**

- Every speaker must have a handle. No "Guest" or "Unknown".
- Handles are case-insensitive; @ symbol is optional.
- If you don't know who a speaker is, use a placeholder or skip them (leave blank).

**How it works:**

1. Click "play" on each sample to hear the voice.
2. Type the handle. The dashboard auto-suggests matches from Neynar.
3. If auto-suggest is wrong, type the correct handle.
4. Leave blank if you don't recognize the voice.

Example:

```
sp0 · 4m · 1:23    [play button]    zaal         [speaker 0 is zaal]
sp1 · 8m · 5:45    [play button]    bennyj504    [speaker 1 is bennyj504]
sp2 · 2m · 14:10   [play button]    [empty]      [speaker 2 is unknown]
```

Once all non-empty fields are filled with valid handles, the "Build speakers" button enables.

### Step 1b: Build speakers

Click "Build speakers" to:

1. Read your confirmed handles from the dashboard
2. Write `data/speaker-map.json` and `data/speaker-display.json`
3. Trigger profile resolution (Neynar lookup + PFP download)
4. Show live progress

The dashboard polls and displays:

```
building... Resolving pfps (3/5 done)
```

When done:

```
done · 5 pfps resolved, 0 default
```

If any handles failed to resolve (e.g., inactive, misspelled), the dashboard warns:

```
3 speaker(s) fell back to a default avatar - check the handle is exact, then rebuild.
```

Double-check the spelling and click "Build speakers" again. Once all speakers are resolved, the dashboard unlocks Step 2.

### Step 2: Render the hour

Renders the full Remotion composition to MP4.

Click "Render" to:

1. Start `npx remotion render SpaceRecap out/space-recap.mp4 --concurrency=2 --timeout=300000`
2. Run detached (survives terminal close)
3. Log to `render-full.log`

The dashboard polls every 2 seconds and shows:

```
rendering · Frame 1234/115055 (progress bar) · ETA 2h 30m
```

When the render encode phase starts:

```
encoding · Frame 5000/5400 (progress bar)
```

When done:

```
done · 3.2 GB  (file size and download link)
```

**While rendering:**

- Don't kill the terminal; the process runs detached
- Close the browser; the render continues
- Multiple renders in parallel will fight for CPU (don't do this)

**If render fails:**

Check `render-full.log` for errors. Common issues:

- Timeout: increase `--timeout=300000` in the dashboard code or re-run the render
- OOM: reduce `--concurrency` (try `--concurrency=1`)
- Audio issues: verify `public/audio.ogg` is valid (test with `ffplay public/audio.ogg`)

### Step 3: Add intro + outro (optional)

Splice branded intro/outro templates onto the final render.

The dashboard assumes:

- Intro template at `out/parts/intro-norm.mp4`
- Outro template at `out/parts/outro-norm.mp4`
- Final render at `out/space-recap.mp4`

If templates don't exist, the step is locked.

Click "Add bookends" to:

1. Run ffmpeg concat: `[intro] + [recap] + [outro]`
2. Encode to MP4 with H.264 + AAC
3. Output to `out/space-recap-bookended.mp4`

Expect ~30-60 min for the concat+encode.

The dashboard shows progress:

```
encoding · 1:23 / 2:05 (progress bar)
```

When done:

```
done · 4.1 GB  (download link)
```

## API endpoints (reference)

The dashboard calls these REST endpoints in `dashboard/server.mjs`:

### GET /api/speakers

Returns list of diarized speakers with samples.

Response:

```json
[
  {
    "speaker": 0,
    "minutes": 4,
    "first_at": "1:23",
    "sample": "/samples/intro_0.mp3",
    "suggested": "zaal",
    "current": ""
  }
]
```

### POST /api/speakers

Confirms speaker handles and triggers profile resolution.

Request:

```json
{
  "map": {
    "0": "zaal",
    "1": "bennyj504",
    "2": ""
  },
  "display": {
    "0": "Zaal"
  }
}
```

Writes `data/speaker-map.json` and `data/speaker-display.json`, then spawns the PFP resolution process.

### GET /api/speakers/progress

Polls speaker resolution progress.

Response:

```json
{
  "running": true,
  "step": "Resolving pfps (3/5 done)",
  "done": false,
  "resolved": 3,
  "defaults": 0
}
```

Or when done:

```json
{
  "running": false,
  "step": "Done",
  "done": true,
  "resolved": 5,
  "defaults": 0
}
```

### POST /api/render

Starts the full Remotion render (detached).

```bash
curl -X POST http://localhost:4747/api/render
```

Spawns:

```
npx remotion render SpaceRecap out/space-recap.mp4 --concurrency=2 --timeout=300000
```

### GET /api/render/progress

Polls render progress.

Response:

```json
{
  "running": true,
  "phase": "rendering",
  "frame": 1234,
  "total": 115055,
  "pct": 1,
  "eta": "2h 30m",
  "errors": 0,
  "file": { "exists": false }
}
```

Or when done:

```json
{
  "running": false,
  "phase": "done",
  "pct": 100,
  "eta": "",
  "errors": 0,
  "file": {
    "exists": true,
    "size": 3355443200,
    "sizeMB": 3200,
    "dur": 3835,
    "valid": true
  }
}
```

### POST /api/splice

Starts intro + outro concat (detached).

```bash
curl -X POST http://localhost:4747/api/splice
```

### GET /api/splice/progress

Polls splice progress.

Response:

```json
{
  "running": true,
  "pct": 45,
  "eta": "15m",
  "file": { "exists": false }
}
```

## Data persistence

The dashboard writes three files to persist choices:

- `data/speaker-map.json` - speaker_id -> Farcaster handle
- `data/speaker-display.json` - speaker_id -> optional display label
- `data/profiles.json` - resolved profiles (populated by step 1b)

These feed into the render; if you re-run the dashboard, your choices are loaded.

## Logs

The dashboard writes logs to:

- `render-full.log` - Remotion render output (verbose; useful for debugging timeouts)
- `splice.log` - ffmpeg concat output

Tail them to monitor progress:

```bash
tail -f render-full.log
tail -f splice.log
```

## Customizing the dashboard

Edit `dashboard/server.mjs` to:

- Change the port (default 4747)
- Adjust Remotion flags (`--concurrency`, `--timeout`)
- Change intro/outro paths or concat filters
- Add additional steps (e.g., upload to YouTube)

Edit `dashboard/index.html` to:

- Change colors + branding (see `:root` CSS variables)
- Add form fields or progress indicators
- Reorganize the three-step layout

The server and frontend are decoupled; edit either without recompiling.

## Troubleshooting the dashboard

**"Dashboard won't start"**
- Check port 4747 is not in use: `lsof -i :4747`
- Verify Node.js 20+ is installed

**"Speakers aren't loading"**
- Ensure `data/transcript.json` exists (run `npm run transcribe` first)
- Check console for error messages

**"Build speakers is stuck"**
- PFP resolution can hang if Neynar is down
- Kill the server + process: `lsof -i :4747`, `kill <pid>`
- Check handles for typos
- Retry

**"Render won't start"**
- Verify `public/audio.ogg` exists and is valid
- Run `npm run waveform` (required for long audio)
- Check `render-full.log` for specific errors
- Try a smoke test first: `npm run render ... -- --frames=0-5400`

**"File sizes are wrong in the dashboard"**
- The dashboard caches file size. Refresh the page or restart `node dashboard/server.mjs`.

## Advanced: Running the pipeline without the dashboard

You can run the CLI directly:

```bash
npm run transcribe
npm run suggest-speakers
npm run pfps
npm run waveform
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
```

The dashboard is purely optional; it's a UX layer over these CLI commands.
