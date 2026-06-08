/**
 * Diagnostic: summarize Deepgram diarization by speaker_id so a human can
 * map speaker_ids -> @usernames.
 *
 * Prints, per speaker: total spoken duration, first/last timestamp, utterance
 * count, and the first N utterances (so name-drops + style are visible).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

type Utterance = {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
};

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function main() {
  const txt = await readFile(path.join(ROOT, "data", "transcript.json"), "utf8");
  const data = JSON.parse(txt);
  const utterances: Utterance[] = data.results?.utterances ?? [];

  const bySpeaker = new Map<number, Utterance[]>();
  for (const u of utterances) {
    if (u.speaker === undefined) continue;
    const arr = bySpeaker.get(u.speaker) ?? [];
    arr.push(u);
    bySpeaker.set(u.speaker, arr);
  }

  const totalDur = data.metadata?.duration ?? 0;
  console.log(`Total duration: ${fmt(totalDur)} (${totalDur.toFixed(1)}s)\n`);

  const summary: Array<{
    speaker: number;
    duration: number;
    count: number;
    first: number;
    last: number;
  }> = [];

  for (const [speaker, us] of bySpeaker) {
    const dur = us.reduce((acc, u) => acc + (u.end - u.start), 0);
    summary.push({
      speaker,
      duration: dur,
      count: us.length,
      first: us[0].start,
      last: us[us.length - 1].end,
    });
  }
  summary.sort((a, b) => b.duration - a.duration);

  console.log("SPEAKER SUMMARY (sorted by total spoken duration):");
  console.log("speaker | duration | utterances | first  | last");
  console.log("--------|----------|------------|--------|--------");
  for (const s of summary) {
    console.log(
      `${String(s.speaker).padStart(7)} | ${fmt(s.duration).padStart(8)} | ${String(s.count).padStart(10)} | ${fmt(s.first).padStart(6)} | ${fmt(s.last).padStart(6)}`,
    );
  }

  console.log("\n\n=== PER-SPEAKER UTTERANCES ===\n");
  for (const s of summary) {
    const us = bySpeaker.get(s.speaker)!;
    console.log(`\n--- Speaker ${s.speaker}  (${us.length} utts, ${fmt(s.duration)} total) ---`);
    // Print first 15 utterances + a few from later in the audio
    const sample = [
      ...us.slice(0, 15),
      ...(us.length > 30 ? [{ start: -1, end: -1, transcript: "  ...  " } as Utterance, ...us.slice(Math.floor(us.length / 2), Math.floor(us.length / 2) + 5)] : []),
      ...(us.length > 40 ? [{ start: -1, end: -1, transcript: "  ...  " } as Utterance, ...us.slice(-5)] : []),
    ];
    for (const u of sample) {
      const ts = u.start < 0 ? "      " : `[${fmt(u.start)}]`;
      console.log(`  ${ts} ${u.transcript}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
