// content-pass.mjs - one read of the transcript -> data/content.json (clips + chapters + posts +
// youtube pack). Uses an LLM if ANTHROPIC_API_KEY/OPENAI_API_KEY is in .env; otherwise a solid
// heuristic (host-question -> long-answer for clips, question boundaries for chapters, templated
// ZM posts). Brand voice: ZM open, no emojis, no em dashes, no crypto jargon.
//   node scripts/content-pass.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "transcript.json"), "utf8"));
const U = T.results?.utterances ?? [];
const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")); } catch { return {}; } })();
const TITLE = cfg.title || "Space Recap";
const SITE = "https://zabalgamez.com";

const fmt = (s) => { s = Math.max(0, s | 0); const h = (s / 3600) | 0, m = ((s / 60) | 0) % 60, ss = s % 60; return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0"); };

// host = the interviewer, i.e. whoever asks the most questions (not most-spoken - a guest often
// talks more). Count '?' utterances per speaker; fall back to most-spoken if nobody asks questions.
const qCount = {}, time = {};
for (const u of U) {
  if (u.speaker === undefined) continue;
  time[u.speaker] = (time[u.speaker] || 0) + (u.end - u.start);
  if (/\?/.test(u.transcript || "")) qCount[u.speaker] = (qCount[u.speaker] || 0) + 1;
}
const host = Object.keys(qCount).length
  ? Object.keys(qCount).sort((a, b) => qCount[b] - qCount[a])[0]
  : Object.keys(time).sort((a, b) => time[b] - time[a])[0];

// ---- clips: host '?' utterance -> the following long non-host answer ----
function findClips() {
  const out = [];
  for (let i = 0; i < U.length; i++) {
    const q = U[i];
    if (String(q.speaker) !== String(host)) continue;
    const qt = (q.transcript || "").trim();
    if (!/\?/.test(qt) || qt.length < 20) continue;
    let j = i + 1, ans = "", start = null, end = null;
    while (j < U.length && String(U[j].speaker) !== String(host) && ans.length < 700) {
      if (start === null) start = U[j].start;
      end = U[j].end; ans += " " + (U[j].transcript || ""); j++;
    }
    ans = ans.trim();
    if (ans.length > 180 && start !== null) {
      const question = qt.replace(/\s+/g, " ").slice(0, 100);
      out.push({ start: Math.max(0, start - 0.5), end: end + 0.3, at: q.start, ansLen: ans.length,
        title: question.replace(/\?+$/, "") + "?", why: "A substantive answer to a real question - self-contained.",
        quote: ans.replace(/\s+/g, " ").slice(0, 160) });
    }
  }
  return out.sort((a, b) => b.ansLen - a.ansLen).slice(0, 5).sort((a, b) => a.at - b.at)
    .map(({ ansLen, at, ...c }) => c);
}

// ---- chapters: question boundaries, capped, evenly meaningful ----
function findChapters() {
  const qs = U.filter((u) => String(u.speaker) === String(host) && /\?/.test(u.transcript || "") && (u.transcript || "").length > 25);
  const total = T.metadata?.duration || (U.length ? U[U.length - 1].end : 0);
  const picks = [];
  picks.push({ t: 0, label: "Intro" });
  const step = Math.max(1, Math.floor(qs.length / 7));
  for (let i = 0; i < qs.length; i += step) {
    const q = qs[i];
    if (q.start < 20) continue;
    picks.push({ t: q.start, label: (q.transcript || "").replace(/\s+/g, " ").replace(/\?.*$/, "").slice(0, 60).trim() });
    if (picks.length >= 8) break;
  }
  // to youtube timestamp strings
  return picks.map((p) => ({ t: fmt(p.t), label: p.label }));
}

// ---- posts: ZM drafts (brand voice) ----
function makePosts(clips) {
  const posts = [];
  posts.push({ for: "full", text: `ZM\n\nNew recap is up: ${TITLE}.\n\nWorth the watch - real talk, start to finish.\n\n${SITE}/recordings` });
  for (const c of clips.slice(0, 3)) {
    posts.push({ for: c.title, text: `ZM\n\nClip: ${c.title}\n\nOne of the best moments from ${TITLE}. Watch the full session:\n\n${SITE}/recordings` });
  }
  return posts;
}

function heuristic() {
  const clips = findClips();
  const chapters = findChapters();
  const posts = makePosts(clips);
  const desc = [
    `${TITLE}.`, "",
    "Chapters", ...chapters.map((c) => `${c.t} ${c.label}`), "",
    `More: ${SITE}`, `Live: ${SITE}/live`,
  ].join("\n");
  return { generatedBy: "heuristic", title: TITLE, clips, chapters, posts, youtube: { title: TITLE, description: desc } };
}

// LLM hook (optional) - refine the heuristic if a key exists. Kept minimal + safe: on any error,
// return the heuristic. (Full LLM prompt lands in a later tick; the schema is already stable.)
function llmKey() {
  try { const e = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const a = e.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/); const o = e.match(/OPENAI_API_KEY\s*=\s*(.+)/);
    return a ? { kind: "anthropic", key: a[1].trim().replace(/["']/g, "") } : o ? { kind: "openai", key: o[1].trim().replace(/["']/g, "") } : null;
  } catch { return null; }
}

const result = heuristic();
result.hasLLM = !!llmKey(); // reported so the UI can offer an LLM refine later
fs.writeFileSync(path.join(ROOT, "data", "content.json"), JSON.stringify(result, null, 2));
console.log(`content.json: ${result.clips.length} clips, ${result.chapters.length} chapters, ${result.posts.length} posts (by ${result.generatedBy}, llm ${result.hasLLM ? "available" : "none"})`);
for (const c of result.clips) console.log(`  clip ${fmt(c.start)}-${fmt(c.end)}: ${c.title}`);
