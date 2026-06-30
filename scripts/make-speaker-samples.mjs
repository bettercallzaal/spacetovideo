// make-speaker-samples.mjs - for each diarized speaker, slice a short audio sample (so a human
// can listen and type the @handle), and write data/speakers-ui.json that the dashboard reads.
// Pulls the auto-suggested handle (name-drop mining) + the current build-speaker-intros map.
//   node scripts/make-speaker-samples.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO = path.join(ROOT, "public", "audio.ogg");
const OUTDIR = path.join(ROOT, "public", "speaker-samples");
fs.mkdirSync(OUTDIR, { recursive: true });

const t = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "transcript.json"), "utf8"));
const u = t.results?.utterances ?? [];
const fmt = (s) => { s = s | 0; return `${(s / 60 | 0)}:${String(s % 60).padStart(2, "0")}`; };

// group by speaker
const sp = {};
for (const x of u) { if (x.speaker === undefined) continue; (sp[x.speaker] ??= []).push(x); }

// suggestions (from auto-suggest-speakers) + current map (from build-speaker-intros.ts)
let sugg = [];
try { sugg = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "speaker-suggestions.json"), "utf8")); } catch {}
const suggBy = Object.fromEntries(sugg.map((s) => [String(s.speaker), s.suggested_username || ""]));
let curMap = {};
try {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "build-speaker-intros.ts"), "utf8");
  const m = src.match(/SPEAKER_TO_USERNAME[^{]*\{([\s\S]*?)\}/);
  if (m) for (const line of m[1].split("\n")) {
    const mm = line.match(/^\s*(\d+)\s*:\s*"([^"]*)"/);
    if (mm) curMap[mm[1]] = mm[2];
  }
} catch {}

const ui = [];
for (const id of Object.keys(sp).sort((a, b) => (sp[b].reduce((s, x) => s + (x.end - x.start), 0)) - (sp[a].reduce((s, x) => s + (x.end - x.start), 0)))) {
  const arr = sp[id];
  const dur = arr.reduce((s, x) => s + (x.end - x.start), 0);
  // pick a substantial utterance to sample (first one >40 chars, else the longest)
  const cand = arr.filter((x) => (x.transcript || "").length > 40).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] || arr[0];
  const start = Math.max(0, cand.start - 0.3);
  const out = path.join(OUTDIR, `sp${id}.mp3`);
  spawnSync("ffmpeg", ["-y", "-ss", String(start), "-i", AUDIO, "-t", "18", "-ac", "1", "-b:a", "96k", out], { stdio: "ignore" });
  ui.push({
    speaker: Number(id),
    minutes: Math.round(dur / 60),
    first_at: fmt(arr[0].start),
    sample: `/speaker-samples/sp${id}.mp3`,
    sample_text: (cand.transcript || "").slice(0, 140),
    suggested: suggBy[id] || "",
    current: curMap[id] || "",
  });
}
fs.writeFileSync(path.join(ROOT, "data", "speakers-ui.json"), JSON.stringify(ui, null, 2));
console.log(`wrote data/speakers-ui.json + ${ui.length} samples in public/speaker-samples/`);
for (const s of ui) console.log(`  sp${s.speaker}: ${s.minutes}min first ${s.first_at}  suggested="${s.suggested}" current="${s.current}"  "${s.sample_text.slice(0, 60)}"`);
