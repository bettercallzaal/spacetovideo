# Troubleshooting

Hard-won lessons from rendering large Remotion videos. These are real issues that occur in production.

## Render Timeouts Under Load

**Symptom:** Render hangs on a random frame, then times out after `--timeout` seconds.

```
Frame 12345/115055 ... [hung] ... Timed out
```

**Why:** Remotion spins up Chromium instances per frame. Under high system load (low RAM, high CPU pressure), a page-evaluate operation (JS execution in browser context) exceeds the timeout. This is NOT a file issue; it's resource pressure.

**Solution:**

1. **Lower concurrency** - reduce parallel Chromium instances:
   ```bash
   npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
   ```
   Concurrency defaults to CPU count; on a 16-core machine, that's 16 parallel browsers = high memory pressure. Use 2-4 for stability.

2. **Increase timeout** - give each frame more time:
   ```bash
   npm run render SpaceRecap out/space-recap.mp4 -- --timeout=600000  # 10 min
   ```

3. **Run nothing else** - close Slack, browser tabs, other renders. The machine should be idle except for the render.

4. **If it fails 3x** - it's the machine, not the file. Move to:
   - A faster machine (higher single-thread perf)
   - Remotion Lambda (cloud render)
   - Lower resolution/FPS as a fallback

**Example flow:**

```bash
# First attempt: default concurrency
npm run render SpaceRecap out/space-recap.mp4 -- --timeout=300000
# -> timeout on frame 5432

# Attempt 2: lower concurrency
npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000
# -> success (took 4 hours)
```

## Per-Frame Animation Performance

**Symptom:** Render is extremely slow (10+ hours) even though specs look fine. Encoding is fast, but rendering phase crawls.

```
Rendering frame 1234/115055 (< 0.5 FPS)
```

**Why:** Each component is re-evaluated per frame. If a child component uses `spring()` or `interpolate()` per-word in a caption list, the recalculation compounds:

- 1 spring per caption word = 100+ springs
- 30 FPS render = 3000 spring evaluations
- Large captions = 52 min -> 3+ hours

**Solution:**

1. **Avoid per-frame springs on large lists** - pre-compute animations as static CSS or SVG instead.
2. **Check component render counts** - use React DevTools Profiler to see which components re-render per frame.
3. **Use memoization** - wrap expensive components in `React.memo()`.

**Example fix:**

Bad (per-word spring):
```tsx
{words.map((w, i) => (
  <span key={i} style={{ opacity: spring(/* per-frame calc */) }}>
    {w}
  </span>
))}
```

Good (static animation, computed upfront):
```tsx
{words.map((w, i) => (
  <span key={i} style={{ opacity: interpolate(frame, [start, start+30], [0, 1]) }}>
    {w}
  </span>
))}
```

## Detached Render Survival

**Symptom:** Terminal closes; render dies. Work is lost.

**Why:** By default, Remotion inherits the parent process's stdio. When the shell exits, all children terminate.

**Solution:** Run detached with output redirection:

```bash
nohup npm run render SpaceRecap out/space-recap.mp4 -- --concurrency=2 --timeout=300000 > render.log 2>&1 &
disown
```

Then:

```bash
tail -f render.log         # Watch progress
ps aux | grep remotion     # Check if still running
kill <pid>                 # Kill if needed
```

The process runs independent of the terminal. The MP4 is only valid after the render process fully exits (include the encode phase). Monitor `render.log` for the final "Wrote" message.

## No Farcaster Spaces API

**Symptom:** You want to auto-fetch who spoke in a Space, but Farcaster has no public roster API.

**Why:** Farcaster Spaces are real-time streams. There is no way to query "who joined this Space" after the fact. The protocol has no Space-member table.

**Solution:** Manual speaker confirmation (the dashboard) or auto-suggest (mine from host intros). Both require human review of ambiguous cases.

This is why the pipeline has two paths:

1. **Roving-host** (simple: detect "who are you?" prompts)
2. **Hosted Space** (complex: mine name-drops + auto-suggest)

Neither is fully automatic. Accept this limitation; it's fundamental to the Farcaster protocol.

## Profile Picture (PFP) Fallback Chain

**Symptom:** "pfp source failed for @alice ... recovered via unavatar/farcaster"

**Why:** Some PFP hosts (e.g., seadn.io for NFT avatars) block direct fetches or require special headers.

**Solution:** The script tries three sources in order:

1. Neynar's pfp_url (fast, but sometimes fails)
2. unavatar.io/farcaster/{handle} (Farcaster-specific proxy; reaches seadn.io + others)
3. unavatar.io/x/{handle} (X/Twitter handle if it matches FC handle)
4. Fallback: default-avatar.png (1x1 transparent pixel)

If the first fails, the second or third usually succeeds. No action needed; the render still works with the fallback. Just note in your output notes that some images weren't fetched.

**If all fail:**

- The default avatar (transparent 1x1 PNG) is used
- The render works but the speaker card shows no image
- Not a fatal error

## Speaker Detection Accuracy

### Roving-host intro detection (Path B)

**Issue:** Detection misses guests or mistakes context.

**Causes:**

- Host doesn't explicitly ask "who are you?" (or uses different wording)
- Guest speaks off-mic or very quietly
- Multiple people in one intro
- Deepgram mishears the name

**Mitigations:**

1. Manual review - listen to samples before confirming
2. Fix `intro-patterns.js` if the host uses non-standard phrasing
3. Use `npm run fixup` to correct Deepgram mishears
4. For hosted Spaces, use Path A (auto-suggest) instead

### Hosted Space speaker suggestion (Path A)

**Issue:** Auto-suggest mines wrong names or misses speakers.

**Causes:**

- Host says "what up Pizza" (food, not a name)
- Guest's self-intro is ambiguous ("I'm here for the vibes")
- Name-drops from unrelated context ("my friend X")

**Mitigations:**

1. Review suggestions before confirming
2. Use Neynar's suggested handle (auto-suggest picks the best match)
3. If suggestions are all wrong, fill in the speaker map manually
4. Accept that off-mic speakers will be missed

## Audio Format Issues

**Symptom:** Transcription fails or audio plays at wrong speed.

**Why:** Different audio formats (`.mp3`, `.ogg`, `.m4a`, `.wav`) have different codecs and metadata.

**Solution:**

1. Check file validity:
   ```bash
   ffplay public/audio.ogg
   ffprobe -v error -show_entries format=duration public/audio.ogg
   ```

2. Transcode to standard format if needed:
   ```bash
   ffmpeg -i original.m4a -c:a libopus -b:a 128k public/audio.ogg
   ```

3. Re-run transcription:
   ```bash
   npm run transcribe
   ```

## Deepgram Transcription Fails

**Symptom:** "Deepgram API error" or timeout.

**Causes:**

- Invalid API key
- Audio too large (>6 hours) for async job
- Deepgram service down

**Solutions:**

1. Verify API key in `.env`:
   ```bash
   grep DEEPGRAM_API_KEY .env
   ```

2. Check Deepgram status at https://status.deepgram.com

3. For large audio, split manually:
   ```bash
   ffmpeg -i large.ogg -f segment -segment_time 3600 -c copy part_%02d.ogg
   npm run transcribe -- part_00.ogg  # repeat for each part
   ```

4. Contact Deepgram support if limits are exceeded

## Neynar Lookups Fail

**Symptom:** "handle not found on Neynar" for valid Farcaster users.

**Causes:**

- User doesn't exist on Neynar (rare; they mirror the protocol)
- Handle is misspelled (case-insensitive, but typos matter)
- Neynar API is rate-limited

**Solutions:**

1. Double-check spelling (no @ symbol):
   ```bash
   tsx scripts/find-user.ts bennyj504   # quick lookup
   ```

2. Wait a few minutes if rate-limited (default limit: 10,000 API calls/day on free tier)

3. Upgrade Neynar plan if you hit limits

4. Use the default avatar fallback (render still works)

## Waveform Precomputation Hangs

**Symptom:** `npm run waveform` never finishes.

**Why:** FFT computation on large audio can be slow or crash if out of memory.

**Solution:**

1. Kill the process and try again with lower resolution:
   Edit `scripts/7-precompute-waveform.ts`, reduce FFT bin count or frame rate.

2. For very long audio (>4hr), the JSON file gets huge. Try:
   ```bash
   # Use a lower sample rate (every 2 frames instead of 1)
   # Edit the script and re-run
   npm run waveform
   ```

3. If still too slow, skip precomputation (for short audio <15 min) or move to a faster machine.

## Remotion Studio Won't Start

**Symptom:** `npm start` fails or port 3000 is in use.

**Solutions:**

1. Check port:
   ```bash
   lsof -i :3000
   kill <pid>
   ```

2. Verify Node.js 20+:
   ```bash
   node --version
   ```

3. Clear Remotion cache:
   ```bash
   rm -rf node_modules/.cache/
   npm start
   ```

## MP4 Encoding Is Slow

**Symptom:** Render finishes quickly, but encoding phase takes hours.

**Why:** H.264 encoding is inherently slow. It's single-threaded and I/O bound.

**Solutions:**

1. Lower resolution or FPS (done at render time):
   ```bash
   npm run render ... -- --scale=0.667 --fps=24
   ```

2. Use ffmpeg preset `fast` instead of `medium` (see `dashboard/server.mjs`):
   ```bash
   -preset fast  # vs -preset medium
   ```

3. Accept it - 1-2 hours is normal for a 2-hour video.

## Out of Disk Space

**Symptom:** Render fails with "No space left on device" partway through.

**Why:** Full render needs ~10-20 GB temp space + final MP4.

**Solution:**

1. Check disk:
   ```bash
   df -h /  # or the mount where out/ lives
   ```

2. Free space or move `out/` to a different disk:
   ```bash
   mkdir /mnt/large-disk/renders
   ln -s /mnt/large-disk/renders out
   npm run render ...
   ```

## Memory / OOM During Render

**Symptom:** Process killed with "Killed" or "Out of memory".

**Why:** High concurrency spins up many Chromium instances, each consuming ~300-500 MB.

**Solution:**

1. Lower concurrency:
   ```bash
   npm run render ... -- --concurrency=1
   ```

2. Close other apps to free RAM.

3. Use a machine with more RAM (or Remotion Lambda).

## File Corruption / MP4 Won't Play

**Symptom:** Render completes but MP4 is unplayable or very short.

**Why:** Process was killed during encoding; the MP4 header is incomplete.

**Solution:**

1. Don't interrupt the render. Wait for the final "Wrote" message in logs.

2. If interrupted, delete the broken MP4 and re-render:
   ```bash
   rm out/space-recap.mp4
   npm run render ...
   ```

## Ffmpeg / ffprobe Not Found

**Symptom:** "ffmpeg: command not found" during waveform or audio slicing.

**Solution:**

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
apt-get install ffmpeg

# Or download from https://ffmpeg.org/download.html and add to PATH
```

Verify:

```bash
which ffmpeg
ffmpeg -version
```

## Still Stuck?

1. Check `render-full.log` for the exact error
2. Run a smoke test (3-min render) to isolate issues
3. Verify all env vars are set: `env | grep -E "DEEPGRAM|NEYNAR|HOST"`
4. Try on a different machine or cloud (Remotion Lambda)
5. Open an issue on GitHub with logs + exact command

## See also

- [PIPELINE.md](PIPELINE.md) - full walkthrough
- [DASHBOARD.md](DASHBOARD.md) - UI reference
- [README.md](../README.md) - quickstart
