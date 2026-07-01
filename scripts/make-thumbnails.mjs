// make-thumbnails.mjs - a YouTube thumbnail for the recap + each clip. ffmpeg pulls a frame at the
// midpoint, scripts/thumb.py overlays the arcade title bar (ffmpeg has no drawtext, so PIL).
//   node scripts/make-thumbnails.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")); } catch { return {}; } })();
const content = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "content.json"), "utf8")); } catch { return { clips: [] }; } })();
const TITLE = cfg.title || "Space Recap";

const dur = (f) => parseFloat((spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout || "0").trim()) || 0;

const recap = fs.existsSync(path.join(OUT, "space-recap.mp4")) ? "space-recap.mp4"
  : fs.existsSync(path.join(OUT, "space-recap-bookended.mp4")) ? "space-recap-bookended.mp4" : null;

const targets = [];
if (recap) targets.push({ key: "recap", video: recap, title: TITLE, eyebrow: "ZABAL GAMEZ" });
(content.clips || []).forEach((c, i) => {
  if (fs.existsSync(path.join(OUT, `clip-${i}.mp4`))) targets.push({ key: String(i), video: `clip-${i}.mp4`, title: c.title || TITLE, eyebrow: "ZABAL GAMEZ CLIP" });
});

let made = 0;
for (const t of targets) {
  const vid = path.join(OUT, t.video);
  const mid = Math.max(1, Math.floor(dur(vid) / 2));
  const frame = path.join(OUT, `.thumb-frame-${t.key}.png`);
  const out = path.join(OUT, `thumb-${t.key}.png`);
  const fr = spawnSync("ffmpeg", ["-y", "-ss", String(mid), "-i", vid, "-frames:v", "1", frame], { cwd: ROOT, encoding: "utf8" });
  if (fr.status !== 0) { console.log(`frame extract failed for ${t.key}`); continue; }
  const py = spawnSync("python3", [path.join(ROOT, "scripts", "thumb.py"), frame, out, t.title, t.eyebrow], { cwd: ROOT, encoding: "utf8" });
  try { fs.unlinkSync(frame); } catch {}
  if (py.status === 0 && fs.existsSync(out)) { made++; console.log(`thumb-${t.key}.png`); }
  else console.log(`thumb ${t.key} failed: ${(py.stderr || "").slice(0, 160)}`);
}
console.log(`made ${made}/${targets.length} thumbnails`);
