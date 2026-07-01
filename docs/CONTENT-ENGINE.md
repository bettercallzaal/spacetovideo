# Content Engine - spec

> Turn one recording (sweet spot ~15 min) into a full content suite from the dashboard:
> a recap video + highlight clips + YouTube chapters + a thumbnail + ready-to-send posts,
> all reviewable before anything goes public. This is the north star for the dashboard.

## Flow (one screen, top to bottom)
1. **Load + transcribe** (DONE) - drop audio at public/audio.ogg -> transcribe -> suggest speakers -> samples.
2. **Confirm speakers** (DONE) - listen + type each handle, inline Farcaster search, never a blank.
3. **Content pass (the brain)** - one LLM read of data/transcript.json outputs a single content.json:
   - `clips`: 3-5 best moments, each `{start, end, title, why, quote}` (find-clips). Reuse the host-question ->
     long-answer heuristic as a fallback if no LLM key.
   - `chapters`: `[{t, label}]` timestamps for the YouTube description.
   - `posts`: a draft ZM cast per clip + one for the full video (brand voice: ZM open, no emoji, no em-dash,
     no crypto jargon, "100+" not a number).
   - `youtube`: title + description (summary + chapters + links) - the auto YouTube pack.
4. **Cut clips** - for each clip, `npx remotion render SpaceRecap out/clip-N.mp4 --frames=A-B`; also an optional
   9:16 vertical crop via ffmpeg for shorts. Per-clip progress + reveal.
5. **Thumbnail** - grab a frame (ffmpeg) + overlay the title via the arcade template (Python PIL) -> out/thumb-N.png.
6. **Render full recap** (DONE) - the hour/segment video.
7. **Bookends** (DONE) - splice intro/outro from config.json.
8. **Publish panel** - copy the YouTube pack, copy each post (for Firefly), reveal every asset, and (site side)
   one-command embed on /recordings/N via the existing ingest-recording.mjs.

## Endpoints to add (dashboard/server.mjs)
- POST /api/content -> run the content pass (LLM or heuristic) -> write data/content.json. GET /api/content -> read it.
- POST /api/clips -> render the clips from content.json (queue, per-clip progress). GET /api/clips/progress.
- POST /api/thumbnail?clip=N -> generate a thumbnail. 
- GET /api/publish -> assemble the copy-paste bundle (youtube pack + posts + asset paths).

## Principles
- Everything REVIEWABLE before public. The engine drafts; the human approves.
- Dependency-free where possible (node built-ins + remotion/ffmpeg/PIL CLIs already here).
- Brand voice hard-coded in the posts prompt (ZM, no emoji/em-dash/jargon, exact spellings).
- Short recordings first - a 15-min recording renders fast and yields the best clip-per-effort.
- No auto-posting to Farcaster from the engine - it produces drafts; posting stays a human action (brand safety).

## Build order (one per loop tick)
1. Content pass endpoint + content.json (the brain) - unlocks clips + chapters + posts + youtube at once.
2. YouTube pack panel (title/desc/chapters copy blocks).
3. Clip cutter (render clips from content.json) + reveal.
4. 9:16 vertical crop option per clip.
5. Thumbnail generator.
6. On-screen chapter-title + pull-quote cards in the recap composition (doc 921) - re-render aware.
7. Publish panel (bundle YouTube pack + posts + assets; embed hook).
8. Recordings library (list out/*.mp4, re-open a past run).
