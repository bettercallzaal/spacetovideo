/**
 * Variant of step 2 for hosted FC Spaces (not roving-host walkaround):
 * speaker_ids are known up-front, so we skip intro detection entirely and
 * just turn each non-host speaker-run into an intros.json entry.
 *
 * Run order:
 *   1) npm run transcribe
 *   2) tsx scripts/build-speaker-intros.ts
 *   3) npm run pfps
 */

import { config as loadEnv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

// Manual mapping derived by running `npm run transcribe` then inspecting
// data/transcript.json to see which speaker_id is which person.
// Fill this in before running this script.
let SPEAKER_TO_USERNAME: Record<number, string> = {
  1: "zaal",            // host - BetterCallZaal
  2: "farcaster",       // The Farcaster Intern (the guest)
  0: "imanafrikah",     // intro music Zaal played - "Music by Iman"
  3: "bennyj504",       // Benny J ("What up, Benny?")
  4: "mxjxn",           // channel-debate asker
  5: "topocount.eth",   // topocount - was wrongly left as "Guest"; he spoke (channel debate)
};

// Optional per-speaker display label, shown on the card instead of the @handle.
let SPEAKER_DISPLAY: Record<number, string> = {
  0: "Music by Iman",
};

// Dashboard override: if data/speaker-map.json exists (written by the dashboard's speaker
// step), it takes precedence - that is how a human-confirmed map drives the build.
import { readFileSync } from "node:fs";
try { SPEAKER_TO_USERNAME = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "data", "speaker-map.json"), "utf8")); } catch {}
try { SPEAKER_DISPLAY = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "data", "speaker-display.json"), "utf8")); } catch {}

const HOST_USERNAME = process.env.HOST_USERNAME ?? "";
if (!HOST_USERNAME) {
  console.error("HOST_USERNAME not set — add it to .env");
  process.exit(1);
}

// Merge consecutive same-speaker utterances unless the silence between them
// exceeds this; keeps the GuestCard from flickering on every breath pause.
const RUN_MERGE_GAP_MS = 3000;

// Pad short single-utterance bursts so a one-second comment still gets a visible
// card (otherwise GuestCard flashes in for <1s, useless).
const MIN_RUN_MS = 1500;

type Utterance = {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
};

type IntroEntry = {
  id: number;
  start_ms: number;
  end_ms: number;
  host_speaker_id: number | null;
  host_prompt: string;
  candidate_name: string | null;
  candidate_raw: string;
  context_snippet: string;
  sample_audio: string;
  username: string;
  display_name: string;
};

type SpeakerRun = {
  speaker: number;
  start_ms: number;
  end_ms: number;
  transcript: string;
};

function buildRuns(utterances: Utterance[]): SpeakerRun[] {
  const runs: SpeakerRun[] = [];
  for (const u of utterances) {
    if (u.speaker === undefined) continue;
    const startMs = Math.round(u.start * 1000);
    const endMs = Math.round(u.end * 1000);
    const last = runs[runs.length - 1];
    if (last && last.speaker === u.speaker && startMs - last.end_ms <= RUN_MERGE_GAP_MS) {
      last.end_ms = endMs;
      last.transcript += " " + u.transcript;
    } else {
      runs.push({
        speaker: u.speaker,
        start_ms: startMs,
        end_ms: endMs,
        transcript: u.transcript,
      });
    }
  }
  return runs;
}

async function main() {
  const txt = await readFile(path.join(ROOT, "data", "transcript.json"), "utf8");
  const data = JSON.parse(txt);
  const utterances: Utterance[] = data.results?.utterances ?? [];
  if (utterances.length === 0) {
    console.error("No utterances in transcript.json. Run `npm run transcribe` first.");
    process.exit(1);
  }

  const hostSpeakerId = Number(
    Object.entries(SPEAKER_TO_USERNAME).find(([, u]) => u === HOST_USERNAME)?.[0] ?? -1,
  );
  if (hostSpeakerId < 0) {
    console.error(`HOST_USERNAME ${HOST_USERNAME} not in SPEAKER_TO_USERNAME map`);
    process.exit(1);
  }

  const runs = buildRuns(utterances);
  const nonHostRuns = runs.filter((r) => r.speaker !== hostSpeakerId);

  const intros: IntroEntry[] = nonHostRuns.map((run, i) => {
    const username = SPEAKER_TO_USERNAME[run.speaker] ?? "";
    const padded = Math.max(run.end_ms, run.start_ms + MIN_RUN_MS);
    return {
      id: i,
      start_ms: run.start_ms,
      end_ms: padded,
      host_speaker_id: hostSpeakerId,
      host_prompt: "",
      candidate_name: null,
      candidate_raw: run.transcript.slice(0, 240),
      context_snippet: `[speaker ${run.speaker}] ${run.transcript.slice(0, 200)}`,
      sample_audio: "",
      username,
      display_name: SPEAKER_DISPLAY[run.speaker] ?? "",
    };
  });

  // Stitch overlaps: if a later non-host run starts before the previous one ends
  // (rare, but Deepgram can produce slight overlaps on interruptions), clip
  // the earlier one so useActiveGuest's linear scan is deterministic.
  for (let i = 0; i < intros.length - 1; i++) {
    if (intros[i].end_ms > intros[i + 1].start_ms) {
      intros[i].end_ms = intros[i + 1].start_ms;
    }
  }

  const outPath = path.join(ROOT, "data", "intros.json");
  await writeFile(outPath, JSON.stringify(intros, null, 2));

  const counts = new Map<number, number>();
  for (const r of nonHostRuns) counts.set(r.speaker, (counts.get(r.speaker) ?? 0) + 1);
  console.log(`Wrote ${intros.length} guest runs → data/intros.json`);
  console.log(`Host speaker_id: ${hostSpeakerId} (@${HOST_USERNAME})`);
  for (const [speaker, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  speaker ${speaker} (@${SPEAKER_TO_USERNAME[speaker]}): ${n} runs`);
  }
  console.log(`\nNext: HOST_USERNAME=${HOST_USERNAME} npm run pfps`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
