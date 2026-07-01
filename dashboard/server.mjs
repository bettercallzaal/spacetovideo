// Local dashboard for the recap pipeline - press go, watch progress, splice bookends.
// Dependency-free: Node built-ins + the remotion/ffmpeg CLIs already in the project.
//   node dashboard/server.mjs   ->   http://localhost:4747
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const PORT = 4747;

// Fork-friendly config: copy config.example.json -> config.json and set your title +
// intro/outro template paths. Falls back to sensible defaults if absent.
function loadConfig() {
  const def = { title: "Space Recap", intro: "", outro: "" };
  try { return { ...def, ...JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")) }; }
  catch { return def; }
}
const TOTAL_FRAMES = 115055; // SpaceRecap @ 30fps for this AMA; recomputed from the log if present
const RECAP_SEC = 3835; // hour audio duration, for splice % estimate

// ---- helpers ----
function tail(file, bytes = 4000) {
  try {
    const fd = fs.openSync(file, "r");
    const sz = fs.fstatSync(fd).size;
    const start = Math.max(0, sz - bytes);
    const buf = Buffer.alloc(sz - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch { return ""; }
}
function running(pattern) {
  // crude: is a process matching pattern alive? use pgrep
  try {
    const r = spawnSyncText("pgrep", ["-f", pattern]);
    return r.trim().length > 0;
  } catch { return false; }
}
import { spawnSync } from "node:child_process";
function spawnSyncText(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return (r.stdout || "") + (r.status === 0 ? "" : "");
}
function ffprobeDur(file) {
  if (!fs.existsSync(file)) return 0;
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat((r.stdout || "0").trim()) || 0;
}
function fileInfo(file) {
  if (!fs.existsSync(file)) return { exists: false };
  const st = fs.statSync(file);
  const dur = ffprobeDur(file);
  return { exists: true, size: st.size, sizeMB: Math.round(st.size / 1048576), dur: Math.round(dur), valid: dur > 3000 };
}

// ---- render ----
let renderProc = null;
function startRender() {
  if (running("remotion render")) return { ok: false, reason: "already running" };
  try { fs.unlinkSync(path.join(OUT, "space-recap.mp4")); } catch {}
  const log = fs.openSync(path.join(ROOT, "render-full.log"), "w");
  renderProc = spawn("npx", ["remotion", "render", "SpaceRecap", "out/space-recap.mp4", "--concurrency=2", "--timeout=300000"],
    { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  renderProc.unref();
  return { ok: true };
}
function renderProgress() {
  const log = tail(path.join(ROOT, "render-full.log"));
  const isRunning = running("remotion render");
  const rm = [...log.matchAll(/Rendered (\d+)\/(\d+)/g)].pop();
  const em = [...log.matchAll(/Encoded (\d+)\/(\d+)/g)].pop();
  const eta = (log.match(/time remaining: ([0-9hm s]+)/g) || []).pop() || "";
  const errors = (log.match(/Error|Timed out|timeout/gi) || []).length;
  let phase = "idle", frame = 0, total = TOTAL_FRAMES, pct = 0;
  if (em) { phase = "encoding"; frame = +em[1]; total = +em[2]; pct = Math.round((frame / total) * 100); }
  else if (rm) { phase = "rendering"; frame = +rm[1]; total = +rm[2]; pct = Math.round((frame / total) * 100); }
  const file = fileInfo(path.join(OUT, "space-recap.mp4"));
  if (!isRunning && file.valid) { phase = "done"; pct = 100; }
  return { running: isRunning, phase, frame, total, pct, eta: (eta || "").replace("time remaining: ", ""), errors, file };
}

// ---- splice (intro + recap + outro) ----
function startSplice() {
  const cfg = loadConfig();
  const recap = path.join(OUT, "space-recap.mp4");
  const intro = cfg.intro && fs.existsSync(cfg.intro) ? cfg.intro : "";
  const outro = cfg.outro && fs.existsSync(cfg.outro) ? cfg.outro : "";
  if (!fs.existsSync(recap)) return { ok: false, reason: "render the recap first" };
  if (!intro && !outro) return { ok: false, reason: "set intro/outro paths in config.json" };
  if (running("zg_splice")) return { ok: false, reason: "already splicing" };
  try { fs.unlinkSync(path.join(OUT, "space-recap-bookended.mp4")); } catch {}
  const log = fs.openSync(path.join(ROOT, "splice.log"), "w");
  // One ffmpeg pass: scale/pad each clip to 1920x1080, resample audio to 48k, then concat.
  // Handles any input size/codec/rate from a fork's own intro/outro templates.
  const inputs = [intro, recap, outro].filter(Boolean);
  const norm = (i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`;
  const chains = inputs.map((_, i) => norm(i)).join(";");
  const concatIns = inputs.map((_, i) => `[v${i}][a${i}]`).join("");
  const filter = `${chains};${concatIns}concat=n=${inputs.length}:v=1:a=1[v][a]`;
  const args = ["-y"];
  inputs.forEach((f) => args.push("-i", f));
  args.push("-filter_complex", filter, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart",
    "-metadata", "zg_splice=1", "out/space-recap-bookended.mp4");
  const p = spawn("ffmpeg", args, { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true };
}
function spliceProgress() {
  const log = tail(path.join(ROOT, "splice.log"));
  const isRunning = running("zg_splice");
  const t = (log.match(/time=(\d+):(\d+):(\d+)/g) || []).pop();
  let secs = 0;
  if (t) { const m = t.match(/time=(\d+):(\d+):(\d+)/); secs = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); }
  const pct = Math.min(100, Math.round((secs / (RECAP_SEC + 27)) * 100));
  const file = fileInfo(path.join(OUT, "space-recap-bookended.mp4"));
  let phase = isRunning ? "splicing" : (file.valid ? "done" : "idle");
  return { running: isRunning, phase, pct: isRunning ? pct : (file.valid ? 100 : 0), file };
}

// ---- content pass (the brain: transcript -> clips + chapters + posts + youtube) ----
function runContentPass() {
  const r = spawnSync("node", ["scripts/content-pass.mjs"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return { ok: false, reason: (r.stderr || "content pass failed").slice(0, 300) };
  return { ok: true };
}
function getContent() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "content.json"), "utf8")); }
  catch { return null; }
}

// ---- clip cutter (render each content.json clip as a short) ----
function startClips() {
  const c = getContent();
  if (!c || !c.clips?.length) return { ok: false, reason: "run the content pass first" };
  if (running("clip_render")) return { ok: false, reason: "already cutting clips" };
  const cmds = c.clips.map((cl, i) => {
    const a = Math.round(cl.start * 30), b = Math.round(cl.end * 30);
    return `echo "CLIP ${i} START ${a}-${b}" && npx remotion render SpaceRecap out/clip-${i}.mp4 --frames=${a}-${b} --concurrency=2 --timeout=300000 && echo "CLIP ${i} DONE"`;
  }).join(" ; ");
  const sh = `cd ${JSON.stringify(ROOT)} && echo clip_render_marker && ${cmds} ; echo CLIPS_ALL_DONE`;
  const log = fs.openSync(path.join(ROOT, "clips.log"), "w");
  const p = spawn("bash", ["-lc", sh], { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true, count: c.clips.length };
}
function clipsProgress() {
  const c = getContent(); const n = c?.clips?.length || 0;
  const logPath = path.join(ROOT, "clips.log");
  const isRunning = running("clip_render_marker");
  // grep the WHOLE log for the cheap markers (remotion output is too verbose to tail reliably)
  const markers = spawnSync("grep", ["-oE", "CLIP [0-9]+ (START|DONE)|CLIPS_ALL_DONE", logPath], { encoding: "utf8" }).stdout || "";
  const started = new Set([...markers.matchAll(/CLIP (\d+) START/g)].map((m) => m[1]));
  const doneMark = new Set([...markers.matchAll(/CLIP (\d+) DONE/g)].map((m) => m[1]));
  const allDone = /CLIPS_ALL_DONE/.test(markers);
  const frame = (tail(logPath, 2000).match(/Rendered (\d+)\/(\d+)|Encoded (\d+)\/(\d+)/g) || []).pop() || "";
  const clips = [];
  for (let i = 0; i < n; i++) {
    const info = fileInfo(path.join(OUT, `clip-${i}.mp4`));
    let status = "pending";
    if (info.exists && info.dur > 1) status = "done";
    else if (started.has(String(i)) && !doneMark.has(String(i))) status = isRunning ? "rendering" : "failed";
    clips.push({ i, title: c.clips[i]?.title || `clip ${i}`, status, sizeMB: info.exists ? info.sizeMB : 0, dur: info.exists ? info.dur : 0, frame: status === "rendering" ? frame : "" });
  }
  return { running: isRunning, allDone, clips };
}

// ---- publish bundle (everything in one place) ----
function publishBundle() {
  const c = getContent() || {};
  const assets = [];
  const add = (f, label) => { if (fs.existsSync(path.join(OUT, f))) { const info = fileInfo(path.join(OUT, f)); assets.push({ file: f, label, sizeMB: info.sizeMB || 0, dur: info.dur || 0 }); } };
  add("space-recap-bookended.mp4", "Recap (with intro/outro)");
  add("space-recap.mp4", "Recap (raw)");
  const n = c.clips?.length || 0;
  for (let i = 0; i < n; i++) { add(`clip-${i}.mp4`, `Clip ${i}: ${(c.clips[i]?.title || "").slice(0, 40)}`); add(`clip-${i}-vertical.mp4`, `Clip ${i} vertical (9:16)`); }
  for (const t of thumbList()) add(t, "Thumbnail");
  return { youtube: c.youtube || null, posts: c.posts || [], assets };
}
function revealAll() {
  const b = publishBundle();
  for (const a of b.assets) { const f = path.join(OUT, a.file); if (fs.existsSync(f)) spawnSync("open", ["-R", f]); break; }
  // open the out/ folder itself so all assets are visible
  spawnSync("open", [OUT]);
  return { ok: true };
}

// ---- thumbnails (ffmpeg frame + PIL title overlay) ----
function startThumbnails() {
  if (running("make-thumbnails")) return { ok: false, reason: "already making thumbnails" };
  const log = fs.openSync(path.join(ROOT, "thumb.log"), "w");
  const p = spawn("bash", ["-lc", `cd ${JSON.stringify(ROOT)} && node scripts/make-thumbnails.mjs && echo THUMBS_DONE`], { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true };
}
function thumbList() { try { return fs.readdirSync(OUT).filter((f) => /^thumb-.*\.png$/.test(f)).sort(); } catch { return []; } }
function thumbProgress() {
  const log = tail(path.join(ROOT, "thumb.log"), 3000);
  return { running: running("make-thumbnails"), done: /THUMBS_DONE/.test(log), thumbs: thumbList() };
}

// ---- 9:16 vertical crop per clip (for shorts) ----
function startVertical() {
  const c = getContent(); const n = c?.clips?.length || 0;
  const have = [];
  for (let i = 0; i < n; i++) if (fs.existsSync(path.join(OUT, `clip-${i}.mp4`))) have.push(i);
  if (!have.length) return { ok: false, reason: "cut the clips first" };
  if (running("vertical_marker")) return { ok: false, reason: "already making verticals" };
  const cmds = have.map((i) =>
    `echo "VERT ${i} START" && ffmpeg -y -i out/clip-${i}.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920,setsar=1" -c:v libx264 -preset medium -crf 20 -c:a copy out/clip-${i}-vertical.mp4 && echo "VERT ${i} DONE"`
  ).join(" ; ");
  const sh = `cd ${JSON.stringify(ROOT)} && echo vertical_marker && ${cmds} ; echo VERT_ALL_DONE`;
  const log = fs.openSync(path.join(ROOT, "vertical.log"), "w");
  const p = spawn("bash", ["-lc", sh], { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true, count: have.length };
}
function verticalProgress() {
  const c = getContent(); const n = c?.clips?.length || 0;
  const isRunning = running("vertical_marker");
  const clips = [];
  for (let i = 0; i < n; i++) {
    if (!fs.existsSync(path.join(OUT, `clip-${i}.mp4`))) continue;
    const info = fileInfo(path.join(OUT, `clip-${i}-vertical.mp4`));
    clips.push({ i, status: info.exists && info.dur > 1 ? "done" : (isRunning ? "working" : "pending"), sizeMB: info.exists ? info.sizeMB : 0 });
  }
  return { running: isRunning, clips };
}

// ---- transcribe (Step 0: audio -> transcript -> suggestions -> samples) ----
function startTranscribe() {
  if (!fs.existsSync(path.join(ROOT, "public", "audio.ogg"))) return { ok: false, reason: "drop your audio at public/audio.ogg first" };
  if (running("dashboard_transcribe")) return { ok: false, reason: "already transcribing" };
  const log = fs.openSync(path.join(ROOT, "transcribe.log"), "w");
  // dashboard_transcribe marker so pgrep can find this chain; runs the three steps in order.
  const sh = `cd ${JSON.stringify(ROOT)} && echo dashboard_transcribe && npm run transcribe && npm run suggest-speakers && node scripts/make-speaker-samples.mjs && echo TRANSCRIBE_DONE`;
  const p = spawn("bash", ["-lc", sh], { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true };
}
function transcribeProgress() {
  const log = tail(path.join(ROOT, "transcribe.log"), 6000);
  const isRunning = running("dashboard_transcribe");
  const done = /TRANSCRIBE_DONE/.test(log);
  let step = "idle";
  if (!done && isRunning) {
    if (/make-speaker-samples|speakers-ui/i.test(log)) step = "slicing speaker samples";
    else if (/suggest-speakers|name-drop/i.test(log)) step = "suggesting handles";
    else if (/transcrib|deepgram|nova/i.test(log)) step = "transcribing (Deepgram)";
    else step = "starting";
  }
  if (done) step = "done";
  return { running: isRunning, done, step, log: log.split("\n").slice(-5).join("\n") };
}

// ---- Neynar handle search (autocomplete in the speaker step) ----
function neynarKey() {
  try {
    const e = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const m = e.match(/NEYNAR_API_KEY\s*=\s*(.+)/);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch { return ""; }
}
async function neynarSearch(q) {
  const key = neynarKey();
  if (!key || !q || q.length < 2) return [];
  try {
    const r = await fetch("https://api.neynar.com/v2/farcaster/user/search?q=" + encodeURIComponent(q) + "&limit=6",
      { headers: { "x-api-key": key, accept: "application/json" } });
    const d = await r.json();
    return (d.result?.users || []).map((u) => ({ username: u.username, fid: u.fid, display: u.display_name, pfp: u.pfp_url, followers: u.follower_count || 0 }));
  } catch { return []; }
}

// ---- speakers (the human-in-the-loop name step) ----
function getSpeakers() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "speakers-ui.json"), "utf8")); }
  catch { return []; }
}
function startSpeakerBuild(map, display) {
  // map: { "0": "handle", ... }. Every speaker must be non-empty (enforced client-side too).
  fs.writeFileSync(path.join(ROOT, "data", "speaker-map.json"), JSON.stringify(map, null, 2));
  fs.writeFileSync(path.join(ROOT, "data", "speaker-display.json"), JSON.stringify(display || {}, null, 2));
  const log = fs.openSync(path.join(ROOT, "speakers.log"), "w");
  // chain: build-speaker-intros -> pfps. A tiny sh wrapper so both run in order, logged.
  const sh = `cd ${JSON.stringify(ROOT)} && HOST_USERNAME=${JSON.stringify(map["1"] || map["0"] || "zaal")} npx tsx scripts/build-speaker-intros.ts && HOST_USERNAME=${JSON.stringify(map["1"] || "zaal")} npx tsx scripts/3-resolve-pfps.ts && echo "SPEAKER_BUILD_DONE"`;
  const p = spawn("bash", ["-lc", sh], { cwd: ROOT, stdio: ["ignore", log, log], detached: true });
  p.unref();
  return { ok: true };
}
function speakerBuildProgress() {
  const log = tail(path.join(ROOT, "speakers.log"), 6000);
  const done = /SPEAKER_BUILD_DONE/.test(log);
  const isRunning = running("build-speaker-intros") || running("3-resolve-pfps");
  let step = "idle";
  if (/3-resolve-pfps|pfp/i.test(log) && !done) step = "resolving pfps";
  else if (/build-speaker-intros|guest runs/i.test(log) && !done) step = "building segments";
  if (done) step = "done";
  // count resolved pfps
  let resolved = 0, defaults = 0;
  try { const p = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "profiles.json"), "utf8")); const seen = new Set(); for (const g of p.guests) { if (seen.has(g.username)) continue; seen.add(g.username); if (g.pfp_path.includes("default")) defaults++; else resolved++; } } catch {}
  return { running: isRunning, step, done, resolved, defaults, log: log.split("\n").slice(-6).join("\n") };
}

function reveal(rel) {
  const f = path.join(OUT, path.basename(rel));
  if (fs.existsSync(f)) spawn("open", ["-R", f]);
}

// ---- server ----
const INDEX = path.join(ROOT, "dashboard", "index.html");
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const send = (obj, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && u.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" }); res.end(fs.readFileSync(INDEX)); return;
  }
  // serve speaker audio samples
  if (req.method === "GET" && u.pathname.startsWith("/speaker-samples/")) {
    const f = path.join(ROOT, "public", "speaker-samples", path.basename(u.pathname));
    if (fs.existsSync(f)) { res.writeHead(200, { "content-type": "audio/mpeg" }); fs.createReadStream(f).pipe(res); return; }
    res.writeHead(404); res.end("no sample"); return;
  }
  if (u.pathname === "/api/config") return send({ title: loadConfig().title, hasIntro: !!loadConfig().intro && fs.existsSync(loadConfig().intro), hasOutro: !!loadConfig().outro && fs.existsSync(loadConfig().outro), hasAudio: fs.existsSync(path.join(ROOT, "public", "audio.ogg")) });
  if (u.pathname === "/api/neynar/search") { neynarSearch(u.searchParams.get("q") || "").then((r) => send(r)); return; }
  if (u.pathname === "/api/content" && req.method === "POST") return send(runContentPass());
  if (u.pathname === "/api/content" && req.method === "GET") return send(getContent() || {});
  if (u.pathname === "/api/clips" && req.method === "POST") return send(startClips());
  if (u.pathname === "/api/clips/progress") return send(clipsProgress());
  if (u.pathname === "/api/clips/vertical" && req.method === "POST") return send(startVertical());
  if (u.pathname === "/api/clips/vertical/progress") return send(verticalProgress());
  if (u.pathname === "/api/thumbnail" && req.method === "POST") return send(startThumbnails());
  if (u.pathname === "/api/thumbnail/progress") return send(thumbProgress());
  if (u.pathname === "/api/publish") return send(publishBundle());
  if (u.pathname === "/api/publish/reveal" && req.method === "POST") return send(revealAll());
  // serve out/ images (thumbnail previews)
  if (req.method === "GET" && u.pathname.startsWith("/out/")) {
    const f = path.join(OUT, path.basename(u.pathname));
    if (fs.existsSync(f)) { res.writeHead(200, { "content-type": f.endsWith(".png") ? "image/png" : "application/octet-stream" }); fs.createReadStream(f).pipe(res); return; }
    res.writeHead(404); res.end("no file"); return;
  }
  if (u.pathname === "/api/transcribe/progress") return send(transcribeProgress());
  if (req.method === "POST" && u.pathname === "/api/transcribe") return send(startTranscribe());
  if (u.pathname === "/api/speakers" && req.method === "GET") return send(getSpeakers());
  if (u.pathname === "/api/speakers/progress") return send(speakerBuildProgress());
  if (u.pathname === "/api/speakers" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
      try { const { map, display } = JSON.parse(body || "{}"); send(startSpeakerBuild(map, display)); }
      catch (e) { send({ ok: false, reason: String(e) }, 400); }
    }); return;
  }
  if (u.pathname === "/api/render/progress") return send(renderProgress());
  if (u.pathname === "/api/splice/progress") return send(spliceProgress());
  if (req.method === "POST" && u.pathname === "/api/render") return send(startRender());
  if (req.method === "POST" && u.pathname === "/api/splice") return send(startSplice());
  if (req.method === "POST" && u.pathname === "/api/reveal") return send((reveal(u.searchParams.get("f") || ""), { ok: true }));
  res.writeHead(404); res.end("not found");
});
srv.listen(PORT, () => console.log(`\n  Recap dashboard -> http://localhost:${PORT}\n  (Ctrl+C to stop)\n`));
